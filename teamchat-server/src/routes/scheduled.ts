import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireWorkspaceMember, requireChannelAccess, requireDmAccess } from '../middleware/auth.js';
import { assertZodSuccess } from './helpers/validation.js';

const createScheduledMessageSchema = z.object({
  workspaceId: z.string().uuid(),
  channelId: z.string().uuid().optional(),
  dmThreadId: z.string().uuid().optional(),
  body: z.string().min(1).max(10000),
  scheduledAt: z.string().datetime(),
});

const updateScheduledMessageSchema = z.object({
  body: z.string().min(1).max(10000).optional(),
  scheduledAt: z.string().datetime().optional(),
});

export const scheduledRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /scheduled - List user's scheduled messages
  fastify.get<{ Querystring: { workspaceId: string } }>('/', async (request) => {
    const { workspaceId } = request.query;

    if (!workspaceId) {
      throw errors.validation('workspaceId is required');
    }

    await requireWorkspaceMember(request.user.id, workspaceId);

    const scheduledMessages = await prisma.scheduledMessage.findMany({
      where: {
        workspaceId,
        senderId: request.user.id,
        status: 'pending',
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return { scheduledMessages };
  });

  // POST /scheduled - Create scheduled message
  fastify.post<{ Body: z.infer<typeof createScheduledMessageSchema> }>(
    '/',
    async (request, reply) => {
      const { workspaceId, channelId, dmThreadId, body, scheduledAt } = assertZodSuccess(
        createScheduledMessageSchema.safeParse(request.body)
      );

      // Must have either channelId or dmThreadId
      if (!channelId && !dmThreadId) {
        throw errors.validation('Either channelId or dmThreadId is required');
      }

      // Cannot have both
      if (channelId && dmThreadId) {
        throw errors.validation('Cannot specify both channelId and dmThreadId');
      }

      await requireWorkspaceMember(request.user.id, workspaceId);

      // Verify access to the destination
      if (channelId) {
        await requireChannelAccess(request.user.id, channelId);
      } else if (dmThreadId) {
        await requireDmAccess(request.user.id, dmThreadId);
      }

      // Scheduled time must be in the future
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        throw errors.validation('Scheduled time must be in the future');
      }

      const scheduledMessage = await prisma.scheduledMessage.create({
        data: {
          workspaceId,
          channelId,
          dmThreadId,
          senderId: request.user.id,
          body,
          scheduledAt: scheduledDate,
        },
      });

      return reply.status(201).send({ scheduledMessage });
    }
  );

  // GET /scheduled/:id - Get scheduled message
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { id } = request.params;

    const scheduledMessage = await prisma.scheduledMessage.findUnique({
      where: { id },
    });

    if (!scheduledMessage) {
      throw errors.notFound('Scheduled message');
    }

    // Only sender can view
    if (scheduledMessage.senderId !== request.user.id) {
      throw errors.forbidden('Not authorized to view this scheduled message');
    }

    return { scheduledMessage };
  });

  // PATCH /scheduled/:id - Update scheduled message
  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateScheduledMessageSchema> }>(
    '/:id',
    async (request, reply) => {
      const { id } = request.params;
      const result = assertZodSuccess(updateScheduledMessageSchema.safeParse(request.body));

      const scheduledMessage = await prisma.scheduledMessage.findUnique({
        where: { id },
      });

      if (!scheduledMessage) {
        throw errors.notFound('Scheduled message');
      }

      // Only sender can update
      if (scheduledMessage.senderId !== request.user.id) {
        throw errors.forbidden('Not authorized to update this scheduled message');
      }

      // Can only update pending messages
      if (scheduledMessage.status !== 'pending') {
        throw errors.validation('Can only update pending scheduled messages');
      }

      const updateData: any = {};

      if (result.body) {
        updateData.body = result.body;
      }

      if (result.scheduledAt) {
        const newDate = new Date(result.scheduledAt);
        if (newDate <= new Date()) {
          throw errors.validation('Scheduled time must be in the future');
        }
        updateData.scheduledAt = newDate;
      }

      const updated = await prisma.scheduledMessage.update({
        where: { id },
        data: updateData,
      });

      return reply.send({ scheduledMessage: updated });
    }
  );

  // DELETE /scheduled/:id - Cancel scheduled message
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const scheduledMessage = await prisma.scheduledMessage.findUnique({
      where: { id },
    });

    if (!scheduledMessage) {
      throw errors.notFound('Scheduled message');
    }

    // Only sender can cancel
    if (scheduledMessage.senderId !== request.user.id) {
      throw errors.forbidden('Not authorized to cancel this scheduled message');
    }

    // Can only cancel pending messages
    if (scheduledMessage.status !== 'pending') {
      throw errors.validation('Can only cancel pending scheduled messages');
    }

    await prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return reply.send({ success: true });
  });

  // POST /scheduled/:id/send-now - Send scheduled message immediately
  fastify.post<{ Params: { id: string } }>('/:id/send-now', async (request, reply) => {
    const { id } = request.params;

    const scheduledMessage = await prisma.scheduledMessage.findUnique({
      where: { id },
    });

    if (!scheduledMessage) {
      throw errors.notFound('Scheduled message');
    }

    // Only sender can send now
    if (scheduledMessage.senderId !== request.user.id) {
      throw errors.forbidden('Not authorized to send this scheduled message');
    }

    // Can only send pending messages
    if (scheduledMessage.status !== 'pending') {
      throw errors.validation('Can only send pending scheduled messages');
    }

    // Create the actual message
    const message = await prisma.message.create({
      data: {
        workspaceId: scheduledMessage.workspaceId,
        channelId: scheduledMessage.channelId,
        dmThreadId: scheduledMessage.dmThreadId,
        senderId: scheduledMessage.senderId,
        body: scheduledMessage.body,
      },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Mark scheduled message as sent
    await prisma.scheduledMessage.update({
      where: { id },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    });

    // TODO: Emit socket event for new message

    return reply.send({ message });
  });
};
