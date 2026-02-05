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
import { Server } from 'socket.io';
import { verifyToken } from '../lib/auth.js';
import { isTailscaleOrigin } from '../lib/tailscale.js';
import { config } from '../lib/config.js';
import { SOCKET_EVENTS } from '@teamchat/shared';
import { registerPresenceHandlers } from './handlers/presence.js';
import { registerRoomManagementHandlers } from './handlers/roomManagement.js';
import { registerTypingHandlers } from './handlers/typing.js';
import { registerCallHandlers } from './handlers/calls.js';
import type { AuthenticatedSocket, SocketContext } from './types.js';
export * from './emitters.js';

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

  io.on(SOCKET_EVENTS.CONNECTION, async (socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const { userId, displayName } = authSocket;

    const ctx: SocketContext = {
      io,
      socket: authSocket,
      userId,
      displayName,
    };

    await registerPresenceHandlers(ctx);
    registerRoomManagementHandlers(ctx);
    registerTypingHandlers(ctx);
    registerCallHandlers(ctx);
  });

  // Store for getSocketServer()
  socketServer = io;

  return io;
}
