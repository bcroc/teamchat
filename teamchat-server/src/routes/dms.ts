import type { FastifyPluginAsync } from 'fastify';
import { createDmSchema } from '@teamchat/shared';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireWorkspaceMember, requireDmAccess } from '../middleware/auth.js';
import { assertZodSuccess } from './helpers/validation.js';

const createGroupDmSchema = z.object({
  workspaceId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).min(2).max(8), // 2-8 participants (excluding self)
  name: z.string().max(100).optional(),
});

export const dmRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /dms?workspaceId= - List DM threads (both 1:1 and group)
  fastify.get<{ Querystring: { workspaceId: string } }>('/', async (request) => {
    const { workspaceId } = request.query;

    if (!workspaceId) {
      throw errors.validation('workspaceId is required');
    }

    await requireWorkspaceMember(request.user.id, workspaceId);

    // Fetch 1:1 DMs
    const oneOnOneDms = await prisma.dmThread.findMany({
      where: {
        workspaceId,
        isGroup: false,
        OR: [
          { userAId: request.user.id },
          { userBId: request.user.id },
        ],
      },
      include: {
        userA: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        userB: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            createdAt: true,
            senderId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch group DMs where user is a participant
    const groupDms = await prisma.dmThread.findMany({
      where: {
        workspaceId,
        isGroup: true,
        participants: {
          some: {
            userId: request.user.id,
            leftAt: null, // Only active participants
          },
        },
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
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            createdAt: true,
            senderId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform 1:1 DMs
    const dms = oneOnOneDms.map((dm) => {
      const otherUser = dm.userAId === request.user.id ? dm.userB : dm.userA;
      const lastMessage = dm.messages[0] || null;

      return {
        id: dm.id,
        workspaceId: dm.workspaceId,
        createdAt: dm.createdAt,
        isGroup: false,
        otherUser,
        lastMessage,
      };
    });

    // Transform group DMs
    const groups = groupDms.map((dm) => {
      const otherParticipants = dm.participants
        .filter((p) => p.userId !== request.user.id)
        .map((p) => p.user);
      const lastMessage = dm.messages[0] || null;

      return {
        id: dm.id,
        workspaceId: dm.workspaceId,
        createdAt: dm.createdAt,
        isGroup: true,
        name: dm.name,
        participants: otherParticipants,
        participantCount: dm.participants.length,
        lastMessage,
      };
    });

    return { dms: [...dms, ...groups].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    }) };
  });

  // POST /dms - Create or get existing DM thread
  fastify.post<{ Body: { workspaceId: string; userId: string } }>('/', async (request, reply) => {
    const { workspaceId, userId } = request.body;

    if (!workspaceId) {
      throw errors.validation('workspaceId is required');
    }

    const { userId: targetUserId } = assertZodSuccess(
      createDmSchema.safeParse({ userId })
    );

    // Can't DM yourself
    if (targetUserId === request.user.id) {
      throw errors.validation('Cannot create DM with yourself');
    }

    // Both users must be workspace members
    await requireWorkspaceMember(request.user.id, workspaceId);
    await requireWorkspaceMember(targetUserId, workspaceId);

    // Normalize user order (smaller ID is userA)
    const [userAId, userBId] = [request.user.id, targetUserId].sort();

    // Check for existing DM
    let dmThread = await prisma.dmThread.findUnique({
      where: {
        workspaceId_userAId_userBId: { workspaceId, userAId, userBId },
      },
      include: {
        userA: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        userB: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });

    if (dmThread) {
      return reply.send({ dmThread, created: false });
    }

    // Create new DM thread
    dmThread = await prisma.dmThread.create({
      data: {
        workspaceId,
        userAId,
        userBId,
      },
      include: {
        userA: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        userB: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });

    return reply.status(201).send({ dmThread, created: true });
  });

  // POST /dms/group - Create a group DM
  fastify.post<{ Body: z.infer<typeof createGroupDmSchema> }>('/group', async (request, reply) => {
    const { workspaceId, userIds, name } = assertZodSuccess(
      createGroupDmSchema.safeParse(request.body)
    );

    // Verify current user is a workspace member
    await requireWorkspaceMember(request.user.id, workspaceId);

    // Remove duplicates and self from userIds
    const uniqueUserIds = [...new Set(userIds)].filter((id) => id !== request.user.id);

    if (uniqueUserIds.length < 2) {
      throw errors.validation('Group DM requires at least 2 other participants');
    }

    // Verify all participants are workspace members
    for (const userId of uniqueUserIds) {
      await requireWorkspaceMember(userId, workspaceId);
    }

    // Create the group DM
    const dmThread = await prisma.dmThread.create({
      data: {
        workspaceId,
        isGroup: true,
        name: name || null,
        participants: {
          create: [
            { userId: request.user.id }, // Include self
            ...uniqueUserIds.map((userId) => ({ userId })),
          ],
        },
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

    return reply.status(201).send({ dmThread });
  });

  // GET /dms/:id - Get DM thread
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { id } = request.params;

    await requireDmAccess(request.user.id, id);

    const dmThread = await prisma.dmThread.findUnique({
      where: { id },
      include: {
        userA: {
          select: { id: true, displayName: true, avatarUrl: true, email: true },
        },
        userB: {
          select: { id: true, displayName: true, avatarUrl: true, email: true },
        },
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true, email: true },
            },
          },
        },
      },
    });

    if (!dmThread) {
      throw errors.notFound('DM thread');
    }

    return { dmThread };
  });

  // POST /dms/:id/participants - Add participants to group DM
  fastify.post<{ Params: { id: string }; Body: { userIds: string[] } }>(
    '/:id/participants',
    async (request, reply) => {
      const { id } = request.params;
      const { userIds } = request.body;

      // Verify access
      await requireDmAccess(request.user.id, id);

      const dmThread = await prisma.dmThread.findUnique({
        where: { id },
        include: { participants: { where: { leftAt: null } } },
      });

      if (!dmThread) {
        throw errors.notFound('DM thread');
      }

      if (!dmThread.isGroup) {
        throw errors.validation('Cannot add participants to a 1:1 DM');
      }

      // Check max participants (9 total including self)
      const currentCount = dmThread.participants.length;
      if (currentCount + userIds.length > 9) {
        throw errors.validation('Group DM can have at most 9 participants');
      }

      // Verify new participants are workspace members
      for (const userId of userIds) {
        await requireWorkspaceMember(userId, dmThread.workspaceId);
      }

      // Add new participants
      const existingUserIds = dmThread.participants.map((p) => p.userId);
      const newUserIds = userIds.filter((id) => !existingUserIds.includes(id));

      if (newUserIds.length > 0) {
        await prisma.dmParticipant.createMany({
          data: newUserIds.map((userId) => ({
            dmThreadId: id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      // Return updated thread
      const updatedThread = await prisma.dmThread.findUnique({
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

      return reply.send({ dmThread: updatedThread });
    }
  );

  // DELETE /dms/:id/participants/:userId - Remove participant (leave group)
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/:id/participants/:userId',
    async (request, reply) => {
      const { id, userId } = request.params;

      // Only self can leave, or admins could remove others
      if (userId !== request.user.id) {
        throw errors.forbidden('Can only remove yourself from a group DM');
      }

      await requireDmAccess(request.user.id, id);

      const dmThread = await prisma.dmThread.findUnique({
        where: { id },
      });

      if (!dmThread) {
        throw errors.notFound('DM thread');
      }

      if (!dmThread.isGroup) {
        throw errors.validation('Cannot leave a 1:1 DM');
      }

      // Mark participant as left
      await prisma.dmParticipant.updateMany({
        where: {
          dmThreadId: id,
          userId,
          leftAt: null,
        },
        data: {
          leftAt: new Date(),
        },
      });

      return reply.send({ success: true });
    }
  );

  // PATCH /dms/:id - Update group DM (name)
  fastify.patch<{ Params: { id: string }; Body: { name?: string } }>(
    '/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body;

      await requireDmAccess(request.user.id, id);

      const dmThread = await prisma.dmThread.findUnique({
        where: { id },
      });

      if (!dmThread) {
        throw errors.notFound('DM thread');
      }

      if (!dmThread.isGroup) {
        throw errors.validation('Cannot rename a 1:1 DM');
      }

      const updated = await prisma.dmThread.update({
        where: { id },
        data: { name: name || null },
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

      return reply.send({ dmThread: updated });
    }
  );
};
