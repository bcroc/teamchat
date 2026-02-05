import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { getServerSettings } from '../../middleware/adminAuth.js';

export function registerPublicAdminRoutes(fastify: FastifyInstance): void {
  fastify.get('/active', async () => {
    const now = new Date();

    const announcements = await prisma.systemAnnouncement.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: [{ type: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        startsAt: true,
        endsAt: true,
      },
    });

    return { announcements };
  });

  fastify.get('/public', async () => {
    const settings = await getServerSettings();

    return {
      settings: {
        serverName: settings.serverName,
        serverDescription: settings.serverDescription,
        allowPublicRegistration: settings.allowPublicRegistration,
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
      },
    };
  });
}
