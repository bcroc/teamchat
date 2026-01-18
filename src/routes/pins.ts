import type { FastifyPluginAsync } from 'fastify';
import type { Server } from 'socket.io';
import {
  pinMessageSchema,
  getPinnedMessagesSchema,
  SOCKET_EVENTS,
} from '@teamchat/shared';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireChannelAccess } from '../middleware/auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

export const pinRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /pins/:channelId - Get pinned messages for a channel
  fastify.get<{ Params: { channelId: string } }>('/:channelId', async (request) => {
    const result = getPinnedMessagesSchema.safeParse({ channelId: request.params.channelId });
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { channelId } = result.data;

    // Verify channel access
    await requireChannelAccess(request.user.id, channelId);

    const pinnedMessages = await prisma.pinnedMessage.findMany({
      where: { channelId },
      include: {
        message: {
          include: {
            sender: {
              select: { id: true, displayName: true, avatarUrl: true },
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
        pinner: {
          select: { id: true, displayName: true },
        },
      },
      orderBy: { pinnedAt: 'desc' },
    });

    return { pinnedMessages };
  });

  // POST /pins/:channelId - Pin a message
  fastify.post<{ Params: { channelId: string } }>('/:channelId', async (request, reply) => {
    const { channelId } = request.params;
    const bodyResult = pinMessageSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw errors.validation('Invalid input', { errors: bodyResult.error.flatten() });
    }

    const { messageId } = bodyResult.data;

    // Verify channel access
    await requireChannelAccess(request.user.id, channelId);

    // Verify message exists and belongs to this channel
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true, isDeleted: true },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    if (message.channelId !== channelId) {
      throw errors.validation('Message does not belong to this channel');
    }

    if (message.isDeleted) {
      throw errors.validation('Cannot pin a deleted message');
    }

    // Check if already pinned
    const existing = await prisma.pinnedMessage.findUnique({
      where: { channelId_messageId: { channelId, messageId } },
    });

    if (existing) {
      return reply.send({ pinnedMessage: existing, created: false });
    }

    // Check pin limit (e.g., 50 pins per channel)
    const pinCount = await prisma.pinnedMessage.count({
      where: { channelId },
    });

    if (pinCount >= 50) {
      throw errors.validation('Channel has reached the maximum number of pinned messages (50)');
    }

    const pinnedMessage = await prisma.pinnedMessage.create({
      data: {
        channelId,
        messageId,
        pinnedBy: request.user.id,
      },
      include: {
        message: {
          include: {
            sender: {
              select: { id: true, displayName: true, avatarUrl: true },
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
        pinner: {
          select: { id: true, displayName: true },
        },
      },
    });

    // Emit socket event
    fastify.io?.to(`channel:${channelId}`).emit(SOCKET_EVENTS.MESSAGE_PINNED, {
      pinnedMessage,
      channelId,
    });

    return reply.status(201).send({ pinnedMessage, created: true });
  });

  // DELETE /pins/:channelId/:messageId - Unpin a message
  fastify.delete<{ Params: { channelId: string; messageId: string } }>(
    '/:channelId/:messageId',
    async (request, reply) => {
      const { channelId, messageId } = request.params;

      // Verify channel access
      await requireChannelAccess(request.user.id, channelId);

      const existing = await prisma.pinnedMessage.findUnique({
        where: { channelId_messageId: { channelId, messageId } },
      });

      if (!existing) {
        throw errors.notFound('Pinned message');
      }

      await prisma.pinnedMessage.delete({
        where: { channelId_messageId: { channelId, messageId } },
      });

      // Emit socket event
      fastify.io?.to(`channel:${channelId}`).emit(SOCKET_EVENTS.MESSAGE_UNPINNED, {
        messageId,
        channelId,
      });

      return reply.status(204).send();
    }
  );
};
