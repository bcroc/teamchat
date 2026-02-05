import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { clearTokenCookie } from '../../lib/auth.js';
import { errors } from '../../lib/errors.js';
import { authenticate } from '../../middleware/auth.js';

export function registerAuthSessionRoutes(fastify: FastifyInstance): void {
  fastify.post('/logout', async (_request, reply) => {
    clearTokenCookie(reply);
    return reply.status(204).send();
  });

  fastify.get('/me', { preHandler: authenticate }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
        isServerAdmin: true,
      },
    });

    if (!user) {
      throw errors.notFound('User');
    }

    return { user };
  });
}
