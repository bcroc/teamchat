import type { FastifyPluginAsync } from 'fastify';
import { startCallSchema } from '@teamchat/shared';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireChannelAccess, requireDmAccess } from '../middleware/auth.js';
import { config } from '../lib/config.js';

const MAX_PARTICIPANTS = 6;

export const callRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /calls/ice-servers - Get ICE server configuration
  fastify.get('/ice-servers', async () => {
    return { iceServers: config.webrtc.getIceServers() };
  });

  // POST /calls/start - Start a new call
  fastify.post('/start', async (request, reply) => {
    const result = startCallSchema.safeParse(request.body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { scopeType, channelId, dmThreadId } = result.data;

    // Verify access and get workspaceId
    let workspaceId: string;
    if (scopeType === 'channel' && channelId) {
      const { channel } = await requireChannelAccess(request.user.id, channelId);
      workspaceId = channel.workspaceId;
    } else if (scopeType === 'dm' && dmThreadId) {
      const { dmThread } = await requireDmAccess(request.user.id, dmThreadId);
      workspaceId = dmThread.workspaceId;
    } else {
      throw errors.validation('Invalid scope');
    }

    // Check for existing active call in this scope
    const existingCall = await prisma.callSession.findFirst({
      where: {
        status: 'active',
        ...(channelId && { channelId }),
        ...(dmThreadId && { dmThreadId }),
      },
    });

    if (existingCall) {
      throw errors.callInProgress();
    }

    // Create call session
    const callSession = await prisma.$transaction(async (tx) => {
      const session = await tx.callSession.create({
        data: {
          workspaceId,
          scopeType,
          channelId,
          dmThreadId,
          createdBy: request.user.id,
          status: 'active',
        },
      });

      // Add creator as first participant
      await tx.callParticipant.create({
        data: {
          callSessionId: session.id,
          userId: request.user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: request.user.id,
          action: 'call.started',
          metadata: { callId: session.id, scopeType, channelId, dmThreadId },
        },
      });

      return session;
    });

    return reply.status(201).send({
      callSession,
      iceServers: config.webrtc.getIceServers(),
    });
  });

  // POST /calls/:id/join - Join an active call
  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const { id } = request.params;

    const callSession = await prisma.callSession.findUnique({
      where: { id },
      include: {
        participants: {
          where: { leftAt: null },
        },
      },
    });

    if (!callSession || callSession.status !== 'active') {
      throw errors.callNotFound();
    }

    // Verify access
    if (callSession.channelId) {
      await requireChannelAccess(request.user.id, callSession.channelId);
    } else if (callSession.dmThreadId) {
      await requireDmAccess(request.user.id, callSession.dmThreadId);
    }

    // Check participant count
    if (callSession.participants.length >= MAX_PARTICIPANTS) {
      throw errors.callFull();
    }

    // Check if already in call
    const existingParticipant = callSession.participants.find(
      (p) => p.userId === request.user.id
    );

    if (existingParticipant) {
      return reply.send({
        message: 'Already in call',
        callSession,
        iceServers: config.webrtc.getIceServers(),
      });
    }

    // Add participant
    await prisma.callParticipant.create({
      data: {
        callSessionId: id,
        userId: request.user.id,
      },
    });

    const updatedSession = await prisma.callSession.findUnique({
      where: { id },
      include: {
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
    });

    return reply.send({
      callSession: updatedSession,
      iceServers: config.webrtc.getIceServers(),
    });
  });

  // POST /calls/:id/leave - Leave a call
  fastify.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    const { id } = request.params;

    const callSession = await prisma.callSession.findUnique({
      where: { id },
      include: {
        participants: {
          where: { leftAt: null },
        },
      },
    });

    if (!callSession) {
      throw errors.callNotFound();
    }

    // Mark participant as left
    await prisma.callParticipant.updateMany({
      where: {
        callSessionId: id,
        userId: request.user.id,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    // Check if call should end (no more participants)
    const remainingParticipants = await prisma.callParticipant.count({
      where: {
        callSessionId: id,
        leftAt: null,
      },
    });

    if (remainingParticipants === 0) {
      await prisma.callSession.update({
        where: { id },
        data: {
          status: 'ended',
          endedAt: new Date(),
        },
      });
    }

    return reply.status(204).send();
  });

  // POST /calls/:id/end - End call (creator/admin only)
  fastify.post<{ Params: { id: string } }>('/:id/end', async (request, reply) => {
    const { id } = request.params;

    const callSession = await prisma.callSession.findUnique({
      where: { id },
    });

    if (!callSession) {
      throw errors.callNotFound();
    }

    // Only creator or admin can end
    const isCreator = callSession.createdBy === request.user.id;

    if (!isCreator) {
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: callSession.workspaceId, userId: request.user.id },
        },
      });

      if (!member || !['owner', 'admin'].includes(member.role)) {
        throw errors.forbidden('Only call creator or admins can end the call');
      }
    }

    await prisma.$transaction(async (tx) => {
      // Mark all participants as left
      await tx.callParticipant.updateMany({
        where: {
          callSessionId: id,
          leftAt: null,
        },
        data: {
          leftAt: new Date(),
        },
      });

      // End the call
      await tx.callSession.update({
        where: { id },
        data: {
          status: 'ended',
          endedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: callSession.workspaceId,
          actorId: request.user.id,
          action: 'call.ended',
          metadata: { callId: id },
        },
      });
    });

    return reply.status(204).send();
  });

  // GET /calls/active - Get active call in scope
  fastify.get<{ Querystring: { channelId?: string; dmThreadId?: string } }>(
    '/active',
    async (request) => {
      const { channelId, dmThreadId } = request.query;

      if (!channelId && !dmThreadId) {
        throw errors.validation('Either channelId or dmThreadId is required');
      }

      // Verify access
      if (channelId) {
        await requireChannelAccess(request.user.id, channelId);
      } else if (dmThreadId) {
        await requireDmAccess(request.user.id, dmThreadId);
      }

      const callSession = await prisma.callSession.findFirst({
        where: {
          status: 'active',
          ...(channelId && { channelId }),
          ...(dmThreadId && { dmThreadId }),
        },
        include: {
          participants: {
            where: { leftAt: null },
            include: {
              user: {
                select: { id: true, displayName: true, avatarUrl: true },
              },
            },
          },
        },
      });

      return { callSession };
    }
  );

  // GET /calls/:id - Get call details
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { id } = request.params;

    const callSession = await prisma.callSession.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!callSession) {
      throw errors.callNotFound();
    }

    // Verify access
    if (callSession.channelId) {
      await requireChannelAccess(request.user.id, callSession.channelId);
    } else if (callSession.dmThreadId) {
      await requireDmAccess(request.user.id, callSession.dmThreadId);
    }

    return { callSession };
  });
};
