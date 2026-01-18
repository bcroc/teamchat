import type { FastifyPluginAsync } from 'fastify';
import { createChannelSchema, updateChannelSchema } from '@teamchat/shared';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import {
  authenticate,
  requireWorkspaceMember,
  requireWorkspaceRole,
  requireChannelAccess,
} from '../middleware/auth.js';

export const channelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /channels?workspaceId= - List channels
  fastify.get<{ Querystring: { workspaceId: string } }>('/', async (request) => {
    const { workspaceId } = request.query;

    if (!workspaceId) {
      throw errors.validation('workspaceId is required');
    }

    await requireWorkspaceMember(request.user.id, workspaceId);

    // Get all public channels and private channels user is a member of
    const channels = await prisma.channel.findMany({
      where: {
        workspaceId,
        OR: [
          { isPrivate: false },
          {
            isPrivate: true,
            members: { some: { userId: request.user.id } },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        topic: true,
        isPrivate: true,
        isArchived: true,
        createdAt: true,
        _count: { select: { members: true } },
        members: {
          where: { userId: request.user.id },
          select: { joinedAt: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      channels: channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        topic: ch.topic,
        isPrivate: ch.isPrivate,
        isArchived: ch.isArchived,
        createdAt: ch.createdAt,
        memberCount: ch._count.members,
        isMember: ch.members.length > 0,
      })),
    };
  });

  // POST /channels - Create channel
  fastify.post<{ Body: { workspaceId: string } }>('/', async (request, reply) => {
    const { workspaceId, ...body } = request.body as { workspaceId: string } & unknown;

    if (!workspaceId) {
      throw errors.validation('workspaceId is required');
    }

    await requireWorkspaceRole(request.user.id, workspaceId, ['owner', 'admin']);

    const result = createChannelSchema.safeParse(body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { name, description, isPrivate } = result.data;

    // Check if channel name exists in workspace
    const existing = await prisma.channel.findUnique({
      where: {
        workspaceId_name: { workspaceId, name },
      },
    });

    if (existing) {
      throw errors.conflict('Channel name already exists in this workspace');
    }

    const channel = await prisma.$transaction(async (tx) => {
      const ch = await tx.channel.create({
        data: {
          workspaceId,
          name,
          description,
          isPrivate,
          createdBy: request.user.id,
        },
      });

      // Creator joins the channel
      await tx.channelMember.create({
        data: {
          channelId: ch.id,
          userId: request.user.id,
        },
      });

      // For public channels, add all workspace members
      if (!isPrivate) {
        const members = await tx.workspaceMember.findMany({
          where: { workspaceId },
          select: { userId: true },
        });

        await tx.channelMember.createMany({
          data: members
            .filter((m) => m.userId !== request.user.id)
            .map((m) => ({
              channelId: ch.id,
              userId: m.userId,
            })),
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: request.user.id,
          action: 'channel.created',
          metadata: { channelId: ch.id, name, isPrivate },
        },
      });

      return ch;
    });

    return reply.status(201).send({ channel });
  });

  // GET /channels/:id - Get channel details
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { id } = request.params;

    const { channel } = await requireChannelAccess(request.user.id, id);

    const fullChannel = await prisma.channel.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        },
        _count: { select: { messages: true } },
      },
    });

    return { channel: fullChannel };
  });

  // PATCH /channels/:id - Update channel
  fastify.patch<{ Params: { id: string }; Body: { name?: string; description?: string; topic?: string; isArchived?: boolean } }>(
    '/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { name, description, topic, isArchived } = request.body;

      const { channel } = await requireChannelAccess(request.user.id, id);
      await requireWorkspaceRole(request.user.id, channel.workspaceId, ['owner', 'admin']);

      // Check name uniqueness if changing
      if (name) {
        const existing = await prisma.channel.findFirst({
          where: {
            workspaceId: channel.workspaceId,
            name,
            id: { not: id },
          },
        });

        if (existing) {
          throw errors.conflict('Channel name already exists');
        }
      }

      const updated = await prisma.channel.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(topic !== undefined && { topic }),
          ...(isArchived !== undefined && { isArchived }),
        },
      });

      // Log archive action
      if (isArchived !== undefined) {
        await prisma.auditLog.create({
          data: {
            workspaceId: channel.workspaceId,
            actorId: request.user.id,
            action: isArchived ? 'channel.archived' : 'channel.unarchived',
            metadata: { channelId: id, name: updated.name },
          },
        });
      }

      return reply.send({ channel: updated });
    }
  );

  // DELETE /channels/:id - Delete channel
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const { channel } = await requireChannelAccess(request.user.id, id);
    await requireWorkspaceRole(request.user.id, channel.workspaceId, ['owner', 'admin']);

    // Check if it's the only public channel
    const publicChannelCount = await prisma.channel.count({
      where: { workspaceId: channel.workspaceId, isPrivate: false },
    });

    const channelData = await prisma.channel.findUnique({
      where: { id },
      select: { isPrivate: true, name: true },
    });

    if (!channelData?.isPrivate && publicChannelCount <= 1) {
      throw errors.validation('Cannot delete the last public channel');
    }

    await prisma.$transaction(async (tx) => {
      await tx.channel.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          workspaceId: channel.workspaceId,
          actorId: request.user.id,
          action: 'channel.deleted',
          metadata: { channelId: id, name: channelData?.name },
        },
      });
    });

    return reply.status(204).send();
  });

  // POST /channels/:id/join - Join channel
  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const { id } = request.params;

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, isPrivate: true },
    });

    if (!channel) {
      throw errors.notFound('Channel');
    }

    await requireWorkspaceMember(request.user.id, channel.workspaceId);

    if (channel.isPrivate) {
      throw errors.forbidden('Cannot join private channels directly');
    }

    // Check if already a member
    const existing = await prisma.channelMember.findUnique({
      where: {
        channelId_userId: { channelId: id, userId: request.user.id },
      },
    });

    if (existing) {
      return reply.send({ message: 'Already a member' });
    }

    await prisma.channelMember.create({
      data: {
        channelId: id,
        userId: request.user.id,
      },
    });

    return reply.status(201).send({ message: 'Joined channel' });
  });

  // POST /channels/:id/leave - Leave channel
  fastify.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    const { id } = request.params;

    await prisma.channelMember.deleteMany({
      where: {
        channelId: id,
        userId: request.user.id,
      },
    });

    return reply.status(204).send();
  });

  // GET /channels/:id/members - List channel members
  fastify.get<{ Params: { id: string } }>('/:id/members', async (request) => {
    const { id } = request.params;

    await requireChannelAccess(request.user.id, id);

    const members = await prisma.channelMember.findMany({
      where: { channelId: id },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true, email: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return { members };
  });

  // POST /channels/:id/members - Add member to private channel
  fastify.post<{ Params: { id: string }; Body: { userId: string } }>(
    '/:id/members',
    async (request, reply) => {
      const { id } = request.params;
      const { userId } = request.body;

      if (!userId) {
        throw errors.validation('userId is required');
      }

      const { channel } = await requireChannelAccess(request.user.id, id);

      if (!channel.isPrivate) {
        throw errors.validation('Use join endpoint for public channels');
      }

      await requireWorkspaceRole(request.user.id, channel.workspaceId, ['owner', 'admin']);

      // Check target user is a workspace member
      await requireWorkspaceMember(userId, channel.workspaceId);

      // Check if already a member
      const existing = await prisma.channelMember.findUnique({
        where: {
          channelId_userId: { channelId: id, userId },
        },
      });

      if (existing) {
        return reply.send({ message: 'Already a member' });
      }

      await prisma.channelMember.create({
        data: {
          channelId: id,
          userId,
        },
      });

      return reply.status(201).send({ message: 'Member added' });
    }
  );
};
