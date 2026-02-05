import { SOCKET_EVENTS } from '@teamchat/shared';
import { prisma } from '../../lib/db.js';
import { channelRoom, dmRoom } from '../rooms.js';
import type { SocketContext } from '../types.js';
import type { JoinChannelInput, JoinDmInput } from '@teamchat/shared';

export function registerRoomManagementHandlers(ctx: SocketContext): void {
  const { socket, userId } = ctx;

  socket.on(SOCKET_EVENTS.CHANNEL_JOIN, async (data: JoinChannelInput) => {
    const { channelId } = data;

    const member = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });

    if (!member) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Not a channel member' });
      return;
    }

    socket.join(channelRoom(channelId));
    console.log(`User ${userId} joined channel:${channelId}`);
  });

  socket.on(SOCKET_EVENTS.CHANNEL_LEAVE, (data: JoinChannelInput) => {
    socket.leave(channelRoom(data.channelId));
  });

  socket.on(SOCKET_EVENTS.DM_JOIN, async (data: JoinDmInput) => {
    const { dmThreadId } = data;

    const dm = await prisma.dmThread.findUnique({
      where: { id: dmThreadId },
      select: {
        id: true,
        isGroup: true,
        userAId: true,
        userBId: true,
        participants: {
          where: { userId, leftAt: null },
          select: { id: true },
        },
      },
    });

    if (!dm) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Not a DM participant' });
      return;
    }

    const isParticipant = dm.isGroup
      ? dm.participants.length > 0
      : dm.userAId === userId || dm.userBId === userId;

    if (!isParticipant) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Not a DM participant' });
      return;
    }

    socket.join(dmRoom(dmThreadId));
    console.log(`User ${userId} joined dm:${dmThreadId}`);
  });

  socket.on(SOCKET_EVENTS.DM_LEAVE, (data: JoinDmInput) => {
    socket.leave(dmRoom(data.dmThreadId));
  });
}
