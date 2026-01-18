import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireWorkspaceMember } from '../middleware/auth.js';

const createReminderSchema = z.object({
  workspaceId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
  text: z.string().min(1).max(500),
  remindAt: z.string().datetime(),
});

const updateReminderSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  remindAt: z.string().datetime().optional(),
});

// Helper to parse relative time strings like "in 30 minutes", "in 2 hours", "tomorrow at 9am"
export function parseRelativeTime(input: string): Date | null {
  const now = new Date();
  const lowerInput = input.toLowerCase().trim();

  // Match "in X minutes/hours/days"
  const inMatch = lowerInput.match(/^in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];

    if (unit.startsWith('minute') || unit.startsWith('min')) {
      return new Date(now.getTime() + amount * 60 * 1000);
    } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
      return new Date(now.getTime() + amount * 60 * 60 * 1000);
    } else if (unit.startsWith('day')) {
      return new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
    }
  }

  // Match "tomorrow"
  if (lowerInput === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
    return tomorrow;
  }

  // Match "tomorrow at X"
  const tomorrowMatch = lowerInput.match(/^tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (tomorrowMatch) {
    let hour = parseInt(tomorrowMatch[1], 10);
    const minute = tomorrowMatch[2] ? parseInt(tomorrowMatch[2], 10) : 0;
    const meridiem = tomorrowMatch[3];

    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hour, minute, 0, 0);
    return tomorrow;
  }

  // Match "next week"
  if (lowerInput === 'next week') {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek;
  }

  return null;
}

