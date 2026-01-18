import type { FastifyPluginAsync } from 'fastify';
import type { Server } from 'socket.io';
import {
  createMessageSchema,
  updateMessageSchema,
  getMessagesSchema,
  addReactionSchema,
  updateReadSchema,
  searchSchema,
  SOCKET_EVENTS,
} from '@teamchat/shared';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireChannelAccess, requireDmAccess, requireScopeAccess } from '../middleware/auth.js';

// Extend fastify to include io
declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

export const messageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // Helper to emit to correct room
  const emitToScope = (
    event: string,
    data: any,
    scope: { channelId?: string | null; dmThreadId?: string | null }
  ) => {
    const room = scope.channelId ? `channel:${scope.channelId}` : `dm:${scope.dmThreadId}`;
    fastify.io?.to(room).emit(event, data);
  };

  // GET /messages - List messages
  fastify.get('/', async (request) => {
    const result = getMessagesSchema.safeParse(request.query);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { channelId, dmThreadId, parentId, cursor, limit } = result.data;

    // Verify access using unified helper
    const { workspaceId } = await requireScopeAccess(request.user.id, { channelId, dmThreadId });

    const where = {
      ...(channelId && { channelId }),
      ...(dmThreadId && { dmThreadId }),
      parentId: parentId || null,
      ...(cursor && { createdAt: { lt: new Date(cursor) } }),
    };

    const messages = await prisma.message.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    return {
      items: items.map((m) => ({
        ...m,
        replyCount: m._count.replies,
        _count: undefined,
      })),
      nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
      hasMore,
    };
  });

  // POST /messages - Create message
  fastify.post('/', async (request, reply) => {
    const result = createMessageSchema.safeParse(request.body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { channelId, dmThreadId, parentId, body, fileIds } = result.data;

    // Verify access using unified helper
    const { workspaceId } = await requireScopeAccess(request.user.id, { channelId, dmThreadId });

    // Verify parent message exists and belongs to same scope
    if (parentId) {
      const parent = await prisma.message.findUnique({
        where: { id: parentId },
        select: { channelId: true, dmThreadId: true },
      });

      if (!parent) {
        throw errors.notFound('Parent message');
      }

      if (parent.channelId !== channelId || parent.dmThreadId !== dmThreadId) {
        throw errors.validation('Parent message must be in the same scope');
      }
    }

    const message = await prisma.message.create({
      data: {
        workspaceId,
        channelId,
        dmThreadId,
        senderId: request.user.id,
        parentId,
        body,
        ...(fileIds?.length && {
          files: {
            connect: fileIds.map((id) => ({ id })),
          },
        }),
      },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        reactions: true,
        files: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
          },
        },
      },
    });

    const messageWithReplyCount = { ...message, replyCount: 0 };

    // Emit socket event
    emitToScope(SOCKET_EVENTS.MESSAGE_CREATED, messageWithReplyCount, { channelId, dmThreadId });

    return reply.status(201).send({ message: messageWithReplyCount });
  });

  // GET /messages/:id - Get single message
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

    // Verify access
    if (message.channelId) {
      await requireChannelAccess(request.user.id, message.channelId);
    } else if (message.dmThreadId) {
      await requireDmAccess(request.user.id, message.dmThreadId);
    }

    return {
      message: {
        ...message,
        replyCount: message._count.replies,
        _count: undefined,
      },
    };
  });

  // PATCH /messages/:id - Update message
  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const result = updateMessageSchema.safeParse(request.body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { body } = result.data;

    const message = await prisma.message.findUnique({
      where: { id },
      select: { senderId: true, channelId: true, dmThreadId: true },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    // Only sender can edit
    if (message.senderId !== request.user.id) {
      throw errors.forbidden('Can only edit your own messages');
    }

    const updated = await prisma.message.update({
      where: { id },
      data: { body },
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

    const updatedWithReplyCount = {
      ...updated,
      replyCount: updated._count.replies,
      _count: undefined,
    };

    // Emit socket event
    emitToScope(SOCKET_EVENTS.MESSAGE_UPDATED, updatedWithReplyCount, {
      channelId: message.channelId,
      dmThreadId: message.dmThreadId,
    });

    return reply.send({ message: updatedWithReplyCount });
  });

  // DELETE /messages/:id - Delete message (soft delete)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const message = await prisma.message.findUnique({
      where: { id },
      select: { senderId: true, channelId: true, dmThreadId: true, workspaceId: true },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    // Sender can delete, or admins in that workspace
    const canDelete = message.senderId === request.user.id;

    if (!canDelete) {
      // Check if admin
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

    // Emit socket event
    emitToScope(SOCKET_EVENTS.MESSAGE_DELETED, { messageId: id }, {
      channelId: message.channelId,
      dmThreadId: message.dmThreadId,
    });

    return reply.status(204).send();
  });

  // POST /messages/:id/reactions - Add reaction
  fastify.post<{ Params: { id: string } }>('/:id/reactions', async (request, reply) => {
    const { id } = request.params;

    const result = addReactionSchema.safeParse(request.body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { emoji } = result.data;

    const message = await prisma.message.findUnique({
      where: { id },
      select: { channelId: true, dmThreadId: true },
    });

    if (!message) {
      throw errors.notFound('Message');
    }

    // Verify access
    if (message.channelId) {
      await requireChannelAccess(request.user.id, message.channelId);
    } else if (message.dmThreadId) {
      await requireDmAccess(request.user.id, message.dmThreadId);
    }

    // Check if reaction already exists
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

    // Emit socket event
    emitToScope(SOCKET_EVENTS.REACTION_ADDED, { reaction, messageId: id }, {
      channelId: message.channelId,
      dmThreadId: message.dmThreadId,
    });

    return reply.status(201).send({ reaction, created: true });
  });

  // DELETE /messages/:id/reactions/:emoji - Remove reaction
  fastify.delete<{ Params: { id: string; emoji: string } }>(
    '/:id/reactions/:emoji',
    async (request, reply) => {
      const { id, emoji } = request.params;
      const decodedEmoji = decodeURIComponent(emoji);

      const message = await prisma.message.findUnique({
        where: { id },
        select: { channelId: true, dmThreadId: true },
      });

      if (!message) {
        throw errors.notFound('Message');
      }

      // Get reaction before deleting for the emit
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

      // Emit socket event
      if (reaction) {
        emitToScope(SOCKET_EVENTS.REACTION_REMOVED, { reactionId: reaction.id, messageId: id, emoji: decodedEmoji }, {
          channelId: message.channelId,
          dmThreadId: message.dmThreadId,
        });
      }

      return reply.status(204).send();
    }
  );

  // POST /reads - Update read receipt
  fastify.post('/reads', async (request, reply) => {
    const result = updateReadSchema.safeParse(request.body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { channelId, dmThreadId, lastReadMessageId } = result.data;

    // Verify access
    let workspaceId: string;
    if (channelId) {
      const { channel } = await requireChannelAccess(request.user.id, channelId);
      workspaceId = channel.workspaceId;
    } else if (dmThreadId) {
      const { dmThread } = await requireDmAccess(request.user.id, dmThreadId);
      workspaceId = dmThread.workspaceId;
    } else {
      throw errors.validation('Either channelId or dmThreadId is required');
    }

    // Upsert read receipt
    await prisma.readReceipt.upsert({
      where: channelId
        ? { userId_channelId: { userId: request.user.id, channelId } }
        : { userId_dmThreadId: { userId: request.user.id, dmThreadId: dmThreadId! } },
      create: {
        workspaceId,
        userId: request.user.id,
        channelId,
        dmThreadId,
        lastReadMessageId,
      },
      update: {
        lastReadMessageId,
      },
    });

    return reply.status(204).send();
  });

  // GET /search - Search messages
  fastify.get('/search', async (request) => {
    const result = searchSchema.safeParse(request.query);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { q, channelId, dmThreadId, cursor, limit } = result.data;

    // Verify access
    if (channelId) {
      await requireChannelAccess(request.user.id, channelId);
    } else if (dmThreadId) {
      await requireDmAccess(request.user.id, dmThreadId);
    }

    const where = {
      body: { contains: q, mode: 'insensitive' as const },
      isDeleted: false,
      ...(channelId && { channelId }),
      ...(dmThreadId && { dmThreadId }),
      ...(cursor && { createdAt: { lt: new Date(cursor) } }),
    };

    const messages = await prisma.message.findMany({
      where,
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
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
      hasMore,
    };
  });
};
