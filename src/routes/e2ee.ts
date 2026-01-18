/**
 * End-to-End Encryption Routes
 *
 * Handles E2EE key management:
 * - User public key registration
 * - Conversation key share distribution
 * - Key rotation
 *
 * Security: Private keys are never transmitted or stored on the server.
 * Only public keys and encrypted conversation keys are handled here.
 *
 * @module apps/api/src/routes/e2ee
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireChannelAccess, requireDmAccess } from '../middleware/auth.js';

// Validation schemas
const registerKeySchema = z.object({
  deviceId: z.string().min(1).max(100),
  publicKey: z.string().min(1).max(500), // Base64 encoded
  keySignature: z.string().min(1).max(200),
  algorithm: z.enum(['X25519']).default('X25519'),
});

const shareConversationKeySchema = z.object({
  conversationId: z.string().uuid(),
  conversationType: z.enum(['channel', 'dm']),
  keyShares: z.array(z.object({
    recipientKeyId: z.string().uuid(),
    encryptedKey: z.string().min(1).max(1000), // Base64 encoded
    nonce: z.string().min(1).max(100),
  })),
  keyVersion: z.number().int().min(1).default(1),
});

export const e2eeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // ============================================
  // User Key Management
  // ============================================

  /**
   * GET /e2ee/keys/me - Get current user's encryption key for a device
   */
  fastify.get<{ Querystring: { deviceId: string } }>(
    '/keys/me',
    async (request) => {
      const { deviceId } = request.query;

      const key = await prisma.userEncryptionKey.findUnique({
        where: {
          userId_deviceId: {
            userId: request.user.id,
            deviceId,
          },
        },
        select: {
          id: true,
          deviceId: true,
          publicKey: true,
          algorithm: true,
          isActive: true,
          createdAt: true,
        },
      });

      return { key };
    }
  );

  /**
   * GET /e2ee/keys/user/:userId - Get a user's active public keys
   */
  fastify.get<{ Params: { userId: string } }>(
    '/keys/user/:userId',
    async (request) => {
      const { userId } = request.params;

      const keys = await prisma.userEncryptionKey.findMany({
        where: {
          userId,
          isActive: true,
          revokedAt: null,
        },
        select: {
          id: true,
          deviceId: true,
          publicKey: true,
          algorithm: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return { keys };
    }
  );

  /**
   * POST /e2ee/keys - Register a new public key for the current user
   */
  fastify.post<{ Body: z.infer<typeof registerKeySchema> }>(
    '/keys',
    async (request, reply) => {
      const data = registerKeySchema.parse(request.body);

      // Check if key already exists for this device
      const existing = await prisma.userEncryptionKey.findUnique({
        where: {
          userId_deviceId: {
            userId: request.user.id,
            deviceId: data.deviceId,
          },
        },
      });

      if (existing && existing.isActive) {
        throw errors.alreadyExists('Encryption key already registered for this device');
      }

      // If inactive key exists, mark it as revoked
      if (existing) {
        await prisma.userEncryptionKey.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() },
        });
      }

      const key = await prisma.userEncryptionKey.create({
        data: {
          userId: request.user.id,
          deviceId: data.deviceId,
          publicKey: data.publicKey,
          keySignature: data.keySignature,
          algorithm: data.algorithm,
        },
        select: {
          id: true,
          deviceId: true,
          publicKey: true,
          algorithm: true,
          createdAt: true,
        },
      });

      reply.status(201);
      return { key };
    }
  );

  /**
   * DELETE /e2ee/keys/:keyId - Revoke an encryption key
   */
  fastify.delete<{ Params: { keyId: string } }>(
    '/keys/:keyId',
    async (request, reply) => {
      const { keyId } = request.params;

      const key = await prisma.userEncryptionKey.findUnique({
        where: { id: keyId },
      });

      if (!key) {
        throw errors.notFound('Encryption key');
      }

      if (key.userId !== request.user.id) {
        throw errors.forbidden('Cannot revoke another user\'s key');
      }

      await prisma.userEncryptionKey.update({
        where: { id: keyId },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });

      reply.status(204);
      return;
    }
  );

  // ============================================
  // Conversation Key Management
  // ============================================

  /**
   * GET /e2ee/keys/conversation/:conversationId - Get conversation key shares for current user
   */
  fastify.get<{ Params: { conversationId: string } }>(
    '/keys/conversation/:conversationId',
    async (request) => {
      const { conversationId } = request.params;

      // Get the user's active encryption keys
      const userKeys = await prisma.userEncryptionKey.findMany({
        where: {
          userId: request.user.id,
          isActive: true,
        },
        select: { id: true },
      });

      const userKeyIds = userKeys.map((k) => k.id);

      if (userKeyIds.length === 0) {
        return { keyShare: null };
      }

      // Find key share for this conversation and user
      const keyShare = await prisma.conversationKeyShare.findFirst({
        where: {
          conversationId,
          recipientKeyId: { in: userKeyIds },
        },
        orderBy: { keyVersion: 'desc' },
        include: {
          senderKey: {
            select: { publicKey: true, userId: true },
          },
        },
      });

      if (!keyShare) {
        return { keyShare: null };
      }

      return {
        keyShare: {
          id: keyShare.id,
          conversationType: keyShare.conversationType,
          conversationId: keyShare.conversationId,
          encryptedKey: keyShare.encryptedKey,
          nonce: keyShare.nonce,
          keyVersion: keyShare.keyVersion,
        },
        senderPublicKey: keyShare.senderKey.publicKey,
      };
    }
  );

  /**
   * POST /e2ee/keys/conversation - Share conversation key with participants
   */
  fastify.post<{ Body: z.infer<typeof shareConversationKeySchema> }>(
    '/keys/conversation',
    async (request, reply) => {
      const data = shareConversationKeySchema.parse(request.body);

      // Verify access to the conversation
      if (data.conversationType === 'channel') {
        await requireChannelAccess(request.user.id, data.conversationId);
      } else {
        await requireDmAccess(request.user.id, data.conversationId);
      }

      // Get sender's active key
      const senderKey = await prisma.userEncryptionKey.findFirst({
        where: {
          userId: request.user.id,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!senderKey) {
        throw errors.forbidden('You must have an active encryption key');
      }

      // Create key shares for each recipient
      const keyShares = await Promise.all(
        data.keyShares.map(async (share) => {
          // Verify recipient key exists and is active
          const recipientKey = await prisma.userEncryptionKey.findUnique({
            where: { id: share.recipientKeyId },
          });

          if (!recipientKey || !recipientKey.isActive) {
            throw errors.notFound('Recipient encryption key');
          }

          return prisma.conversationKeyShare.upsert({
            where: {
              conversationId_recipientKeyId_keyVersion: {
                conversationId: data.conversationId,
                recipientKeyId: share.recipientKeyId,
                keyVersion: data.keyVersion,
              },
            },
            create: {
              conversationType: data.conversationType,
              conversationId: data.conversationId,
              senderKeyId: senderKey.id,
              recipientKeyId: share.recipientKeyId,
              encryptedKey: share.encryptedKey,
              nonce: share.nonce,
              keyVersion: data.keyVersion,
            },
            update: {
              senderKeyId: senderKey.id,
              encryptedKey: share.encryptedKey,
              nonce: share.nonce,
            },
          });
        })
      );

      reply.status(201);
      return {
        success: true,
        sharesCreated: keyShares.length,
      };
    }
  );

  /**
   * GET /e2ee/keys/conversation/:conversationId/participants - Get all participants' public keys
   */
  fastify.get<{ Params: { conversationId: string }; Querystring: { type: 'channel' | 'dm' } }>(
    '/keys/conversation/:conversationId/participants',
    async (request) => {
      const { conversationId } = request.params;
      const { type } = request.query;

      let participantIds: string[] = [];

      if (type === 'channel') {
        const { channel } = await requireChannelAccess(request.user.id, conversationId);

        const members = await prisma.channelMember.findMany({
          where: { channelId: conversationId },
          select: { userId: true },
        });
        participantIds = members.map((m) => m.userId);
      } else {
        const { dmThread } = await requireDmAccess(request.user.id, conversationId);

        if (dmThread.userAId && dmThread.userBId) {
          participantIds = [dmThread.userAId, dmThread.userBId];
        } else {
          // Group DM
          const participants = await prisma.dmParticipant.findMany({
            where: { dmThreadId: conversationId, leftAt: null },
            select: { userId: true },
          });
          participantIds = participants.map((p) => p.userId);
        }
      }

      // Get active encryption keys for all participants
      const keys = await prisma.userEncryptionKey.findMany({
        where: {
          userId: { in: participantIds },
          isActive: true,
        },
        select: {
          id: true,
          userId: true,
          deviceId: true,
          publicKey: true,
          algorithm: true,
        },
      });

      return { participantKeys: keys };
    }
  );
};
