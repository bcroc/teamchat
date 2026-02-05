import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { paginationSchema } from './schemas.js';
import { buildPagination } from '../helpers/pagination.js';

export function registerAdminAuditLogRoutes(fastify: FastifyInstance): void {
  fastify.get<{
    Querystring: z.infer<typeof paginationSchema> & {
      action?: string;
      adminId?: string;
      targetType?: string;
    };
  }>('/audit-logs', async (request) => {
    const { page, limit, sortOrder, action, adminId, targetType } = {
      ...paginationSchema.parse(request.query),
      action: request.query.action,
      adminId: request.query.adminId,
      targetType: request.query.targetType,
    };

    const skip = (page - 1) * limit;

    const where: any = {};
    if (action) where.action = action;
    if (adminId) where.adminId = adminId;
    if (targetType) where.targetType = targetType;

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    const adminIds = [...new Set(logs.map((l) => l.adminId))];
    const admins = await prisma.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, email: true, displayName: true },
    });
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    return {
      logs: logs.map((log) => ({
        ...log,
        admin: adminMap.get(log.adminId) || null,
      })),
      pagination: {
        ...buildPagination(page, limit, total),
      },
    };
  });
}
