/**
 * Socket.io Server Implementation
 *
 * Handles all real-time communication for TeamChat including:
 * - User presence (online/offline status)
 * - Room-based messaging (channels and DMs)
 * - Typing indicators with debouncing
 * - WebRTC call signaling (offer/answer/ICE exchange)
 *
 * Socket rooms follow the pattern:
 * - user:{userId} - Personal room for direct notifications
 * - channel:{channelId} - Channel message broadcasts
 * - dm:{dmThreadId} - Direct message broadcasts
 * - call:{callId} - Active call participants
 *
 * @module apps/api/src/socket/index
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { redis, setUserOnline, setUserOffline, setTyping, clearTyping } from '../lib/redis.js';
import { isTailscaleOrigin } from '../lib/tailscale.js';
import { config } from '../lib/config.js';
import { SOCKET_EVENTS } from '@teamchat/shared';
import type {
  JoinChannelInput,
  JoinDmInput,
  TypingInput,
  CallOfferInput,
  CallAnswerInput,
  IceCandidateInput,
} from '@teamchat/shared';

/**
 * Extended Socket interface with authenticated user data.
 */
interface AuthenticatedSocket extends Socket {
  userId: string;
  displayName: string;
}

/** Singleton socket server instance for access from route handlers */
let socketServer: Server | null = null;

/**
 * Returns the active Socket.io server instance.
 * @throws Error if called before setupSocketServer()
 */
export function getSocketServer(): Server {
  if (!socketServer) {
    throw new Error('Socket server not initialized');
  }
  return socketServer;
}

/**
 * Initializes the Socket.io server with authentication and event handlers.
 *
 * @param httpServer - Node.js HTTP server to attach Socket.io to
 * @returns Configured Socket.io Server instance
 */
