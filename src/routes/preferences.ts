import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireWorkspaceMember, requireChannelAccess } from '../middleware/auth.js';

const updatePreferencesSchema = z.object({
  desktopNotifications: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  notifyOnMentions: z.boolean().optional(),
  notifyOnDms: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  fontSize: z.enum(['small', 'medium', 'large']).optional(),
  compactMode: z.boolean().optional(),
});

const updateChannelSettingsSchema = z.object({
  muted: z.boolean().optional(),
  muteUntil: z.string().datetime().nullable().optional(),
  notificationLevel: z.enum(['all', 'mentions', 'none']).optional(),
});

export const preferencesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /preferences - Get user preferences
  fastify.get('/', async (request) => {
    let preferences = await prisma.userPreferences.findUnique({
      where: { userId: request.user.id },
    });

    // Create default preferences if none exist
    if (!preferences) {
      preferences = await prisma.userPreferences.create({
        data: { userId: request.user.id },
      });
    }

    return { preferences };
  });

  // PATCH /preferences - Update user preferences
  fastify.patch<{ Body: z.infer<typeof updatePreferencesSchema> }>(
    '/',
    async (request, reply) => {
      const result = updatePreferencesSchema.safeParse(request.body);
      if (!result.success) {
        throw errors.validation('Invalid input', { errors: result.error.flatten() });
      }

      const preferences = await prisma.userPreferences.upsert({
        where: { userId: request.user.id },
        update: result.data,
        create: {
          userId: request.user.id,
          ...result.data,
        },
      });

      return reply.send({ preferences });
    }
  );

  // GET /preferences/channels/:channelId - Get channel-specific settings
  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId',
    async (request) => {
      const { channelId } = request.params;

      await requireChannelAccess(request.user.id, channelId);

      const settings = await prisma.channelSettings.findUnique({
        where: {
          channelId_userId: {
            channelId,
            userId: request.user.id,
          },
        },
      });

      // Return default settings if none exist
      return {
        settings: settings || {
          channelId,
          userId: request.user.id,
          muted: false,
          muteUntil: null,
          notificationLevel: 'all',
        },
      };
    }
  );

  // PATCH /preferences/channels/:channelId - Update channel-specific settings
  fastify.patch<{ Params: { channelId: string }; Body: z.infer<typeof updateChannelSettingsSchema> }>(
    '/channels/:channelId',
    async (request, reply) => {
      const { channelId } = request.params;
      const result = updateChannelSettingsSchema.safeParse(request.body);

      if (!result.success) {
        throw errors.validation('Invalid input', { errors: result.error.flatten() });
      }

      await requireChannelAccess(request.user.id, channelId);

      const updateData: any = { ...result.data };

      // Handle muteUntil
      if (result.data.muteUntil !== undefined) {
        updateData.muteUntil = result.data.muteUntil ? new Date(result.data.muteUntil) : null;
      }

      const settings = await prisma.channelSettings.upsert({
        where: {
          channelId_userId: {
            channelId,
            userId: request.user.id,
          },
        },
        update: updateData,
        create: {
          channelId,
          userId: request.user.id,
          ...updateData,
        },
      });

      return reply.send({ settings });
    }
  );

  // POST /preferences/channels/:channelId/mute - Quick mute channel
  fastify.post<{ Params: { channelId: string }; Body: { duration?: string } }>(
    '/channels/:channelId/mute',
    async (request, reply) => {
      const { channelId } = request.params;
      const { duration } = request.body;

      await requireChannelAccess(request.user.id, channelId);

      let muteUntil: Date | null = null;

      if (duration) {
        const now = new Date();
        switch (duration) {
          case '1h':
            muteUntil = new Date(now.getTime() + 60 * 60 * 1000);
            break;
          case '8h':
            muteUntil = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            break;
          case '24h':
            muteUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            break;
          case '1w':
            muteUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            break;
          // null means indefinitely muted
        }
      }

      const settings = await prisma.channelSettings.upsert({
        where: {
          channelId_userId: {
            channelId,
            userId: request.user.id,
          },
        },
        update: {
          muted: true,
          muteUntil,
        },
        create: {
          channelId,
          userId: request.user.id,
          muted: true,
          muteUntil,
        },
      });

      return reply.send({ settings });
    }
  );

  // POST /preferences/channels/:channelId/unmute - Unmute channel
  fastify.post<{ Params: { channelId: string } }>(
    '/channels/:channelId/unmute',
    async (request, reply) => {
      const { channelId } = request.params;

      await requireChannelAccess(request.user.id, channelId);

      const settings = await prisma.channelSettings.upsert({
        where: {
          channelId_userId: {
            channelId,
            userId: request.user.id,
          },
        },
        update: {
          muted: false,
          muteUntil: null,
        },
        create: {
          channelId,
          userId: request.user.id,
          muted: false,
          muteUntil: null,
        },
      });

      return reply.send({ settings });
    }
  );

  // GET /preferences/muted-channels - List all muted channels
  fastify.get<{ Querystring: { workspaceId: string } }>(
    '/muted-channels',
    async (request) => {
      const { workspaceId } = request.query;

      if (!workspaceId) {
        throw errors.validation('workspaceId is required');
      }

      await requireWorkspaceMember(request.user.id, workspaceId);

      const mutedSettings = await prisma.channelSettings.findMany({
        where: {
          userId: request.user.id,
          muted: true,
          channel: {
            workspaceId,
          },
        },
        include: {
          channel: {
            select: { id: true, name: true },
          },
        },
      });

      // Filter out expired mutes
      const now = new Date();
      const activeMutes = mutedSettings.filter(
        (s) => !s.muteUntil || s.muteUntil > now
      );

      return { mutedChannels: activeMutes };
    }
  );
};
