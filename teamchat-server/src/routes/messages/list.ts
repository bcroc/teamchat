import type { FastifyInstance } from 'fastify';
import {
  getMessagesSchema,
  searchSchema,
} from '@teamchat/shared';
import { prisma } from '../../lib/db.js';
import { assertZodSuccess } from '../helpers/validation.js';
import { requireChannelAccess, requireDmAccess, requireScopeAccess } from '../../middleware/auth.js';
import { messageInclude, withReplyCount } from './helpers.js';

export function registerMessageListRoutes(fastify: FastifyInstance): void {
  fastify.get('/', async (request) => {
    const { channelId, dmThreadId, parentId, cursor, limit } = assertZodSuccess(
      getMessagesSchema.safeParse(request.query)
    );

    await requireScopeAccess(request.user.id, { channelId, dmThreadId });

    const where = {
      ...(channelId && { channelId }),
      ...(dmThreadId && { dmThreadId }),
      parentId: parentId || null,
      ...(cursor && { createdAt: { lt: new Date(cursor) } }),
    };

    const messages = await prisma.message.findMany({
      where,
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    return {
      items: items.map((m) => withReplyCount(m)),
      nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
      hasMore,
    };
  });

  fastify.get('/search', async (request) => {
    const { q, channelId, dmThreadId, cursor, limit } = assertZodSuccess(
      searchSchema.safeParse(request.query)
    );

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
}
