import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import {
  authenticateBot,
  requireBotScope,
  requireBotChannelAccess,
  BOT_SCOPES,
} from '../middleware/botAuth.js';
import { getSocketServer } from '../socket/index.js';
import { SOCKET_EVENTS } from '@teamchat/shared';

// Validation schemas
const sendMessageSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().min(1).max(10000),
  parentId: z.string().uuid().optional(),
  actions: z.array(z.object({
    type: z.enum(['button', 'select']),
    actionId: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    value: z.string().max(1000).optional(),
    style: z.enum(['primary', 'danger', 'default']).optional(),
    url: z.string().url().optional(),
    confirm: z.object({
      title: z.string().max(100),
      text: z.string().max(500),
      confirmText: z.string().max(50).optional(),
      denyText: z.string().max(50).optional(),
    }).optional(),
    options: z.array(z.object({
      label: z.string().max(100),
      value: z.string().max(1000),
      description: z.string().max(200).optional(),
    })).optional(),
  })).max(25).optional(),
});

const updateMessageSchema = z.object({
  body: z.string().min(1).max(10000),
});

const addReactionSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(50),
});

export default async function botApiRoutes(fastify: FastifyInstance) {
  // All routes require bot authentication
  fastify.addHook('preHandler', authenticateBot);

  // ============================================
  // Messages
  // ============================================

  // Send a message
  fastify.post<{ Body: z.infer<typeof sendMessageSchema> }>(
    '/messages',
    { preHandler: [requireBotScope(BOT_SCOPES.MESSAGES_WRITE)] },
    async (request, reply) => {
      const data = sendMessageSchema.parse(request.body);
      const bot = request.bot!;

      // Verify channel access
      const { channel } = await requireBotChannelAccess(request, data.channelId);

      // Get the bot's creator as the "sender" for DB purposes
      const botInfo = await prisma.bot.findUnique({
        where: { id: bot.id },
        select: { createdBy: true },
      });

      if (!botInfo) {
        throw errors.notFound('Bot');
      }

      // Create message
      const message = await prisma.message.create({
        data: {
          workspaceId: bot.workspaceId,
          channelId: data.channelId,
          senderId: botInfo.createdBy, // Use bot creator as sender
          botId: bot.id, // Track that this is a bot message
          parentId: data.parentId,
          body: data.body,
          ...(data.actions && {
            interactiveActions: {
              create: data.actions.map((action, index) => ({
                actionId: action.actionId,
                type: action.type,
                label: action.label,
                value: action.value,
                style: action.style,
                url: action.url,
                confirm: action.confirm as object,
                options: action.options as object[],
                position: index,
              })),
            },
          }),
        },
        include: {
          sender: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
          bot: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
          interactiveActions: true,
        },
      });

      // Broadcast to channel
      const io = getSocketServer();
      io.to(`channel:${data.channelId}`).emit(SOCKET_EVENTS.MESSAGE_CREATED, {
        message: {
          ...message,
          // Override sender display with bot info
          sender: {
            id: message.sender.id,
            displayName: message.bot?.displayName || bot.displayName,
            avatarUrl: message.bot?.avatarUrl || null,
            isBot: true,
          },
        },
      });

      reply.status(201);
      return {
        message: {
          id: message.id,
          channelId: message.channelId,
          body: message.body,
          parentId: message.parentId,
          createdAt: message.createdAt,
          actions: message.interactiveActions,
        },
      };
    }
  );

  // Update a bot message
  fastify.patch<{ Params: { messageId: string }; Body: z.infer<typeof updateMessageSchema> }>(
    '/messages/:messageId',
    { preHandler: [requireBotScope(BOT_SCOPES.MESSAGES_WRITE)] },
    async (request) => {
      const data = updateMessageSchema.parse(request.body);
      const bot = request.bot!;

      const message = await prisma.message.findUnique({
        where: { id: request.params.messageId },
      });

      if (!message) {
        throw errors.notFound('Message');
      }

      // Can only edit messages sent by this bot
      if (message.botId !== bot.id) {
        throw errors.forbidden('Can only edit messages sent by this bot');
      }

      const updated = await prisma.message.update({
        where: { id: request.params.messageId },
        data: { body: data.body },
        include: {
          sender: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
          bot: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      });

      // Broadcast update
      const io = getSocketServer();
      if (updated.channelId) {
        io.to(`channel:${updated.channelId}`).emit(SOCKET_EVENTS.MESSAGE_UPDATED, {
          message: updated,
        });
      }

      return {
        message: {
          id: updated.id,
          body: updated.body,
          updatedAt: updated.updatedAt,
        },
      };
    }
  );

  // Delete a bot message
  fastify.delete<{ Params: { messageId: string } }>(
    '/messages/:messageId',
    { preHandler: [requireBotScope(BOT_SCOPES.MESSAGES_DELETE)] },
    async (request, reply) => {
      const bot = request.bot!;

      const message = await prisma.message.findUnique({
        where: { id: request.params.messageId },
      });

      if (!message) {
        throw errors.notFound('Message');
      }

      // Can only delete messages sent by this bot
      if (message.botId !== bot.id) {
        throw errors.forbidden('Can only delete messages sent by this bot');
      }

      await prisma.message.update({
        where: { id: request.params.messageId },
        data: { isDeleted: true },
      });

      // Broadcast deletion
      const io = getSocketServer();
      if (message.channelId) {
        io.to(`channel:${message.channelId}`).emit(SOCKET_EVENTS.MESSAGE_DELETED, {
          messageId: message.id,
          channelId: message.channelId,
        });
      }

      reply.status(204);
      return;
    }
  );

  // ============================================
  // Channels
  // ============================================

  // List channels
  fastify.get(
    '/channels',
    { preHandler: [requireBotScope(BOT_SCOPES.CHANNELS_READ)] },
    async (request) => {
      const bot = request.bot!;

      const channels = await prisma.channel.findMany({
        where: {
          workspaceId: bot.workspaceId,
          isPrivate: false, // Bots can only see public channels
          isArchived: false,
        },
        select: {
          id: true,
          name: true,
          description: true,
          topic: true,
          createdAt: true,
          _count: {
            select: { members: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      return {
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          topic: c.topic,
          memberCount: c._count.members,
          createdAt: c.createdAt,
        })),
      };
    }
  );

  // Get channel info
  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId',
    { preHandler: [requireBotScope(BOT_SCOPES.CHANNELS_READ)] },
    async (request) => {
      const { channel } = await requireBotChannelAccess(request, request.params.channelId);

      const fullChannel = await prisma.channel.findUnique({
        where: { id: channel.id },
        select: {
          id: true,
          name: true,
          description: true,
          topic: true,
          isPrivate: true,
          createdAt: true,
          _count: {
            select: { members: true },
          },
        },
      });

      return { channel: fullChannel };
    }
  );

  // Get channel history
  fastify.get<{
    Params: { channelId: string };
    Querystring: { limit?: number; before?: string };
  }>(
    '/channels/:channelId/history',
    { preHandler: [requireBotScope(BOT_SCOPES.CHANNELS_HISTORY)] },
    async (request) => {
      const { channelId } = request.params;
      const limit = Math.min(request.query.limit || 50, 100);
      const before = request.query.before;

      await requireBotChannelAccess(request, channelId);

      const messages = await prisma.message.findMany({
        where: {
          channelId,
          isDeleted: false,
          ...(before && { createdAt: { lt: new Date(before) } }),
        },
        include: {
          sender: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
          bot: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
          reactions: {
            include: {
              user: { select: { id: true, displayName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return {
        messages: messages.reverse().map((m) => ({
          id: m.id,
          body: m.body,
          senderId: m.senderId,
          botId: m.botId,
          senderName: m.bot?.displayName || m.sender.displayName,
          parentId: m.parentId,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          reactions: m.reactions,
        })),
        hasMore: messages.length === limit,
      };
    }
  );

  // ============================================
  // Users
  // ============================================

  // Get user info
  fastify.get<{ Params: { userId: string } }>(
    '/users/:userId',
    { preHandler: [requireBotScope(BOT_SCOPES.USERS_READ)] },
    async (request) => {
      const bot = request.bot!;

      // Check user is in same workspace
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: bot.workspaceId,
            userId: request.params.userId,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              status: true,
              customStatus: true,
            },
          },
        },
      });

      if (!member) {
        throw errors.notFound('User');
      }

      return { user: member.user };
    }
  );

  // List workspace members
  fastify.get(
    '/users',
    { preHandler: [requireBotScope(BOT_SCOPES.USERS_READ)] },
    async (request) => {
      const bot = request.bot!;

      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: bot.workspaceId },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              status: true,
            },
          },
        },
      });

      return {
        users: members.map((m) => ({
          ...m.user,
          role: m.role,
        })),
      };
    }
  );

  // ============================================
  // Reactions
  // ============================================

  // Add a reaction
  fastify.post<{ Body: z.infer<typeof addReactionSchema> }>(
    '/reactions',
    { preHandler: [requireBotScope(BOT_SCOPES.REACTIONS_WRITE)] },
    async (request, reply) => {
      const data = addReactionSchema.parse(request.body);
      const bot = request.bot!;

      const message = await prisma.message.findUnique({
        where: { id: data.messageId },
        select: { channelId: true, workspaceId: true },
      });

      if (!message || message.workspaceId !== bot.workspaceId) {
        throw errors.notFound('Message');
      }

      // Get bot creator for the reaction
      const botInfo = await prisma.bot.findUnique({
        where: { id: bot.id },
        select: { createdBy: true },
      });

      if (!botInfo) {
        throw errors.notFound('Bot');
      }

      const reaction = await prisma.reaction.upsert({
        where: {
          messageId_userId_emoji: {
            messageId: data.messageId,
            userId: botInfo.createdBy,
            emoji: data.emoji,
          },
        },
        update: {},
        create: {
          messageId: data.messageId,
          userId: botInfo.createdBy,
          emoji: data.emoji,
        },
      });

      // Broadcast reaction
      const io = getSocketServer();
      if (message.channelId) {
        io.to(`channel:${message.channelId}`).emit(SOCKET_EVENTS.REACTION_ADDED, {
          reaction: {
            ...reaction,
            user: { id: botInfo.createdBy, displayName: bot.displayName },
          },
        });
      }

      reply.status(201);
      return { reaction };
    }
  );

  // Remove a reaction
  fastify.delete<{ Params: { messageId: string; emoji: string } }>(
    '/reactions/:messageId/:emoji',
    { preHandler: [requireBotScope(BOT_SCOPES.REACTIONS_WRITE)] },
    async (request, reply) => {
      const bot = request.bot!;
      const { messageId, emoji } = request.params;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { channelId: true, workspaceId: true },
      });

      if (!message || message.workspaceId !== bot.workspaceId) {
        throw errors.notFound('Message');
      }

      const botInfo = await prisma.bot.findUnique({
        where: { id: bot.id },
        select: { createdBy: true },
      });

      if (!botInfo) {
        throw errors.notFound('Bot');
      }

      const deleted = await prisma.reaction.deleteMany({
        where: {
          messageId,
          userId: botInfo.createdBy,
          emoji: decodeURIComponent(emoji),
        },
      });

      if (deleted.count > 0) {
        const io = getSocketServer();
        if (message.channelId) {
          io.to(`channel:${message.channelId}`).emit(SOCKET_EVENTS.REACTION_REMOVED, {
            messageId,
            userId: botInfo.createdBy,
            emoji: decodeURIComponent(emoji),
          });
        }
      }

      reply.status(204);
      return;
    }
  );

  // ============================================
  // Bot Info
  // ============================================

  // Get current bot info
  fastify.get('/me', async (request) => {
    const bot = request.bot!;

    const fullBot = await prisma.bot.findUnique({
      where: { id: bot.id },
      include: {
        scopes: true,
        workspace: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      bot: {
        id: fullBot!.id,
        name: fullBot!.name,
        displayName: fullBot!.displayName,
        description: fullBot!.description,
        avatarUrl: fullBot!.avatarUrl,
        scopes: fullBot!.scopes.map((s) => s.scope),
        workspace: fullBot!.workspace,
      },
    };
  });
}
