import { createHmac } from 'crypto';
import { SOCKET_EVENTS } from '@teamchat/shared';
import { getSocketServer } from '../../socket/index.js';

export function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function emitChannelEvent(channelId: string | null, event: string, payload: any): void {
  if (!channelId) return;
  const io = getSocketServer();
  io.to(`channel:${channelId}`).emit(event, payload);
}

export function emitMessageDeleted(channelId: string | null, messageId: string): void {
  emitChannelEvent(channelId, SOCKET_EVENTS.MESSAGE_DELETED, { messageId });
}

export function emitMessageUpdated(channelId: string | null, message: any): void {
  emitChannelEvent(channelId, SOCKET_EVENTS.MESSAGE_UPDATED, { message });
}

export function emitMessageCreated(channelId: string | null, message: any): void {
  emitChannelEvent(channelId, SOCKET_EVENTS.MESSAGE_CREATED, { message });
}