export const reminderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /reminders - List user's reminders
  fastify.get<{ Querystring: { workspaceId?: string; status?: string } }>(
    '/',
    async (request) => {
      const { workspaceId, status = 'pending' } = request.query;

      const where: any = {
        userId: request.user.id,
      };

      if (workspaceId) {
        where.workspaceId = workspaceId;
      }

      if (status && status !== 'all') {
        where.status = status;
      }

      const reminders = await prisma.reminder.findMany({
        where,
        orderBy: { remindAt: 'asc' },
      });

      return { reminders };
    }
  );

  // POST /reminders - Create reminder
  fastify.post<{ Body: z.infer<typeof createReminderSchema> }>(
    '/',
    async (request, reply) => {
      const result = createReminderSchema.safeParse(request.body);
      if (!result.success) {
        throw errors.validation('Invalid input', { errors: result.error.flatten() });
      }

      const { workspaceId, messageId, text, remindAt } = result.data;

      await requireWorkspaceMember(request.user.id, workspaceId);

      // Reminder time must be in the future
      const remindDate = new Date(remindAt);
      if (remindDate <= new Date()) {
        throw errors.validation('Reminder time must be in the future');
      }

      // If messageId provided, verify message exists
      if (messageId) {
        const message = await prisma.message.findUnique({
          where: { id: messageId },
        });
        if (!message) {
          throw errors.notFound('Message');
        }
      }

      const reminder = await prisma.reminder.create({
        data: {
          userId: request.user.id,
          workspaceId,
          messageId,
          text,
          remindAt: remindDate,
        },
      });

      return reply.status(201).send({ reminder });
    }
  );

  // POST /reminders/parse - Parse natural language reminder
  fastify.post<{ Body: { input: string; workspaceId: string } }>(
    '/parse',
    async (request, reply) => {
      const { input, workspaceId } = request.body;

      await requireWorkspaceMember(request.user.id, workspaceId);

      // Parse input like "/remind me in 30 minutes to check the build"
      // or "/remind me tomorrow at 9am to review PR"
      const remindMatch = input.match(/^(?:remind\s+me\s+)?(.+?)\s+(?:to\s+)?(.+)$/i);

      if (!remindMatch) {
        throw errors.validation('Could not parse reminder. Use format: "in 30 minutes to do something"');
      }

      const timeString = remindMatch[1];
      const taskText = remindMatch[2];

      const remindAt = parseRelativeTime(timeString);

      if (!remindAt) {
        throw errors.validation(`Could not parse time: "${timeString}". Try "in 30 minutes", "tomorrow", "tomorrow at 9am", etc.`);
      }

      return reply.send({
        parsed: {
          text: taskText,
          remindAt: remindAt.toISOString(),
          timeDescription: timeString,
        },
      });
    }
  );

  // GET /reminders/:id - Get reminder
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { id } = request.params;

    const reminder = await prisma.reminder.findUnique({
      where: { id },
    });

    if (!reminder) {
      throw errors.notFound('Reminder');
    }

    // Only owner can view
    if (reminder.userId !== request.user.id) {
      throw errors.forbidden('Not authorized to view this reminder');
    }

    return { reminder };
  });

  // PATCH /reminders/:id - Update reminder
  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateReminderSchema> }>(
    '/:id',
    async (request, reply) => {
      const { id } = request.params;
      const result = updateReminderSchema.safeParse(request.body);

      if (!result.success) {
        throw errors.validation('Invalid input', { errors: result.error.flatten() });
      }

      const reminder = await prisma.reminder.findUnique({
        where: { id },
      });

      if (!reminder) {
        throw errors.notFound('Reminder');
      }

      // Only owner can update
      if (reminder.userId !== request.user.id) {
        throw errors.forbidden('Not authorized to update this reminder');
      }

      // Can only update pending reminders
      if (reminder.status !== 'pending') {
        throw errors.validation('Can only update pending reminders');
      }

      const updateData: any = {};

      if (result.data.text) {
        updateData.text = result.data.text;
      }

      if (result.data.remindAt) {
        const newDate = new Date(result.data.remindAt);
        if (newDate <= new Date()) {
          throw errors.validation('Reminder time must be in the future');
        }
        updateData.remindAt = newDate;
      }

      const updated = await prisma.reminder.update({
        where: { id },
        data: updateData,
      });

      return reply.send({ reminder: updated });
    }
  );

  // DELETE /reminders/:id - Delete reminder
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const reminder = await prisma.reminder.findUnique({
      where: { id },
    });

    if (!reminder) {
      throw errors.notFound('Reminder');
    }

    // Only owner can delete
    if (reminder.userId !== request.user.id) {
      throw errors.forbidden('Not authorized to delete this reminder');
    }

    await prisma.reminder.delete({
      where: { id },
    });

    return reply.send({ success: true });
  });

  // POST /reminders/:id/complete - Mark reminder as completed
  fastify.post<{ Params: { id: string } }>('/:id/complete', async (request, reply) => {
    const { id } = request.params;

    const reminder = await prisma.reminder.findUnique({
      where: { id },
    });

    if (!reminder) {
      throw errors.notFound('Reminder');
    }

    // Only owner can complete
    if (reminder.userId !== request.user.id) {
      throw errors.forbidden('Not authorized to complete this reminder');
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    return reply.send({ reminder: updated });
  });

  // POST /reminders/:id/dismiss - Dismiss reminder
  fastify.post<{ Params: { id: string } }>('/:id/dismiss', async (request, reply) => {
    const { id } = request.params;

    const reminder = await prisma.reminder.findUnique({
      where: { id },
    });

    if (!reminder) {
      throw errors.notFound('Reminder');
    }

    // Only owner can dismiss
    if (reminder.userId !== request.user.id) {
      throw errors.forbidden('Not authorized to dismiss this reminder');
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: { status: 'dismissed' },
    });

    return reply.send({ reminder: updated });
  });

  // POST /reminders/:id/snooze - Snooze reminder
  fastify.post<{ Params: { id: string }; Body: { duration: string } }>(
    '/:id/snooze',
    async (request, reply) => {
      const { id } = request.params;
      const { duration } = request.body;

      const reminder = await prisma.reminder.findUnique({
        where: { id },
      });

      if (!reminder) {
        throw errors.notFound('Reminder');
      }

      // Only owner can snooze
      if (reminder.userId !== request.user.id) {
        throw errors.forbidden('Not authorized to snooze this reminder');
      }

      const newTime = parseRelativeTime(duration);
      if (!newTime) {
        throw errors.validation(`Could not parse duration: "${duration}"`);
      }

      const updated = await prisma.reminder.update({
        where: { id },
        data: {
          remindAt: newTime,
          status: 'pending',
        },
      });

      return reply.send({ reminder: updated });
    }
  );
};
