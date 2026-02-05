import type { Server } from 'socket.io';
import { scopeRoom } from '../../socket/rooms.js';

export const messageInclude = {
  sender: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
  reactions: {
    include: {
      user: {
        select: { id: true, displayName: true },
      },
    },
  },
  files: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
    },
  },
  _count: {
    select: { replies: true },
  },
} as const;

export function emitToScope(
  io: Server | undefined,
  event: string,
  data: any,
  scope: { channelId?: string | null; dmThreadId?: string | null }
): void {
  if (!io) return;
  io.to(scopeRoom(scope)).emit(event, data);
}

export function withReplyCount<T extends { _count?: { replies?: number } }>(message: T) {
  return {
    ...message,
    replyCount: message._count?.replies ?? 0,
    _count: undefined,
  } as Omit<T, '_count'> & { replyCount: number };
}
