import type { FastifyPluginAsync } from 'fastify';
import { createWorkspaceSchema, inviteMemberSchema, updateMemberRoleSchema } from '@teamchat/shared';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireWorkspaceMember, requireWorkspaceRole } from '../middleware/auth.js';
import { assertZodSuccess } from './helpers/validation.js';

export const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // GET /workspaces - List user's workspaces
  fastify.get('/', async (request) => {
    const workspaces = await prisma.workspace.findMany({
      where: {
        members: {
          some: { userId: request.user.id },
        },
      },
      include: {
        members: {
          where: { userId: request.user.id },
          select: { role: true },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        createdAt: w.createdAt,
        role: w.members[0]?.role,
        memberCount: w._count.members,
      })),
    };
  });

  // POST /workspaces - Create workspace
  fastify.post('/', async (request, reply) => {
    const { name } = assertZodSuccess(createWorkspaceSchema.safeParse(request.body));

    const workspace = await prisma.$transaction(async (tx) => {
      // Create workspace
      const ws = await tx.workspace.create({
        data: { name },
      });

      // Add creator as owner
      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId: request.user.id,
          role: 'owner',
        },
      });

      // Create default #general channel
      const generalChannel = await tx.channel.create({
        data: {
          workspaceId: ws.id,
          name: 'general',
          description: 'General discussions',
          isPrivate: false,
          createdBy: request.user.id,
        },
      });

      // Add creator to general channel
      await tx.channelMember.create({
        data: {
          channelId: generalChannel.id,
          userId: request.user.id,
        },
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          workspaceId: ws.id,
          actorId: request.user.id,
          action: 'workspace.created',
          metadata: { name: ws.name },
        },
      });

      return ws;
    });

    return reply.status(201).send({ workspace });
  });

  // GET /workspaces/:id - Get workspace details
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { id } = request.params;

    await requireWorkspaceMember(request.user.id, id);

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, displayName: true, avatarUrl: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        _count: {
          select: { channels: true, members: true },
        },
      },
    });

    if (!workspace) {
      throw errors.notFound('Workspace');
    }

    return { workspace };
  });

  // GET /workspaces/:id/members - List workspace members
  fastify.get<{ Params: { id: string } }>('/:id/members', async (request) => {
    const { id } = request.params;

    await requireWorkspaceMember(request.user.id, id);

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return { members };
  });

  // POST /workspaces/:id/invite - Invite member
  fastify.post<{ Params: { id: string } }>('/:id/invite', async (request, reply) => {
    const { id } = request.params;

    await requireWorkspaceRole(request.user.id, id, ['owner', 'admin']);

    const { email, role } = assertZodSuccess(
      inviteMemberSchema.safeParse(request.body)
    );

    // Find user by email
    const invitedUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!invitedUser) {
      throw errors.notFound('User with that email');
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: id, userId: invitedUser.id },
      },
    });

    if (existingMember) {
      throw errors.conflict('User is already a member of this workspace');
    }

    // Add member
    await prisma.$transaction(async (tx) => {
      await tx.workspaceMember.create({
        data: {
          workspaceId: id,
          userId: invitedUser.id,
          role,
        },
      });

      // Auto-join public channels
      const publicChannels = await tx.channel.findMany({
        where: { workspaceId: id, isPrivate: false },
        select: { id: true },
      });

      await tx.channelMember.createMany({
        data: publicChannels.map((ch) => ({
          channelId: ch.id,
          userId: invitedUser.id,
        })),
        skipDuplicates: true,
      });

      await tx.auditLog.create({
        data: {
          workspaceId: id,
          actorId: request.user.id,
          action: 'member.invited',
          metadata: { invitedUserId: invitedUser.id, email, role },
        },
      });
    });

    return reply.status(201).send({
      message: 'Member invited successfully',
      member: {
        userId: invitedUser.id,
        email: invitedUser.email,
        displayName: invitedUser.displayName,
        role,
      },
    });
  });

  // PATCH /workspaces/:id/members/:userId - Update member role
  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    async (request, reply) => {
      const { id, userId } = request.params;

      const { role: actorRole } = await requireWorkspaceRole(request.user.id, id, ['owner']);

      const { role: newRole } = assertZodSuccess(
        updateMemberRoleSchema.safeParse(request.body)
      );

      // Cannot change own role
      if (userId === request.user.id) {
        throw errors.validation('Cannot change your own role');
      }

      // Only owner can set owner role
      if (newRole === 'owner' && actorRole !== 'owner') {
        throw errors.insufficientRole('owner');
      }

      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: id, userId },
        },
      });

      if (!member) {
        throw errors.notFound('Member');
      }

      await prisma.$transaction(async (tx) => {
        await tx.workspaceMember.update({
          where: {
            workspaceId_userId: { workspaceId: id, userId },
          },
          data: { role: newRole },
        });

        await tx.auditLog.create({
          data: {
            workspaceId: id,
            actorId: request.user.id,
            action: 'member.role_changed',
            metadata: { userId, oldRole: member.role, newRole },
          },
        });
      });

      return reply.send({ message: 'Role updated' });
    }
  );

  // DELETE /workspaces/:id/members/:userId - Remove member
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    async (request, reply) => {
      const { id, userId } = request.params;

      await requireWorkspaceRole(request.user.id, id, ['owner', 'admin']);

      // Cannot remove yourself (use leave instead)
      if (userId === request.user.id) {
        throw errors.validation('Use leave endpoint to remove yourself');
      }

      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: id, userId },
        },
      });

      if (!member) {
        throw errors.notFound('Member');
      }

      // Cannot remove owner
      if (member.role === 'owner') {
        throw errors.forbidden('Cannot remove workspace owner');
      }

      await prisma.$transaction(async (tx) => {
        await tx.workspaceMember.delete({
          where: {
            workspaceId_userId: { workspaceId: id, userId },
          },
        });

        await tx.auditLog.create({
          data: {
            workspaceId: id,
            actorId: request.user.id,
            action: 'member.removed',
            metadata: { removedUserId: userId },
          },
        });
      });

      return reply.status(204).send();
    }
  );
};
