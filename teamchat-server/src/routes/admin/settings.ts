import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { logAdminAction, getServerSettings } from '../../middleware/adminAuth.js';
import { updateServerSettingsSchema } from './schemas.js';

export function registerAdminSettingsRoutes(fastify: FastifyInstance): void {
  fastify.get('/settings', async () => {
    const settings = await getServerSettings();
    return { settings };
  });

  fastify.patch<{ Body: z.infer<typeof updateServerSettingsSchema> }>(
    '/settings',
    async (request) => {
      const data = updateServerSettingsSchema.parse(request.body);

      const settings = await prisma.serverSettings.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...data },
        update: data,
      });

      await logAdminAction(
        request.user.id,
        'settings.update',
        'settings',
        'default',
        { changes: data },
        request
      );

      return { settings };
    }
  );
}
