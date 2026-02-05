import type { FastifyInstance } from 'fastify';
import { createMessageSchema, SOCKET_EVENTS } from '@teamchat/shared';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { requireScopeAccess } from '../../middleware/auth.js';
import { emitToScope, messageInclude, withReplyCount } from './helpers.js';
import { assertZodSuccess } from '../helpers/validation.js';

export function registerMessageCreateRoutes(fastify: FastifyInstance): void {
  fastify.post('/', async (request, reply) => {
    const { channelId, dmThreadId, parentId, body, fileIds, isEncrypted, nonce, encryptionVersion } =
      assertZodSuccess(createMessageSchema.safeParse(request.body));

    const { workspaceId } = await requireScopeAccess(request.user.id, { channelId, dmThreadId });

    if (parentId) {
      const parent = await prisma.message.findUnique({
        where: { id: parentId },
        select: { channelId: true, dmThreadId: true },
      });

      if (!parent) {
        throw errors.notFound('Parent message');
      }

      if (parent.channelId !== channelId || parent.dmThreadId !== dmThreadId) {
        throw errors.validation('Parent message must be in the same scope');
      }
    }

    const message = await prisma.message.create({
      data: {
        workspaceId,
        channelId,
        dmThreadId,
        senderId: request.user.id,
        parentId,
        body,
        isEncrypted,
        nonce,
        encryptionVersion,
        ...(fileIds?.length && {
          files: {
            connect: fileIds.map((fileId: string) => ({ id: fileId })),
          },
        }),
      },
      include: messageInclude,
    });

    const messageWithReplyCount = withReplyCount(message);

    emitToScope(fastify.io, SOCKET_EVENTS.MESSAGE_CREATED, messageWithReplyCount, { channelId, dmThreadId });

    return reply.status(201).send({ message: messageWithReplyCount });
  });
}
