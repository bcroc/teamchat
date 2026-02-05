import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { authenticate, requireWorkspaceRole } from '../../middleware/auth.js';
import { createOutgoingWebhookSchema, updateOutgoingWebhookSchema } from './schemas.js';
import { WEBHOOK_EVENTS, getEventDescription } from './constants.js';
import { generateWebhookSecret } from './helpers.js';

function validateWebhookEvents(events: string[]): void {
  const validEvents = Object.values(WEBHOOK_EVENTS);
  const invalidEvents = events.filter((event) => !validEvents.includes(event as (typeof validEvents)[number]));
  if (invalidEvents.length > 0) {
    throw errors.validation(`Invalid events: ${invalidEvents.join(', ')}`);
  }
}

export function registerOutgoingWebhookRoutes(fastify: FastifyInstance): void {
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

  fastify.post<{ Body: z.infer<typeof createOutgoingWebhookSchema> }>(
    '/outgoing',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = createOutgoingWebhookSchema.parse(request.body);

      await requireWorkspaceRole(request.user.id, data.workspaceId, ['owner', 'admin']);

      validateWebhookEvents(data.events);

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
          secret,
          isEnabled: webhook.isEnabled,
          createdAt: webhook.createdAt,
        },
      };
    }
  );

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
        validateWebhookEvents(data.events);
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
