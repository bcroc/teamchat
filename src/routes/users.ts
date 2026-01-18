import type { FastifyPluginAsync } from 'fastify';
import type { Server } from 'socket.io';
import { updateStatusSchema, SOCKET_EVENTS } from '@teamchat/shared';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /users/me - Get current user
  fastify.get('/me', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        customStatus: true,
        statusExpiry: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw errors.notFound('User');
    }

    return { user };
  });

  // PATCH /users/me - Update current user
  fastify.patch('/me', async (request) => {
    const { displayName, status: userStatus } = request.body as {
      displayName?: string;
      status?: string;
    };

    const updateData: Record<string, unknown> = {};

    if (displayName) {
      if (displayName.length < 2 || displayName.length > 50) {
        throw errors.validation('Display name must be between 2 and 50 characters');
      }
      updateData.displayName = displayName;
    }

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        customStatus: true,
        statusExpiry: true,
        createdAt: true,
      },
    });

    return { user };
  });

  // PATCH /users/me/status - Update user status
  fastify.patch('/me/status', async (request) => {
    const result = updateStatusSchema.safeParse(request.body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { status, customStatus, statusExpiry } = result.data;

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data: {
        status,
        customStatus,
        statusExpiry: statusExpiry ? new Date(statusExpiry) : null,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        customStatus: true,
        statusExpiry: true,
        createdAt: true,
      },
    });

    // Broadcast status update
    fastify.io?.emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
      userId: user.id,
      status: user.status,
      customStatus: user.customStatus,
    });

    return { user };
  });

  // DELETE /users/me/status - Clear custom status
  fastify.delete('/me/status', async (request, reply) => {
    await prisma.user.update({
      where: { id: request.user.id },
      data: {
        customStatus: null,
        statusExpiry: null,
      },
    });

    // Broadcast status update
    fastify.io?.emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
      userId: request.user.id,
      status: 'active',
      customStatus: null,
    });

    return reply.status(204).send();
  });
};
