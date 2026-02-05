import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { authenticate } from '../../middleware/auth.js';
import { requireScopeAccessWithMessage } from '../helpers/scope.js';

export function registerInteractionActionRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { messageId: string } }>(
    '/message/:messageId',
    { preHandler: [authenticate] },
    async (request) => {
      const message = await prisma.message.findUnique({
        where: { id: request.params.messageId },
        select: { channelId: true, dmThreadId: true },
      });

      if (!message) {
        throw errors.notFound('Message');
      }

      await requireScopeAccessWithMessage(
        request.user.id,
        { channelId: message.channelId, dmThreadId: message.dmThreadId },
        'Invalid message scope'
      );

      const actions = await prisma.interactiveMessageAction.findMany({
        where: { messageId: request.params.messageId },
        orderBy: { position: 'asc' },
      });

      return { actions };
    }
  );
}
