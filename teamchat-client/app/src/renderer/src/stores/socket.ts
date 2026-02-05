/**
 * Socket.io Store
 *
 * Manages the WebSocket connection and real-time event subscriptions.
 * Provides methods for:
 * - Connecting/disconnecting with authentication
 * - Joining/leaving channel and DM rooms
 * - Typing indicator emission
 * - Message event subscriptions with cleanup
 *
 * The store also maintains derived state for typing indicators
 * and online user presence.
 *
 * @module apps/desktop/src/renderer/src/stores/socket
 */

import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@teamchat/shared';
import type { Message, TypingEvent, PresenceUpdate } from '@teamchat/shared';
import { config } from '../lib/config';

/**
 * Connection status enum for better UX feedback
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Socket connection state and real-time event handlers.
 */
interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  lastError: string | null;
  typingUsers: Map<string, TypingEvent[]>;
  onlineUsers: Set<string>;

  // Actions
  connect: (token: string) => void;
  disconnect: () => void;
  clearError: () => void;

  // Room management
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  joinDm: (dmThreadId: string) => void;
  leaveDm: (dmThreadId: string) => void;

  // Typing
  startTyping: (scope: { channelId?: string; dmThreadId?: string }) => void;
  stopTyping: (scope: { channelId?: string; dmThreadId?: string }) => void;

  // Messages (emitted after API calls)
  onMessageCreated: (callback: (message: Message) => void) => () => void;
  onMessageUpdated: (callback: (message: Message) => void) => () => void;
  onMessageDeleted: (callback: (data: { messageId: string }) => void) => () => void;

  // Presence
  onPresenceUpdate: (callback: (data: PresenceUpdate) => void) => () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  reconnectAttempt: 0,
  lastError: null,
  typingUsers: new Map(),
  onlineUsers: new Set(),

  clearError: () => set({ lastError: null }),

  connect: (token) => {
    const existingSocket = get().socket;
    if (existingSocket?.connected) {
      return;
    }

    // Clean up any existing socket
    if (existingSocket) {
      existingSocket.removeAllListeners();
      existingSocket.disconnect();
    }

    set({ connectionStatus: 'connecting', lastError: null, reconnectAttempt: 0 });

    const socket = io(config.socket.url, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: config.socket.reconnectionAttempts,
      reconnectionDelay: config.socket.reconnectionDelay,
      reconnectionDelayMax: config.socket.reconnectionDelayMax,
      timeout: config.socket.timeout,
      transports: ['websocket', 'polling'], // Prefer websocket, fallback to polling
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected successfully');
      set({ isConnected: true, connectionStatus: 'connected', lastError: null, reconnectAttempt: 0 });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      set({ isConnected: false });
      
      // Handle different disconnect reasons
      if (reason === 'io server disconnect') {
        // Server initiated disconnect (e.g., auth failure)
        set({ connectionStatus: 'error', lastError: 'Disconnected by server' });
      } else if (reason === 'io client disconnect') {
        // Client initiated disconnect
        set({ connectionStatus: 'disconnected' });
      } else {
        // Unexpected disconnect, socket.io will auto-reconnect
        set({ connectionStatus: 'reconnecting' });
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      const reconnectAttempt = get().reconnectAttempt + 1;
      set({ 
        connectionStatus: 'reconnecting',
        lastError: `Connection failed: ${error.message}`,
        reconnectAttempt,
      });

      // Check if we've exhausted reconnection attempts
      if (reconnectAttempt >= config.socket.reconnectionAttempts) {
        set({ connectionStatus: 'error', lastError: 'Unable to connect to server' });
      }
    });

    socket.io.on('reconnect', (attempt) => {
      console.log(`[Socket] Reconnected after ${attempt} attempts`);
      set({ connectionStatus: 'connected', lastError: null, reconnectAttempt: 0 });
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`[Socket] Reconnection attempt ${attempt}`);
      set({ connectionStatus: 'reconnecting', reconnectAttempt: attempt });
    });

    socket.io.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after all attempts');
      set({ connectionStatus: 'error', lastError: 'Unable to reconnect to server' });
    });

    // Typing events
    socket.on(SOCKET_EVENTS.TYPING_UPDATE, (data: TypingEvent & { isTyping: boolean }) => {
      set((state) => {
        const key = data.channelId || data.dmThreadId || '';
        const current = state.typingUsers.get(key) || [];

        if (data.isTyping) {
          // Add user if not already typing
          if (!current.find((t) => t.userId === data.userId)) {
            const updated = new Map(state.typingUsers);
            updated.set(key, [...current, data]);
            return { typingUsers: updated };
          }
        } else {
          // Remove user
          const updated = new Map(state.typingUsers);
          updated.set(
            key,
            current.filter((t) => t.userId !== data.userId)
          );
          return { typingUsers: updated };
        }

        return state;
      });
    });

    // Presence events
    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, (data: PresenceUpdate) => {
      set((state) => {
        const updated = new Set(state.onlineUsers);
        if (data.status === 'online') {
          updated.add(data.userId);
        } else {
          updated.delete(data.userId);
        }
        return { onlineUsers: updated };
      });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      set({ 
        socket: null, 
        isConnected: false, 
        connectionStatus: 'disconnected',
        lastError: null,
        reconnectAttempt: 0,
      });
    }
  },

  joinChannel: (channelId) => {
    get().socket?.emit(SOCKET_EVENTS.CHANNEL_JOIN, { channelId });
  },

  leaveChannel: (channelId) => {
    get().socket?.emit(SOCKET_EVENTS.CHANNEL_LEAVE, { channelId });
  },

  joinDm: (dmThreadId) => {
    get().socket?.emit(SOCKET_EVENTS.DM_JOIN, { dmThreadId });
  },

  leaveDm: (dmThreadId) => {
    get().socket?.emit(SOCKET_EVENTS.DM_LEAVE, { dmThreadId });
  },

  startTyping: (scope) => {
    get().socket?.emit(SOCKET_EVENTS.TYPING_START, scope);
  },

  stopTyping: (scope) => {
    get().socket?.emit(SOCKET_EVENTS.TYPING_STOP, scope);
  },

  onMessageCreated: (callback) => {
    const { socket } = get();
    if (!socket) return () => {};

    socket.on(SOCKET_EVENTS.MESSAGE_CREATED, callback);
    return () => socket.off(SOCKET_EVENTS.MESSAGE_CREATED, callback);
  },

  onMessageUpdated: (callback) => {
    const { socket } = get();
    if (!socket) return () => {};

    socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, callback);
    return () => socket.off(SOCKET_EVENTS.MESSAGE_UPDATED, callback);
  },

  onMessageDeleted: (callback) => {
    const { socket } = get();
    if (!socket) return () => {};

    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, callback);
    return () => socket.off(SOCKET_EVENTS.MESSAGE_DELETED, callback);
  },

  onPresenceUpdate: (callback) => {
    const { socket } = get();
    if (!socket) return () => {};

    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, callback);
    return () => socket.off(SOCKET_EVENTS.PRESENCE_UPDATE, callback);
  },
}));
