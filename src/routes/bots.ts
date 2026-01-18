import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireWorkspaceRole } from '../middleware/auth.js';
import { generateBotToken, BOT_SCOPES, type BotScope } from '../middleware/botAuth.js';

// Validation schemas
const createBotSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'Name must be lowercase alphanumeric with dashes/underscores'),
  displayName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  scopes: z.array(z.string()).min(1),
});

const updateBotSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  isEnabled: z.boolean().optional(),
});

const createTokenSchema = z.object({
  name: z.string().min(1).max(100).default('default'),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const updateScopesSchema = z.object({
  scopes: z.array(z.string()).min(1),
});

// Validate scopes
function validateScopes(scopes: string[]): void {
  const validScopes = Object.values(BOT_SCOPES);
  const invalidScopes = scopes.filter((s) => !validScopes.includes(s as BotScope));
  if (invalidScopes.length > 0) {
    throw errors.validation(`Invalid scopes: ${invalidScopes.join(', ')}`);
  }
}

export default async function botsRoutes(fastify: FastifyInstance) {
  // Get all bots in a workspace
  fastify.get<{ Querystring: { workspaceId: string } }>(
    '/',
    { preHandler: [authenticate] },
    async (request) => {
      const { workspaceId } = request.query;

      await requireWorkspaceRole(request.user.id, workspaceId, ['owner', 'admin']);

      const bots = await prisma.bot.findMany({
        where: { workspaceId },
        include: {
          scopes: true,
          _count: {
            select: {
              tokens: { where: { isRevoked: false } },
              incomingWebhooks: true,
              outgoingWebhooks: true,
              slashCommands: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        bots: bots.map((bot) => ({
          id: bot.id,
          workspaceId: bot.workspaceId,
          name: bot.name,
          displayName: bot.displayName,
          description: bot.description,
          avatarUrl: bot.avatarUrl,
          isEnabled: bot.isEnabled,
          createdAt: bot.createdAt,
          updatedAt: bot.updatedAt,
          scopes: bot.scopes.map((s) => s.scope),
          tokenCount: bot._count.tokens,
          webhookCount: bot._count.incomingWebhooks + bot._count.outgoingWebhooks,
          commandCount: bot._count.slashCommands,
        })),
      };
    }
  );

  // Get a single bot
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [authenticate] },
    async (request) => {
      const bot = await prisma.bot.findUnique({
        where: { id: request.params.id },
        include: {
          scopes: true,
          tokens: {
            where: { isRevoked: false },
            select: {
              id: true,
              tokenPrefix: true,
              name: true,
              lastUsedAt: true,
              expiresAt: true,
              createdAt: true,
            },
          },
          creator: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      });

      if (!bot) {
        throw errors.notFound('Bot');
      }

      await requireWorkspaceRole(request.user.id, bot.workspaceId, ['owner', 'admin']);

      return {
        bot: {
          id: bot.id,
          workspaceId: bot.workspaceId,
          name: bot.name,
          displayName: bot.displayName,
          description: bot.description,
          avatarUrl: bot.avatarUrl,
          isEnabled: bot.isEnabled,
          createdAt: bot.createdAt,
          updatedAt: bot.updatedAt,
          scopes: bot.scopes.map((s) => s.scope),
          tokens: bot.tokens,
          creator: bot.creator,
        },
      };
    }
  );

  // Create a new bot
  fastify.post<{ Body: z.infer<typeof createBotSchema> }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = createBotSchema.parse(request.body);

      await requireWorkspaceRole(request.user.id, data.workspaceId, ['owner', 'admin']);

      // Validate scopes
      validateScopes(data.scopes);

      // Check for duplicate name
      const existing = await prisma.bot.findUnique({
        where: {
          workspaceId_name: {
            workspaceId: data.workspaceId,
            name: data.name,
          },
        },
      });

      if (existing) {
        throw errors.conflict('A bot with this name already exists');
      }

      // Create bot with scopes
      const bot = await prisma.bot.create({
        data: {
          workspaceId: data.workspaceId,
          name: data.name,
          displayName: data.displayName,
          description: data.description,
          avatarUrl: data.avatarUrl,
          createdBy: request.user.id,
          scopes: {
            create: data.scopes.map((scope) => ({ scope })),
          },
        },
        include: {
          scopes: true,
        },
      });

      // Generate initial token
      const { token, prefix, hash } = generateBotToken();

      await prisma.botToken.create({
        data: {
          botId: bot.id,
          token: hash,
          tokenPrefix: prefix,
          name: 'default',
        },
      });

      reply.status(201);
      return {
        bot: {
          id: bot.id,
          workspaceId: bot.workspaceId,
          name: bot.name,
          displayName: bot.displayName,
          description: bot.description,
          avatarUrl: bot.avatarUrl,
          isEnabled: bot.isEnabled,
          createdAt: bot.createdAt,
          scopes: bot.scopes.map((s) => s.scope),
        },
        // Return the token only once at creation
        token: {
          token: token, // Plain token - only shown once
          prefix: prefix,
          name: 'default',
        },
      };
    }
  );

  // Update a bot
  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateBotSchema> }>(
    '/:id',
    { preHandler: [authenticate] },
    async (request) => {
      const data = updateBotSchema.parse(request.body);

      const bot = await prisma.bot.findUnique({
        where: { id: request.params.id },
      });

      if (!bot) {
        throw errors.notFound('Bot');
      }

      await requireWorkspaceRole(request.user.id, bot.workspaceId, ['owner', 'admin']);

      const updated = await prisma.bot.update({
        where: { id: request.params.id },
        data: {
          ...(data.displayName !== undefined && { displayName: data.displayName }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
          ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        },
        include: { scopes: true },
      });

      return {
        bot: {
          id: updated.id,
          workspaceId: updated.workspaceId,
          name: updated.name,
          displayName: updated.displayName,
          description: updated.description,
          avatarUrl: updated.avatarUrl,
          isEnabled: updated.isEnabled,
          updatedAt: updated.updatedAt,
          scopes: updated.scopes.map((s) => s.scope),
        },
      };
    }
  );

  // Delete a bot
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const bot = await prisma.bot.findUnique({
        where: { id: request.params.id },
      });

      if (!bot) {
        throw errors.notFound('Bot');
      }

      await requireWorkspaceRole(request.user.id, bot.workspaceId, ['owner', 'admin']);

      await prisma.bot.delete({
        where: { id: request.params.id },
      });

      reply.status(204);
      return;
    }
  );

  // Update bot scopes
  fastify.put<{ Params: { id: string }; Body: z.infer<typeof updateScopesSchema> }>(
    '/:id/scopes',
    { preHandler: [authenticate] },
    async (request) => {
      const data = updateScopesSchema.parse(request.body);

      const bot = await prisma.bot.findUnique({
        where: { id: request.params.id },
      });

      if (!bot) {
        throw errors.notFound('Bot');
      }

      await requireWorkspaceRole(request.user.id, bot.workspaceId, ['owner', 'admin']);

      validateScopes(data.scopes);

      // Delete existing scopes and create new ones
      await prisma.$transaction([
        prisma.botScope.deleteMany({ where: { botId: bot.id } }),
        prisma.botScope.createMany({
          data: data.scopes.map((scope) => ({ botId: bot.id, scope })),
        }),
      ]);

      return {
        scopes: data.scopes,
      };
    }
  );

  // ============================================
  // Token Management
  // ============================================

  // Create a new token
  fastify.post<{ Params: { id: string }; Body: z.infer<typeof createTokenSchema> }>(
    '/:id/tokens',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = createTokenSchema.parse(request.body);

      const bot = await prisma.bot.findUnique({
        where: { id: request.params.id },
      });

      if (!bot) {
        throw errors.notFound('Bot');
      }

      await requireWorkspaceRole(request.user.id, bot.workspaceId, ['owner', 'admin']);

      const { token, prefix, hash } = generateBotToken();

      const expiresAt = data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const created = await prisma.botToken.create({
        data: {
          botId: bot.id,
          token: hash,
          tokenPrefix: prefix,
          name: data.name,
          expiresAt,
        },
      });

      reply.status(201);
      return {
        token: {
          id: created.id,
          token: token, // Plain token - only shown once
          prefix: prefix,
          name: created.name,
          expiresAt: created.expiresAt,
          createdAt: created.createdAt,
        },
      };
    }
  );

  // List tokens for a bot
  fastify.get<{ Params: { id: string } }>(
    '/:id/tokens',
    { preHandler: [authenticate] },
    async (request) => {
      const bot = await prisma.bot.findUnique({
        where: { id: request.params.id },
      });

      if (!bot) {
        throw errors.notFound('Bot');
      }

      await requireWorkspaceRole(request.user.id, bot.workspaceId, ['owner', 'admin']);

      const tokens = await prisma.botToken.findMany({
        where: { botId: bot.id },
        select: {
          id: true,
          tokenPrefix: true,
          name: true,
          lastUsedAt: true,
          expiresAt: true,
          isRevoked: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return { tokens };
    }
  );

  // Revoke a token
  fastify.post<{ Params: { id: string; tokenId: string } }>(
    '/:id/tokens/:tokenId/revoke',
    { preHandler: [authenticate] },
    async (request) => {
      const token = await prisma.botToken.findUnique({
        where: { id: request.params.tokenId },
        include: { bot: true },
      });

      if (!token || token.botId !== request.params.id) {
        throw errors.notFound('Token');
      }

      await requireWorkspaceRole(request.user.id, token.bot.workspaceId, ['owner', 'admin']);

      await prisma.botToken.update({
        where: { id: request.params.tokenId },
        data: { isRevoked: true },
      });

      return { success: true };
    }
  );

  // Delete a token
  fastify.delete<{ Params: { id: string; tokenId: string } }>(
    '/:id/tokens/:tokenId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const token = await prisma.botToken.findUnique({
        where: { id: request.params.tokenId },
        include: { bot: true },
      });

      if (!token || token.botId !== request.params.id) {
        throw errors.notFound('Token');
      }

      await requireWorkspaceRole(request.user.id, token.bot.workspaceId, ['owner', 'admin']);

      await prisma.botToken.delete({
        where: { id: request.params.tokenId },
      });

      reply.status(204);
      return;
    }
  );

  // ============================================
  // Bot API Endpoints (for bots to use)
  // ============================================

  // Get available scopes
  fastify.get('/scopes', async () => {
    return {
      scopes: Object.entries(BOT_SCOPES).map(([key, value]) => ({
        key,
        value,
        description: getScopeDescription(value),
      })),
    };
  });
}

// Helper to get scope descriptions
function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    'messages:read': 'Read messages in channels the bot has access to',
    'messages:write': 'Send messages to channels',
    'messages:delete': 'Delete messages sent by the bot',
    'channels:read': 'View channel information',
    'channels:write': 'Create and modify channels',
    'channels:history': 'Access message history in channels',
    'users:read': 'View user profile information',
    'reactions:read': 'View reactions on messages',
    'reactions:write': 'Add and remove reactions',
    'files:read': 'View and download files',
    'files:write': 'Upload files',
    'webhooks:read': 'View webhook configurations',
    'webhooks:write': 'Create and manage webhooks',
  };
  return descriptions[scope] || scope;
}
