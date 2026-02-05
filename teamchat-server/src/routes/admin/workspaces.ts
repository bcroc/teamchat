import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { logAdminAction } from '../../middleware/adminAuth.js';
import { paginationSchema } from './schemas.js';
import { buildPagination } from '../helpers/pagination.js';

export function registerAdminWorkspaceRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Querystring: z.infer<typeof paginationSchema> & { status?: string } }>(
    '/workspaces',
    async (request) => {
      const { page, limit, search, sortBy, sortOrder, status } = {
        ...paginationSchema.parse(request.query),
        status: request.query.status,
      };

      const skip = (page - 1) * limit;

      const where: any = {};
      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }
      if (status === 'disabled') {
        where.isDisabled = true;
      } else if (status === 'active') {
        where.isDisabled = false;
      }

      const [workspaces, total] = await Promise.all([
        prisma.workspace.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy || 'createdAt']: sortOrder },
          select: {
            id: true,
            name: true,
            description: true,
            isPublic: true,
            isDisabled: true,
            disabledAt: true,
            maxMembers: true,
            createdAt: true,
            _count: {
              select: {
                members: true,
                channels: true,
                messages: true,
              },
            },
          },
        }),
        prisma.workspace.count({ where }),
      ]);

      return {
        workspaces: workspaces.map((w) => ({
          ...w,
          memberCount: w._count.members,
          channelCount: w._count.channels,
          messageCount: w._count.messages,
        })),
        pagination: buildPagination(page, limit, total),
      };
    }
  );

  fastify.get<{ Params: { id: string } }>('/workspaces/:id', async (request) => {
    const { id } = request.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, displayName: true } },
          },
          take: 50,
        },
        _count: {
          select: {
            members: true,
            channels: true,
            messages: true,
            files: true,
            bots: true,
          },
        },
      },
    });

    if (!workspace) {
      throw errors.notFound('Workspace');
    }

    return { workspace };
  });

  fastify.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/workspaces/:id/disable',
    async (request) => {
      const { id } = request.params;
      const { reason } = request.body || {};

      const workspace = await prisma.workspace.findUnique({ where: { id } });

      if (!workspace) {
        throw errors.notFound('Workspace');
      }

      if (workspace.isDisabled) {
        throw errors.validation('Workspace is already disabled');
      }

      await prisma.workspace.update({
        where: { id },
        data: {
          isDisabled: true,
          disabledAt: new Date(),
          disabledBy: request.user.id,
        },
      });

      await logAdminAction(
        request.user.id,
        'workspace.disable',
        'workspace',
        id,
        { workspaceName: workspace.name, reason },
        request
      );

      return { success: true, message: 'Workspace disabled' };
    }
  );

  fastify.post<{ Params: { id: string } }>('/workspaces/:id/enable', async (request) => {
    const { id } = request.params;

    const workspace = await prisma.workspace.findUnique({ where: { id } });

    if (!workspace) {
      throw errors.notFound('Workspace');
    }

    if (!workspace.isDisabled) {
      throw errors.validation('Workspace is not disabled');
    }

    await prisma.workspace.update({
      where: { id },
      data: {
        isDisabled: false,
        disabledAt: null,
        disabledBy: null,
      },
    });

    await logAdminAction(
      request.user.id,
      'workspace.enable',
      'workspace',
      id,
      { workspaceName: workspace.name },
      request
    );

    return { success: true, message: 'Workspace enabled' };
  });

  fastify.delete<{ Params: { id: string } }>('/workspaces/:id', async (request, reply) => {
    const { id } = request.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });

    if (!workspace) {
      throw errors.notFound('Workspace');
    }

    await prisma.workspace.delete({ where: { id } });

    await logAdminAction(
      request.user.id,
      'workspace.delete',
      'workspace',
      id,
      { workspaceName: workspace.name, memberCount: workspace._count.members },
      request
    );

    reply.status(204);
    return;
  });
}
