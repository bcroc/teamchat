import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { authenticate, requireWorkspaceRole } from '../../middleware/auth.js';
import { generateBotToken } from '../../middleware/botAuth.js';
import { createBotSchema, updateBotSchema, updateScopesSchema } from './schemas.js';
import { validateScopes } from './helpers.js';

export function registerBotManagementRoutes(fastify: FastifyInstance): void {
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

  fastify.post<{ Body: z.infer<typeof createBotSchema> }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = createBotSchema.parse(request.body);

      await requireWorkspaceRole(request.user.id, data.workspaceId, ['owner', 'admin']);

      validateScopes(data.scopes);

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
        token: {
          token: token,
          prefix: prefix,
          name: 'default',
        },
      };
    }
  );

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
}