export function setupSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (Electron apps, curl, server-to-server)
        if (!origin) {
          return callback(null, true);
        }

        // Allow file:// origin (Electron app)
        if (origin === 'file://' || origin === 'null') {
          return callback(null, true);
        }

        // Allow explicitly configured origins
        if (config.cors.origin.includes(origin) || config.cors.origin.includes('*')) {
          return callback(null, true);
        }

        // Allow Tailscale IP origins (100.64.x.x - 100.127.x.x)
        if (isTailscaleOrigin(origin)) {
          return callback(null, true);
        }

        // Reject other origins
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      },
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = await verifyToken(token);
      if (!payload) {
        return next(new Error('Invalid token'));
      }

      (socket as AuthenticatedSocket).userId = payload.sub;
      (socket as AuthenticatedSocket).displayName = payload.displayName;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on(SOCKET_EVENTS.CONNECTION, async (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const { userId, displayName } = authSocket;

    console.log(`User connected: ${userId} (${displayName})`);

    // Set user online
    await setUserOnline(userId, socket.id);

    // Broadcast presence
    socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
      userId,
      status: 'online',
    });

    // Join user's personal room for direct notifications
    socket.join(`user:${userId}`);

    // ===================
    // Channel/DM Room Management
    // ===================

    socket.on(SOCKET_EVENTS.CHANNEL_JOIN, async (data: JoinChannelInput) => {
      const { channelId } = data;

      // Verify membership
      const member = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });

      if (!member) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Not a channel member' });
        return;
      }

      socket.join(`channel:${channelId}`);
      console.log(`User ${userId} joined channel:${channelId}`);
    });

    socket.on(SOCKET_EVENTS.CHANNEL_LEAVE, (data: JoinChannelInput) => {
      socket.leave(`channel:${data.channelId}`);
    });

    socket.on(SOCKET_EVENTS.DM_JOIN, async (data: JoinDmInput) => {
      const { dmThreadId } = data;

      // Verify access
      const dm = await prisma.dmThread.findUnique({
        where: { id: dmThreadId },
      });

      if (!dm || (dm.userAId !== userId && dm.userBId !== userId)) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Not a DM participant' });
        return;
      }

      socket.join(`dm:${dmThreadId}`);
      console.log(`User ${userId} joined dm:${dmThreadId}`);
    });

    socket.on(SOCKET_EVENTS.DM_LEAVE, (data: JoinDmInput) => {
      socket.leave(`dm:${data.dmThreadId}`);
    });

    // ===================
    // Typing Indicators
    // ===================

    socket.on(SOCKET_EVENTS.TYPING_START, async (data: TypingInput) => {
      const { channelId, dmThreadId } = data;
      const room = channelId ? `channel:${channelId}` : `dm:${dmThreadId}`;

      await setTyping({ channelId, dmThreadId }, userId, displayName);

      socket.to(room).emit(SOCKET_EVENTS.TYPING_UPDATE, {
        userId,
        displayName,
        channelId,
        dmThreadId,
        isTyping: true,
      });
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, async (data: TypingInput) => {
      const { channelId, dmThreadId } = data;
      const room = channelId ? `channel:${channelId}` : `dm:${dmThreadId}`;

      await clearTyping({ channelId, dmThreadId }, userId);

      socket.to(room).emit(SOCKET_EVENTS.TYPING_UPDATE, {
        userId,
        displayName,
        channelId,
        dmThreadId,
        isTyping: false,
      });
    });

    // ===================
    // Call Signaling
    // ===================

    socket.on(SOCKET_EVENTS.CALL_INVITE, async (data: { callId: string; toUserIds: string[] }) => {
      const { callId, toUserIds } = data;

      // Notify invited users
      for (const toUserId of toUserIds) {
        io.to(`user:${toUserId}`).emit(SOCKET_EVENTS.CALL_RINGING, {
          callId,
          fromUserId: userId,
          fromDisplayName: displayName,
        });
      }
    });

    socket.on(SOCKET_EVENTS.CALL_ACCEPTED, async (data: { callId: string }) => {
      // Join call room
      socket.join(`call:${data.callId}`);

      // Notify others in call
      socket.to(`call:${data.callId}`).emit(SOCKET_EVENTS.CALL_PARTICIPANT_JOINED, {
        userId,
        displayName,
      });
    });

    socket.on(SOCKET_EVENTS.CALL_DECLINED, async (data: { callId: string; toUserId: string }) => {
      io.to(`user:${data.toUserId}`).emit(SOCKET_EVENTS.CALL_DECLINED, {
        callId: data.callId,
        fromUserId: userId,
      });
    });

    socket.on(SOCKET_EVENTS.CALL_JOIN, async (data: { callId: string }) => {
      socket.join(`call:${data.callId}`);

      socket.to(`call:${data.callId}`).emit(SOCKET_EVENTS.CALL_PARTICIPANT_JOINED, {
        userId,
        displayName,
      });
    });

    socket.on(SOCKET_EVENTS.CALL_LEAVE, async (data: { callId: string }) => {
      socket.to(`call:${data.callId}`).emit(SOCKET_EVENTS.CALL_PARTICIPANT_LEFT, {
        userId,
      });

      socket.leave(`call:${data.callId}`);
    });

    socket.on(SOCKET_EVENTS.CALL_OFFER, (data: CallOfferInput) => {
      const { callId, toUserId, sdp } = data;

      if (toUserId) {
        // Direct offer to specific user
        io.to(`user:${toUserId}`).emit(SOCKET_EVENTS.CALL_OFFER, {
          callId,
          fromUserId: userId,
          sdp,
        });
      } else {
        // Broadcast to call room
        socket.to(`call:${callId}`).emit(SOCKET_EVENTS.CALL_OFFER, {
          callId,
          fromUserId: userId,
          sdp,
        });
      }
    });

    socket.on(SOCKET_EVENTS.CALL_ANSWER, (data: CallAnswerInput) => {
      const { callId, toUserId, sdp } = data;

      io.to(`user:${toUserId}`).emit(SOCKET_EVENTS.CALL_ANSWER, {
        callId,
        fromUserId: userId,
        sdp,
      });
    });

    socket.on(SOCKET_EVENTS.CALL_ICE, (data: IceCandidateInput) => {
      const { callId, toUserId, candidate } = data;

      io.to(`user:${toUserId}`).emit(SOCKET_EVENTS.CALL_ICE, {
        callId,
        fromUserId: userId,
        candidate,
      });
    });

    socket.on(SOCKET_EVENTS.CALL_HANGUP, (data: { callId: string }) => {
      socket.to(`call:${data.callId}`).emit(SOCKET_EVENTS.CALL_HANGUP, {
        userId,
      });

      socket.leave(`call:${data.callId}`);
    });

    socket.on(SOCKET_EVENTS.CALL_MEDIA_STATE, (data: { callId: string; audioEnabled: boolean; videoEnabled: boolean; screenShareEnabled: boolean }) => {
      socket.to(`call:${data.callId}`).emit(SOCKET_EVENTS.CALL_MEDIA_STATE, {
        userId,
        ...data,
      });
    });

    socket.on(SOCKET_EVENTS.CALL_SCREENSHARE_START, (data: { callId: string }) => {
      socket.to(`call:${data.callId}`).emit(SOCKET_EVENTS.CALL_SCREENSHARE_START, {
        userId,
      });
    });

    socket.on(SOCKET_EVENTS.CALL_SCREENSHARE_STOP, (data: { callId: string }) => {
      socket.to(`call:${data.callId}`).emit(SOCKET_EVENTS.CALL_SCREENSHARE_STOP, {
        userId,
      });
    });

    // ===================
    // Disconnect
    // ===================

    socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
      console.log(`User disconnected: ${userId}`);

      await setUserOffline(userId);

      socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
        userId,
        status: 'offline',
        lastSeen: new Date(),
      });
    });
  });

  // Store for getSocketServer()
  socketServer = io;

  return io;
}

