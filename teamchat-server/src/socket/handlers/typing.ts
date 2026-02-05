import { SOCKET_EVENTS } from '@teamchat/shared';
import { setTyping, clearTyping } from '../../lib/redis.js';
import { channelRoom, dmRoom } from '../rooms.js';
import { ensureScopeAccess } from '../access.js';
import type { SocketContext } from '../types.js';
import type { TypingInput } from '@teamchat/shared';

export function registerTypingHandlers(ctx: SocketContext): void {
  const { socket, userId, displayName } = ctx;

  socket.on(SOCKET_EVENTS.TYPING_START, async (data: TypingInput) => {
    const { channelId, dmThreadId } = data;
    const room = channelId ? channelRoom(channelId) : dmRoom(dmThreadId as string);

    const hasAccess = await ensureScopeAccess(userId, channelId, dmThreadId, socket);
    if (!hasAccess) return;

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
    const room = channelId ? channelRoom(channelId) : dmRoom(dmThreadId as string);

    const hasAccess = await ensureScopeAccess(userId, channelId, dmThreadId, socket);
    if (!hasAccess) return;

    await clearTyping({ channelId, dmThreadId }, userId);

    socket.to(room).emit(SOCKET_EVENTS.TYPING_UPDATE, {
      userId,
      displayName,
      channelId,
      dmThreadId,
      isTyping: false,
    });
  });
}
