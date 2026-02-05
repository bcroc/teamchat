import { SOCKET_EVENTS } from '@teamchat/shared';
import { setUserOnline, setUserOffline } from '../../lib/redis.js';
import { userRoom } from '../rooms.js';
import type { SocketContext } from '../types.js';

export async function registerPresenceHandlers(ctx: SocketContext): Promise<void> {
  const { socket, userId, displayName } = ctx;

  console.log(`User connected: ${userId} (${displayName})`);

  await setUserOnline(userId, socket.id);

  socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
    userId,
    status: 'online',
  });

  socket.join(userRoom(userId));

  socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
    console.log(`User disconnected: ${userId}`);

    await setUserOffline(userId);

    socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
      userId,
      status: 'offline',
      lastSeen: new Date(),
    });
  });
}
