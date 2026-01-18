import type { FastifyPluginAsync } from 'fastify';
import {
  saveMessageSchema,
  getSavedMessagesSchema,
} from '@teamchat/shared';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireChannelAccess, requireDmAccess } from '../middleware/auth.js';

export const savedRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /saved - Get user's saved messages
  fastify.get('/', async (request) => {
    const result = getSavedMessagesSchema.safeParse(request.query);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { cursor, limit } = result.data;

    const savedMessages = await prisma.savedMessage.findMany({
      where: {
        userId: request.user.id,
        ...(cursor && { savedAt: { lt: new Date(cursor) } }),
      },
      include: {
        message: {
          include: {
            sender: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
            channel: {
              select: { id: true, name: true },
            },
            dmThread: {
              select: { id: true },
            },
            files: {
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                size: true,
              },
            },
          },
        },
      },
      orderBy: { savedAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = savedMessages.length > limit;
    const items = hasMore ? savedMessages.slice(0, limit) : savedMessages;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].savedAt.toISOString() : null,
      hasMore,
    };
  });

  // POST /saved - Save a message
  fastify.post('/', async (request, reply) => {
    const result = saveMessageSchema.safeParse(request.body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { messageId, note } = result.data;

    // Verify message exists
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true, dmThreadId: true, isDeleted: true },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    if (message.isDeleted) {
      throw errors.validation('Cannot save a deleted message');
    }

    // Verify user has access to the message
    if (message.channelId) {
      await requireChannelAccess(request.user.id, message.channelId);
    } else if (message.dmThreadId) {
      await requireDmAccess(request.user.id, message.dmThreadId);
    }

    // Check if already saved
    const existing = await prisma.savedMessage.findUnique({
      where: { userId_messageId: { userId: request.user.id, messageId } },
    });

    if (existing) {
      // Update note if provided
      if (note !== undefined) {
        const updated = await prisma.savedMessage.update({
          where: { id: existing.id },
          data: { note },
          include: {
            message: {
              include: {
                sender: {
                  select: { id: true, displayName: true, avatarUrl: true },
                },
                channel: {
                  select: { id: true, name: true },
                },
                files: {
                  select: {
                    id: true,
                    originalName: true,
                    mimeType: true,
                    size: true,
                  },
                },
              },
            },
          },
        });
        return reply.send({ savedMessage: updated, created: false });
      }
      return reply.send({ savedMessage: existing, created: false });
    }

    const savedMessage = await prisma.savedMessage.create({
      data: {
        userId: request.user.id,
        messageId,
        note,
      },
      include: {
        message: {
          include: {
            sender: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
            channel: {
              select: { id: true, name: true },
            },
            files: {
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                size: true,
              },
            },
          },
        },
      },
    });

    return reply.status(201).send({ savedMessage, created: true });
  });

  // GET /saved/:messageId - Check if message is saved
  fastify.get<{ Params: { messageId: string } }>('/:messageId', async (request) => {
    const { messageId } = request.params;

    const savedMessage = await prisma.savedMessage.findUnique({
      where: { userId_messageId: { userId: request.user.id, messageId } },
    });

    return { saved: !!savedMessage, savedMessage };
  });

  // DELETE /saved/:messageId - Unsave a message
  fastify.delete<{ Params: { messageId: string } }>('/:messageId', async (request, reply) => {
    const { messageId } = request.params;

    const existing = await prisma.savedMessage.findUnique({
      where: { userId_messageId: { userId: request.user.id, messageId } },
    });

    if (!existing) {
      throw errors.notFound('Saved message');
    }

    await prisma.savedMessage.delete({
      where: { id: existing.id },
    });

    return reply.status(204).send();
  });
};
