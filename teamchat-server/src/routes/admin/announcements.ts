import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { logAdminAction } from '../../middleware/adminAuth.js';
import { createAnnouncementSchema, updateAnnouncementSchema } from './schemas.js';

export function registerAdminAnnouncementRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Querystring: { active?: string } }>('/announcements', async (request) => {
    const { active } = request.query;

    const where: any = {};
    if (active === 'true') {
      where.isActive = true;
    } else if (active === 'false') {
      where.isActive = false;
    }

    const announcements = await prisma.systemAnnouncement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return { announcements };
  });

  fastify.post<{ Body: z.infer<typeof createAnnouncementSchema> }>(
    '/announcements',
    async (request, reply) => {
      const data = createAnnouncementSchema.parse(request.body);

      const announcement = await prisma.systemAnnouncement.create({
        data: {
          title: data.title,
          content: data.content,
          type: data.type,
          startsAt: data.startsAt ? new Date(data.startsAt) : new Date(),
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          createdBy: request.user.id,
        },
      });

      await logAdminAction(
        request.user.id,
        'announcement.create',
        'announcement',
        announcement.id,
        { title: data.title, type: data.type },
        request
      );

      reply.status(201);
      return { announcement };
    }
  );

  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateAnnouncementSchema> }>(
    '/announcements/:id',
    async (request) => {
      const { id } = request.params;
      const data = updateAnnouncementSchema.parse(request.body);

      const existing = await prisma.systemAnnouncement.findUnique({ where: { id } });

      if (!existing) {
        throw errors.notFound('Announcement');
      }

      const announcement = await prisma.systemAnnouncement.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.content !== undefined && { content: data.content }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.startsAt !== undefined && { startsAt: new Date(data.startsAt) }),
          ...(data.endsAt !== undefined && { endsAt: data.endsAt ? new Date(data.endsAt) : null }),
        },
      });

      await logAdminAction(
        request.user.id,
        'announcement.update',
        'announcement',
        id,
        { changes: data },
        request
      );

      return { announcement };
    }
  );

  fastify.delete<{ Params: { id: string } }>('/announcements/:id', async (request, reply) => {
    const { id } = request.params;

    const announcement = await prisma.systemAnnouncement.findUnique({ where: { id } });

    if (!announcement) {
      throw errors.notFound('Announcement');
    }

    await prisma.systemAnnouncement.delete({ where: { id } });

    await logAdminAction(
      request.user.id,
      'announcement.delete',
      'announcement',
      id,
      { title: announcement.title },
      request
    );

    reply.status(204);
    return;
  });
}
