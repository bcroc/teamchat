import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';

export function registerAdminDashboardRoutes(fastify: FastifyInstance): void {
  fastify.get('/dashboard', async () => {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalWorkspaces,
      disabledWorkspaces,
      totalMessages,
      totalFiles,
      recentUsers,
      recentWorkspaces,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isSuspended: false } }),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.workspace.count(),
      prisma.workspace.count({ where: { isDisabled: true } }),
      prisma.message.count(),
      prisma.file.count(),
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, displayName: true, createdAt: true },
      }),
      prisma.workspace.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, createdAt: true, _count: { select: { members: true } } },
      }),
    ]);

    const storageStats = await prisma.file.aggregate({
      _sum: { size: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayMessages, todayUsers] = await Promise.all([
      prisma.message.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
    ]);

    return {
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          suspended: suspendedUsers,
          newToday: todayUsers,
        },
        workspaces: {
          total: totalWorkspaces,
          disabled: disabledWorkspaces,
        },
        messages: {
          total: totalMessages,
          today: todayMessages,
        },
        storage: {
          totalFiles: totalFiles,
          totalBytes: storageStats._sum.size || 0,
        },
      },
      recent: {
        users: recentUsers,
        workspaces: recentWorkspaces.map((w) => ({
          ...w,
          memberCount: w._count.members,
        })),
      },
    };
  });
}
