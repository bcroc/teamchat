import type { FastifyInstance } from 'fastify';
import { updateReadSchema } from '@teamchat/shared';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { requireChannelAccess, requireDmAccess } from '../../middleware/auth.js';
import { assertZodSuccess } from '../helpers/validation.js';

export function registerMessageReadRoutes(fastify: FastifyInstance): void {
  fastify.post('/reads', async (request, reply) => {
    const { channelId, dmThreadId, lastReadMessageId } = assertZodSuccess(
      updateReadSchema.safeParse(request.body)
    );

    let workspaceId: string;
    if (channelId) {
      const { channel } = await requireChannelAccess(request.user.id, channelId);
      workspaceId = channel.workspaceId;
    } else if (dmThreadId) {
      const { dmThread } = await requireDmAccess(request.user.id, dmThreadId);
      workspaceId = dmThread.workspaceId;
    } else {
      throw errors.validation('Either channelId or dmThreadId is required');
    }

    await prisma.readReceipt.upsert({
      where: channelId
        ? { userId_channelId: { userId: request.user.id, channelId } }
        : { userId_dmThreadId: { userId: request.user.id, dmThreadId: dmThreadId! } },
      create: {
        workspaceId,
        userId: request.user.id,
        channelId,
        dmThreadId,
        lastReadMessageId,
      },
      update: {
        lastReadMessageId,
      },
    });

    return reply.send({ success: true });
  });
}
