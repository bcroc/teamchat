import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { config } from '../../lib/config.js';
import { authenticate, requireWorkspaceRole, requireChannelAccess } from '../../middleware/auth.js';
import { createIncomingWebhookSchema, updateIncomingWebhookSchema, webhookMessageSchema } from './schemas.js';
import { emitWebhookMessageCreated, formatWebhookMessageBody, generateWebhookToken } from './helpers.js';

export function registerIncomingWebhookRoutes(fastify: FastifyInstance): void {
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
          webhookUrl: `${config.apiUrl}/webhooks/incoming/${w.token}`,
          isEnabled: w.isEnabled,
          createdAt: w.createdAt,
        })),
      };
    }
  );

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
          webhookUrl: `${config.apiUrl}/webhooks/incoming/${token}`,
          isEnabled: webhook.isEnabled,
          createdAt: webhook.createdAt,
        },
      };
    }
  );

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
      } catch {
        throw errors.validation('Invalid webhook payload');
      }

      const messageBody = formatWebhookMessageBody(data);

      const senderId = webhook.bot?.createdBy || webhook.createdBy;
      const displayName = data.username || webhook.bot?.displayName || webhook.name;
      const avatarUrl = data.iconUrl || webhook.bot?.avatarUrl || null;

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

      emitWebhookMessageCreated(webhook.channelId, message, {
        id: senderId,
        displayName,
        avatarUrl,
        isBot: true,
        webhookName: webhook.name,
      });

      reply.status(201);
      return {
        ok: true,
        messageId: message.id,
        timestamp: message.createdAt.toISOString(),
      };
    }
  );
}
