import type { FastifyInstance } from 'fastify';
import { addReactionSchema, SOCKET_EVENTS } from '@teamchat/shared';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { requireChannelAccess, requireDmAccess } from '../../middleware/auth.js';
import { emitToScope } from './helpers.js';
import { assertZodSuccess } from '../helpers/validation.js';

export function registerMessageReactionRoutes(fastify: FastifyInstance): void {
  fastify.post<{ Params: { id: string } }>('/:id/reactions', async (request, reply) => {
    const { id } = request.params;

    const { emoji } = assertZodSuccess(addReactionSchema.safeParse(request.body));

    const message = await prisma.message.findUnique({
      where: { id },
      select: { channelId: true, dmThreadId: true },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    if (message.channelId) {
      await requireChannelAccess(request.user.id, message.channelId);
    } else if (message.dmThreadId) {
      await requireDmAccess(request.user.id, message.dmThreadId);
    }

    const existing = await prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId: id,
          userId: request.user.id,
          emoji,
        },
      },
    });

    if (existing) {
      return reply.send({ reaction: existing, created: false });
    }

    const reaction = await prisma.reaction.create({
      data: {
        messageId: id,
        userId: request.user.id,
        emoji,
      },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    emitToScope(fastify.io, SOCKET_EVENTS.REACTION_ADDED, { reaction, messageId: id }, {
      channelId: message.channelId,
      dmThreadId: message.dmThreadId,
    });

    return reply.status(201).send({ reaction, created: true });
  });

  fastify.delete<{ Params: { id: string; emoji: string } }>('/:id/reactions/:emoji', async (request, reply) => {
    const { id, emoji } = request.params;
    const decodedEmoji = decodeURIComponent(emoji);

    const message = await prisma.message.findUnique({
      where: { id },
      select: { channelId: true, dmThreadId: true },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    const reaction = await prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId: id,
          userId: request.user.id,
          emoji: decodedEmoji,
        },
      },
    });

    await prisma.reaction.deleteMany({
      where: {
        messageId: id,
        userId: request.user.id,
        emoji: decodedEmoji,
      },
    });

    if (reaction) {
      emitToScope(
        fastify.io,
        SOCKET_EVENTS.REACTION_REMOVED,
        { reactionId: reaction.id, messageId: id, emoji: decodedEmoji },
        {
          channelId: message.channelId,
          dmThreadId: message.dmThreadId,
        }
      );
    }

    return reply.status(204).send();
  });
}
