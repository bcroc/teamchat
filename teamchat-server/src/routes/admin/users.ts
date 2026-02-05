import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { logAdminAction } from '../../middleware/adminAuth.js';
import { paginationSchema, suspendUserSchema } from './schemas.js';
import { buildPagination } from '../helpers/pagination.js';

export function registerAdminUserRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Querystring: z.infer<typeof paginationSchema> & { status?: string } }>(
    '/users',
    async (request) => {
      const { page, limit, search, sortBy, sortOrder, status } = {
        ...paginationSchema.parse(request.query),
        status: request.query.status,
      };

      const skip = (page - 1) * limit;

      const where: any = {};
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (status === 'suspended') {
        where.isSuspended = true;
      } else if (status === 'active') {
        where.isSuspended = false;
      } else if (status === 'admin') {
        where.isServerAdmin = true;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy || 'createdAt']: sortOrder },
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            isServerAdmin: true,
            isSuspended: true,
            suspendedAt: true,
            suspendReason: true,
            lastLoginAt: true,
            loginCount: true,
            createdAt: true,
            _count: {
              select: {
                workspaceMembers: true,
                messages: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      return {
        users: users.map((u) => ({
          ...u,
          workspaceCount: u._count.workspaceMembers,
          messageCount: u._count.messages,
        })),
        pagination: buildPagination(page, limit, total),
      };
    }
  );

  fastify.get<{ Params: { id: string } }>('/users/:id', async (request) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        isServerAdmin: true,
        isSuspended: true,
        suspendedAt: true,
        suspendedBy: true,
        suspendReason: true,
        lastLoginAt: true,
        loginCount: true,
        createdAt: true,
        workspaceMembers: {
          include: {
            workspace: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: {
            messages: true,
            uploadedFiles: true,
            createdBots: true,
          },
        },
      },
    });

    if (!user) {
      throw errors.notFound('User');
    }

    return { user };
  });

  fastify.post<{ Params: { id: string }; Body: z.infer<typeof suspendUserSchema> }>(
    '/users/:id/suspend',
    async (request) => {
      const { id } = request.params;
      const { reason } = suspendUserSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { id } });

      if (!user) {
        throw errors.notFound('User');
      }

      if (user.id === request.user.id) {
        throw errors.forbidden('Cannot suspend yourself');
      }

      if (user.isSuspended) {
        throw errors.validation('User is already suspended');
      }

      await prisma.user.update({
        where: { id },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedBy: request.user.id,
          suspendReason: reason,
        },
      });

      await logAdminAction(
        request.user.id,
        'user.suspend',
        'user',
        id,
        { reason, userEmail: user.email },
        request
      );

      return { success: true, message: 'User suspended' };
    }
  );

  fastify.post<{ Params: { id: string } }>('/users/:id/unsuspend', async (request) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw errors.notFound('User');
    }

    if (!user.isSuspended) {
      throw errors.validation('User is not suspended');
    }

    await prisma.user.update({
      where: { id },
      data: {
        isSuspended: false,
        suspendedAt: null,
        suspendedBy: null,
        suspendReason: null,
      },
    });

    await logAdminAction(
      request.user.id,
      'user.unsuspend',
      'user',
      id,
      { userEmail: user.email },
      request
    );

    return { success: true, message: 'User unsuspended' };
  });

  fastify.post<{ Params: { id: string } }>('/users/:id/promote', async (request) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw errors.notFound('User');
    }

    if (user.isServerAdmin) {
      throw errors.validation('User is already a server admin');
    }

    if (user.isSuspended) {
      throw errors.validation('Cannot promote a suspended user');
    }

    await prisma.user.update({
      where: { id },
      data: { isServerAdmin: true },
    });

    await logAdminAction(
      request.user.id,
      'user.promote',
      'user',
      id,
      { userEmail: user.email },
      request
    );

    return { success: true, message: 'User promoted to server admin' };
  });

  fastify.post<{ Params: { id: string } }>('/users/:id/demote', async (request) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw errors.notFound('User');
    }

    if (user.id === request.user.id) {
      throw errors.forbidden('Cannot demote yourself');
    }

    if (!user.isServerAdmin) {
      throw errors.validation('User is not a server admin');
    }

    const adminCount = await prisma.user.count({ where: { isServerAdmin: true } });
    if (adminCount <= 1) {
      throw errors.forbidden('Cannot demote the last server admin');
    }

    await prisma.user.update({
      where: { id },
      data: { isServerAdmin: false },
    });

    await logAdminAction(
      request.user.id,
      'user.demote',
      'user',
      id,
      { userEmail: user.email },
      request
    );

    return { success: true, message: 'User demoted from server admin' };
  });

  fastify.delete<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw errors.notFound('User');
    }

    if (user.id === request.user.id) {
      throw errors.forbidden('Cannot delete yourself');
    }

    if (user.isServerAdmin) {
      throw errors.forbidden('Cannot delete a server admin. Demote first.');
    }

    await prisma.user.delete({ where: { id } });

    await logAdminAction(
      request.user.id,
      'user.delete',
      'user',
      id,
      { userEmail: user.email, displayName: user.displayName },
      request
    );

    reply.status(204);
    return;
  });
}
