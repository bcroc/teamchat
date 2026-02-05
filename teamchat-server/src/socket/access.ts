import type { Socket } from 'socket.io';
import { SOCKET_EVENTS } from '@teamchat/shared';
import { prisma } from '../lib/db.js';
import { requireChannelAccess, requireDmAccess } from '../middleware/auth.js';

export async function ensureScopeAccess(
  userId: string,
  channelId: string | undefined,
  dmThreadId: string | undefined,
  socket: Socket
): Promise<boolean> {
  try {
    if (channelId) {
      await requireChannelAccess(userId, channelId);
      return true;
    }
    if (dmThreadId) {
      await requireDmAccess(userId, dmThreadId);
      return true;
    }
    socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid scope' });
    return false;
  } catch {
    socket.emit(SOCKET_EVENTS.ERROR, { message: 'Access denied' });
    return false;
  }
}

export async function ensureCallParticipant(
  userId: string,
  callId: string,
  socket: Socket
): Promise<boolean> {
  try {
    const callSession = await prisma.callSession.findUnique({
      where: { id: callId },
      select: { id: true, status: true },
    });

    if (!callSession || callSession.status !== 'active') {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Call not found or inactive' });
      return false;
    }

    const participant = await prisma.callParticipant.findFirst({
      where: {
        callSessionId: callId,
        userId,
        leftAt: null,
      },
      select: { id: true },
    });

    if (!participant) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Not a call participant' });
      return false;
    }

    return true;
  } catch {
    socket.emit(SOCKET_EVENTS.ERROR, { message: 'Call access check failed' });
    return false;
  }
}