// ============================================
// Route Helper Functions
// ============================================

/**
 * Broadcasts a new message to the appropriate room.
 * Called from message routes after database insert.
 */
export function emitMessageCreated(io: Server, message: any, scope: { channelId?: string; dmThreadId?: string }) {
  const room = scope.channelId ? `channel:${scope.channelId}` : `dm:${scope.dmThreadId}`;
  io.to(room).emit(SOCKET_EVENTS.MESSAGE_CREATED, message);
}

export function emitMessageUpdated(io: Server, message: any, scope: { channelId?: string; dmThreadId?: string }) {
  const room = scope.channelId ? `channel:${scope.channelId}` : `dm:${scope.dmThreadId}`;
  io.to(room).emit(SOCKET_EVENTS.MESSAGE_UPDATED, message);
}

export function emitMessageDeleted(io: Server, messageId: string, scope: { channelId?: string; dmThreadId?: string }) {
  const room = scope.channelId ? `channel:${scope.channelId}` : `dm:${scope.dmThreadId}`;
  io.to(room).emit(SOCKET_EVENTS.MESSAGE_DELETED, { messageId });
}

export function emitReactionAdded(io: Server, reaction: any, messageId: string, scope: { channelId?: string; dmThreadId?: string }) {
  const room = scope.channelId ? `channel:${scope.channelId}` : `dm:${scope.dmThreadId}`;
  io.to(room).emit(SOCKET_EVENTS.REACTION_ADDED, { reaction, messageId });
}

export function emitReactionRemoved(io: Server, reactionId: string, messageId: string, scope: { channelId?: string; dmThreadId?: string }) {
  const room = scope.channelId ? `channel:${scope.channelId}` : `dm:${scope.dmThreadId}`;
  io.to(room).emit(SOCKET_EVENTS.REACTION_REMOVED, { reactionId, messageId });
}
