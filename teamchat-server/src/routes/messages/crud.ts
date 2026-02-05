import type { FastifyInstance } from 'fastify';
import { updateMessageSchema, SOCKET_EVENTS } from '@teamchat/shared';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { requireChannelAccess, requireDmAccess } from '../../middleware/auth.js';
import { emitToScope, messageInclude, withReplyCount } from './helpers.js';
import { assertZodSuccess } from '../helpers/validation.js';

export function registerMessageCrudRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { id } = request.params;

    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, displayName: true },
            },
          },
        },
        files: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
          },
        },
        _count: {
          select: { replies: true },
        },
      },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    if (message.channelId) {
      await requireChannelAccess(request.user.id, message.channelId);
    } else if (message.dmThreadId) {
      await requireDmAccess(request.user.id, message.dmThreadId);
    }

    return {
      message: withReplyCount(message),
    };
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const { body } = assertZodSuccess(updateMessageSchema.safeParse(request.body));

    const message = await prisma.message.findUnique({
      where: { id },
      select: { senderId: true, channelId: true, dmThreadId: true, isDeleted: true },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    if (message.isDeleted) {
      throw errors.validation('Cannot edit deleted message');
    }

    if (message.senderId !== request.user.id) {
      throw errors.forbidden('Can only edit your own messages');
    }

    const updated = await prisma.message.update({
      where: { id },
      data: { body },
      include: messageInclude,
    });

    const updatedWithReplyCount = withReplyCount(updated);

    emitToScope(fastify.io, SOCKET_EVENTS.MESSAGE_UPDATED, updatedWithReplyCount, {
      channelId: message.channelId,
      dmThreadId: message.dmThreadId,
    });

    return reply.send({ message: updatedWithReplyCount });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const message = await prisma.message.findUnique({
      where: { id },
      select: { senderId: true, channelId: true, dmThreadId: true, workspaceId: true },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    const canDelete = message.senderId === request.user.id;

    if (!canDelete) {
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: message.workspaceId, userId: request.user.id },
        },
      });

      if (!member || !['owner', 'admin'].includes(member.role)) {
        throw errors.forbidden('Can only delete your own messages');
      }
    }

    await prisma.message.update({
      where: { id },
      data: {
        isDeleted: true,
        body: '[Message deleted]',
      },
    });

    emitToScope(fastify.io, SOCKET_EVENTS.MESSAGE_DELETED, { messageId: id }, {
      channelId: message.channelId,
      dmThreadId: message.dmThreadId,
    });

    return reply.status(204).send();
  });
}
