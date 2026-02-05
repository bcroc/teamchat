import type { Server } from 'socket.io';
import { SOCKET_EVENTS } from '@teamchat/shared';
import { scopeRoom } from './rooms.js';

export function emitMessageCreated(
  io: Server,
  message: any,
  scope: { channelId?: string; dmThreadId?: string }
) {
  io.to(scopeRoom(scope)).emit(SOCKET_EVENTS.MESSAGE_CREATED, message);
}

export function emitMessageUpdated(
  io: Server,
  message: any,
  scope: { channelId?: string; dmThreadId?: string }
) {
  io.to(scopeRoom(scope)).emit(SOCKET_EVENTS.MESSAGE_UPDATED, message);
}

export function emitMessageDeleted(
  io: Server,
  messageId: string,
  scope: { channelId?: string; dmThreadId?: string }
) {
  io.to(scopeRoom(scope)).emit(SOCKET_EVENTS.MESSAGE_DELETED, { messageId });
}

export function emitReactionAdded(
  io: Server,
  reaction: any,
  messageId: string,
  scope: { channelId?: string; dmThreadId?: string }
) {
  io.to(scopeRoom(scope)).emit(SOCKET_EVENTS.REACTION_ADDED, { reaction, messageId });
}

export function emitReactionRemoved(
  io: Server,
  reactionId: string,
  messageId: string,
  scope: { channelId?: string; dmThreadId?: string }
) {
  io.to(scopeRoom(scope)).emit(SOCKET_EVENTS.REACTION_REMOVED, { reactionId, messageId });
}
