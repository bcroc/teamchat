import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { authenticate, requireWorkspaceRole } from '../../middleware/auth.js';
import { generateBotToken } from '../../middleware/botAuth.js';
import { createTokenSchema } from './schemas.js';

export function registerBotTokenRoutes(fastify: FastifyInstance): void {
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
          token: token,
          prefix: prefix,
          name: created.name,
          expiresAt: created.expiresAt,
          createdAt: created.createdAt,
        },
      };
    }
  );

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
}
