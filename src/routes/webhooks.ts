import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireWorkspaceRole, requireChannelAccess } from '../middleware/auth.js';
import { getSocketServer } from '../socket/index.js';
import { SOCKET_EVENTS } from '@teamchat/shared';

// Validation schemas
const createIncomingWebhookSchema = z.object({
  workspaceId: z.string().uuid(),
  channelId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  botId: z.string().uuid().optional(),
});

const updateIncomingWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  channelId: z.string().uuid().optional(),
  isEnabled: z.boolean().optional(),
});

const createOutgoingWebhookSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  channelIds: z.array(z.string().uuid()).optional(),
  botId: z.string().uuid().optional(),
});

const updateOutgoingWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  channelIds: z.array(z.string().uuid()).optional(),
  isEnabled: z.boolean().optional(),
});

// Incoming webhook message schema (for external POST requests)
const webhookMessageSchema = z.object({
  text: z.string().min(1).max(10000),
  username: z.string().max(100).optional(),
  iconUrl: z.string().url().optional(),
  attachments: z.array(z.object({
    color: z.string().optional(),
    title: z.string().max(200).optional(),
    titleLink: z.string().url().optional(),
    text: z.string().max(3000).optional(),
    fields: z.array(z.object({
      title: z.string().max(100),
      value: z.string().max(500),
      short: z.boolean().optional(),
    })).max(10).optional(),
    imageUrl: z.string().url().optional(),
    thumbUrl: z.string().url().optional(),
    footer: z.string().max(100).optional(),
    footerIcon: z.string().url().optional(),
    ts: z.number().optional(),
  })).max(20).optional(),
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

// Supported outgoing webhook events
export const WEBHOOK_EVENTS = {
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_DELETED: 'message.deleted',
  REACTION_ADDED: 'reaction.added',
  REACTION_REMOVED: 'reaction.removed',
  CHANNEL_CREATED: 'channel.created',
  CHANNEL_UPDATED: 'channel.updated',
  CHANNEL_DELETED: 'channel.deleted',
  CHANNEL_ARCHIVED: 'channel.archived',
  MEMBER_JOINED: 'member.joined',
  MEMBER_LEFT: 'member.left',
} as const;

function generateWebhookToken(): string {
  return randomBytes(32).toString('base64url');
}

function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

export default async function webhooksRoutes(fastify: FastifyInstance) {
  // ============================================
  // Incoming Webhooks Management (for users)
  // ============================================

  // List incoming webhooks
  fastify.get<{ Querystring: { workspaceId: string } }>(
    '/incoming',
    { preHandler: [authenticate] },
    async (request) => {
      const { workspaceId } = request.query;

      await requireWorkspaceRole(request.user.id, workspaceId, ['owner', 'admin']);

      const webhooks = await prisma.incomingWebhook.findMany({
        where: { workspaceId },
        include: {
          channel: { select: { id: true, name: true } },
          bot: { select: { id: true, name: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        webhooks: webhooks.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          channel: w.channel,
          bot: w.bot,
          webhookUrl: `${process.env.API_URL || 'http://localhost:3000'}/webhooks/incoming/${w.token}`,
          isEnabled: w.isEnabled,
          createdAt: w.createdAt,
        })),
      };
    }
  );

  // Create incoming webhook
  fastify.post<{ Body: z.infer<typeof createIncomingWebhookSchema> }>(
    '/incoming',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = createIncomingWebhookSchema.parse(request.body);

      await requireWorkspaceRole(request.user.id, data.workspaceId, ['owner', 'admin']);
      await requireChannelAccess(request.user.id, data.channelId);

      const token = generateWebhookToken();

      const webhook = await prisma.incomingWebhook.create({
        data: {
          workspaceId: data.workspaceId,
          channelId: data.channelId,
          botId: data.botId,
          name: data.name,
          description: data.description,
          token,
          createdBy: request.user.id,
        },
        include: {
          channel: { select: { id: true, name: true } },
        },
      });

      reply.status(201);
      return {
        webhook: {
          id: webhook.id,
          name: webhook.name,
          description: webhook.description,
          channel: webhook.channel,
          webhookUrl: `${process.env.API_URL || 'http://localhost:3000'}/webhooks/incoming/${token}`,
          isEnabled: webhook.isEnabled,
          createdAt: webhook.createdAt,
        },
      };
    }
  );

  // Update incoming webhook
  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateIncomingWebhookSchema> }>(
    '/incoming/:id',
    { preHandler: [authenticate] },
    async (request) => {
      const data = updateIncomingWebhookSchema.parse(request.body);

      const webhook = await prisma.incomingWebhook.findUnique({
        where: { id: request.params.id },
      });

      if (!webhook) {
        throw errors.notFound('Webhook');
      }

      await requireWorkspaceRole(request.user.id, webhook.workspaceId, ['owner', 'admin']);

      if (data.channelId) {
        await requireChannelAccess(request.user.id, data.channelId);
      }

      const updated = await prisma.incomingWebhook.update({
        where: { id: request.params.id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.channelId !== undefined && { channelId: data.channelId }),
          ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        },
        include: {
          channel: { select: { id: true, name: true } },
        },
      });

      return {
        webhook: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          channel: updated.channel,
          isEnabled: updated.isEnabled,
        },
      };
    }
  );

  // Delete incoming webhook
  fastify.delete<{ Params: { id: string } }>(
    '/incoming/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const webhook = await prisma.incomingWebhook.findUnique({
        where: { id: request.params.id },
      });

      if (!webhook) {
        throw errors.notFound('Webhook');
      }

      await requireWorkspaceRole(request.user.id, webhook.workspaceId, ['owner', 'admin']);

      await prisma.incomingWebhook.delete({
        where: { id: request.params.id },
      });

      reply.status(204);
      return;
    }
  );

  // Regenerate incoming webhook token
  fastify.post<{ Params: { id: string } }>(
    '/incoming/:id/regenerate',
    { preHandler: [authenticate] },
    async (request) => {
      const webhook = await prisma.incomingWebhook.findUnique({
        where: { id: request.params.id },
      });

      if (!webhook) {
        throw errors.notFound('Webhook');
      }

      await requireWorkspaceRole(request.user.id, webhook.workspaceId, ['owner', 'admin']);

      const newToken = generateWebhookToken();

      await prisma.incomingWebhook.update({
        where: { id: request.params.id },
        data: { token: newToken },
      });

      return {
        webhookUrl: `${process.env.API_URL || 'http://localhost:3000'}/webhooks/incoming/${newToken}`,
      };
    }
  );

  // ============================================
  // Incoming Webhook Endpoint (for external services)
  // ============================================

  // Post message via incoming webhook
  fastify.post<{ Params: { token: string }; Body: z.infer<typeof webhookMessageSchema> }>(
    '/incoming/:token',
    async (request, reply) => {
      const { token } = request.params;

      const webhook = await prisma.incomingWebhook.findUnique({
        where: { token },
        include: {
          channel: { select: { id: true, workspaceId: true } },
          bot: { select: { id: true, displayName: true, avatarUrl: true, createdBy: true } },
        },
      });

      if (!webhook) {
        throw errors.webhookInvalidToken();
      }

      if (!webhook.isEnabled) {
        throw errors.webhookDisabled();
      }

      let data: z.infer<typeof webhookMessageSchema>;
      try {
        data = webhookMessageSchema.parse(request.body);
      } catch (error) {
        throw errors.validation('Invalid webhook payload');
      }

      // Format message body with attachments
      let messageBody = data.text;

      if (data.attachments && data.attachments.length > 0) {
        const attachmentText = data.attachments
          .map((att) => {
            let text = '';
            if (att.title) {
              text += att.titleLink ? `**[${att.title}](${att.titleLink})**\n` : `**${att.title}**\n`;
            }
            if (att.text) {
              text += att.text + '\n';
            }
            if (att.fields) {
              text += att.fields.map((f) => `**${f.title}:** ${f.value}`).join('\n') + '\n';
            }
            if (att.footer) {
              text += `_${att.footer}_`;
            }
            return text.trim();
          })
          .join('\n\n');

        if (attachmentText) {
          messageBody += '\n\n' + attachmentText;
        }
      }

      // Determine sender info
      const senderId = webhook.bot?.createdBy || webhook.createdBy;
      const displayName = data.username || webhook.bot?.displayName || webhook.name;
      const avatarUrl = data.iconUrl || webhook.bot?.avatarUrl || null;

      // Create the message
      const message = await prisma.message.create({
        data: {
          workspaceId: webhook.channel.workspaceId,
          channelId: webhook.channelId,
          senderId,
          botId: webhook.botId,
          body: messageBody,
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
          sender: { select: { id: true, displayName: true, avatarUrl: true } },
          interactiveActions: true,
        },
      });

      // Broadcast to channel
      const io = getSocketServer();
      io.to(`channel:${webhook.channelId}`).emit(SOCKET_EVENTS.MESSAGE_CREATED, {
        message: {
          ...message,
          sender: {
            id: senderId,
            displayName,
            avatarUrl,
            isBot: true,
            webhookName: webhook.name,
          },
        },
      });

      reply.status(201);
      return {
        ok: true,
        messageId: message.id,
        timestamp: message.createdAt.toISOString(),
      };
    }
  );

  // ============================================
  // Outgoing Webhooks Management
  // ============================================

  // List outgoing webhooks
  fastify.get<{ Querystring: { workspaceId: string } }>(
    '/outgoing',
    { preHandler: [authenticate] },
    async (request) => {
      const { workspaceId } = request.query;

      await requireWorkspaceRole(request.user.id, workspaceId, ['owner', 'admin']);

      const webhooks = await prisma.outgoingWebhook.findMany({
        where: { workspaceId },
        include: {
          bot: { select: { id: true, name: true, displayName: true } },
          _count: {
            select: { deliveries: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        webhooks: webhooks.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          url: w.url,
          events: w.events,
          channelIds: w.channelIds,
          bot: w.bot,
          isEnabled: w.isEnabled,
          deliveryCount: w._count.deliveries,
          createdAt: w.createdAt,
        })),
      };
    }
  );

  // Create outgoing webhook
  fastify.post<{ Body: z.infer<typeof createOutgoingWebhookSchema> }>(
    '/outgoing',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = createOutgoingWebhookSchema.parse(request.body);

      await requireWorkspaceRole(request.user.id, data.workspaceId, ['owner', 'admin']);

      // Validate events
      const validEvents = Object.values(WEBHOOK_EVENTS);
      const invalidEvents = data.events.filter((e) => !validEvents.includes(e as any));
      if (invalidEvents.length > 0) {
        throw errors.validation(`Invalid events: ${invalidEvents.join(', ')}`);
      }

      const secret = generateWebhookSecret();

      const webhook = await prisma.outgoingWebhook.create({
        data: {
          workspaceId: data.workspaceId,
          botId: data.botId,
          name: data.name,
          description: data.description,
          url: data.url,
          events: data.events,
          channelIds: data.channelIds || [],
          secret,
          createdBy: request.user.id,
        },
      });

      reply.status(201);
      return {
        webhook: {
          id: webhook.id,
          name: webhook.name,
          description: webhook.description,
          url: webhook.url,
          events: webhook.events,
          channelIds: webhook.channelIds,
          secret, // Only shown once at creation
          isEnabled: webhook.isEnabled,
          createdAt: webhook.createdAt,
        },
      };
    }
  );

  // Update outgoing webhook
  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateOutgoingWebhookSchema> }>(
    '/outgoing/:id',
    { preHandler: [authenticate] },
    async (request) => {
      const data = updateOutgoingWebhookSchema.parse(request.body);

      const webhook = await prisma.outgoingWebhook.findUnique({
        where: { id: request.params.id },
      });

      if (!webhook) {
        throw errors.notFound('Webhook');
      }

      await requireWorkspaceRole(request.user.id, webhook.workspaceId, ['owner', 'admin']);

      if (data.events) {
        const validEvents = Object.values(WEBHOOK_EVENTS);
        const invalidEvents = data.events.filter((e) => !validEvents.includes(e as any));
        if (invalidEvents.length > 0) {
          throw errors.validation(`Invalid events: ${invalidEvents.join(', ')}`);
        }
      }

      const updated = await prisma.outgoingWebhook.update({
        where: { id: request.params.id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.url !== undefined && { url: data.url }),
          ...(data.events !== undefined && { events: data.events }),
          ...(data.channelIds !== undefined && { channelIds: data.channelIds }),
          ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        },
      });

      return {
        webhook: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          url: updated.url,
          events: updated.events,
          channelIds: updated.channelIds,
          isEnabled: updated.isEnabled,
        },
      };
    }
  );

  // Delete outgoing webhook
  fastify.delete<{ Params: { id: string } }>(
    '/outgoing/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const webhook = await prisma.outgoingWebhook.findUnique({
        where: { id: request.params.id },
      });

      if (!webhook) {
        throw errors.notFound('Webhook');
      }

      await requireWorkspaceRole(request.user.id, webhook.workspaceId, ['owner', 'admin']);

      await prisma.outgoingWebhook.delete({
        where: { id: request.params.id },
      });

      reply.status(204);
      return;
    }
  );

  // Regenerate outgoing webhook secret
  fastify.post<{ Params: { id: string } }>(
    '/outgoing/:id/regenerate-secret',
    { preHandler: [authenticate] },
    async (request) => {
      const webhook = await prisma.outgoingWebhook.findUnique({
        where: { id: request.params.id },
      });

      if (!webhook) {
        throw errors.notFound('Webhook');
      }

      await requireWorkspaceRole(request.user.id, webhook.workspaceId, ['owner', 'admin']);

      const newSecret = generateWebhookSecret();

      await prisma.outgoingWebhook.update({
        where: { id: request.params.id },
        data: { secret: newSecret },
      });

      return { secret: newSecret };
    }
  );

  // Get webhook delivery history
  fastify.get<{ Params: { id: string }; Querystring: { limit?: number } }>(
    '/outgoing/:id/deliveries',
    { preHandler: [authenticate] },
    async (request) => {
      const webhook = await prisma.outgoingWebhook.findUnique({
        where: { id: request.params.id },
      });

      if (!webhook) {
        throw errors.notFound('Webhook');
      }

      await requireWorkspaceRole(request.user.id, webhook.workspaceId, ['owner', 'admin']);

      const limit = Math.min(request.query.limit || 50, 100);

      const deliveries = await prisma.webhookDelivery.findMany({
        where: { webhookId: request.params.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return { deliveries };
    }
  );

  // Get available webhook events
  fastify.get('/events', async () => {
    return {
      events: Object.entries(WEBHOOK_EVENTS).map(([key, value]) => ({
        key,
        value,
        description: getEventDescription(value),
      })),
    };
  });
}

function getEventDescription(event: string): string {
  const descriptions: Record<string, string> = {
    'message.created': 'When a new message is posted',
    'message.updated': 'When a message is edited',
    'message.deleted': 'When a message is deleted',
    'reaction.added': 'When a reaction is added to a message',
    'reaction.removed': 'When a reaction is removed from a message',
    'channel.created': 'When a new channel is created',
    'channel.updated': 'When a channel is updated',
    'channel.deleted': 'When a channel is deleted',
    'channel.archived': 'When a channel is archived',
    'member.joined': 'When a member joins a channel or workspace',
    'member.left': 'When a member leaves a channel or workspace',
  };
  return descriptions[event] || event;
}
