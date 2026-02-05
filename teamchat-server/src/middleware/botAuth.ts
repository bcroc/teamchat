import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { errors } from '../lib/errors.js';
import { prisma } from '../lib/db.js';

// Bot scope definitions
export const BOT_SCOPES = {
  // Messages
  MESSAGES_READ: 'messages:read',
  MESSAGES_WRITE: 'messages:write',
  MESSAGES_DELETE: 'messages:delete',

  // Channels
  CHANNELS_READ: 'channels:read',
  CHANNELS_WRITE: 'channels:write',
  CHANNELS_HISTORY: 'channels:history',

  // Users
  USERS_READ: 'users:read',

  // Reactions
  REACTIONS_READ: 'reactions:read',
  REACTIONS_WRITE: 'reactions:write',

  // Files
  FILES_READ: 'files:read',
  FILES_WRITE: 'files:write',

  // Webhooks
  WEBHOOKS_READ: 'webhooks:read',
  WEBHOOKS_WRITE: 'webhooks:write',
} as const;

export type BotScope = (typeof BOT_SCOPES)[keyof typeof BOT_SCOPES];

/**
 * Hash a token for storage/comparison
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a new bot token with prefix
 */
export function generateBotToken(): { token: string; prefix: string; hash: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Buffer.from(bytes).toString('base64url');
  const prefix = token.slice(0, 8);
  const hash = hashToken(token);
  return { token, prefix, hash };
}

/**
 * Extract bot token from request
 */
function getBotTokenFromRequest(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bot ')) {
    return authHeader.slice(4);
  }
  return null;
}

/**
 * Middleware to authenticate bot requests
 * Use this for routes that can only be accessed by bots
 */
export async function authenticateBot(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = getBotTokenFromRequest(request);

  if (!token) {
    throw errors.botTokenInvalid();
  }

  const tokenHash = hashToken(token);

  // Find the token and related bot
  const botToken = await prisma.botToken.findUnique({
    where: { token: tokenHash },
    include: {
      bot: {
        include: {
          scopes: true,
        },
      },
    },
  });

  if (!botToken) {
    throw errors.botTokenInvalid();
  }

  // Check if token is revoked
  if (botToken.isRevoked) {
    throw errors.botTokenRevoked();
  }

  // Check if token is expired
  if (botToken.expiresAt && botToken.expiresAt < new Date()) {
    throw errors.botTokenExpired();
  }

  // Check if bot is enabled
  if (!botToken.bot.isEnabled) {
    throw errors.botDisabled();
  }

  // Update last used timestamp (fire and forget)
  prisma.botToken.update({
    where: { id: botToken.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {
    // Ignore errors updating last used
  });

  // Attach bot to request
  request.bot = {
    id: botToken.bot.id,
    workspaceId: botToken.bot.workspaceId,
    name: botToken.bot.name,
    displayName: botToken.bot.displayName,
    scopes: botToken.bot.scopes.map((s) => s.scope),
  };
}

/**
 * Middleware that accepts either user or bot authentication
 * Useful for routes that can be accessed by both users and bots
 */
export async function authenticateUserOrBot(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  // Check if it's a bot token
  if (authHeader?.startsWith('Bot ')) {
    return authenticateBot(request, reply);
  }

  // Otherwise, try standard user authentication
  const { authenticate } = await import('./auth.js');
  return authenticate(request, reply);
}

/**
 * Check if the bot has a required scope
 */
export function requireBotScope(scope: BotScope) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.bot) {
      throw errors.unauthorized('Bot authentication required');
    }

    if (!request.bot.scopes.includes(scope)) {
      throw errors.botInsufficientScope(scope);
    }
  };
}

/**
 * Check if the bot has any of the required scopes
 */
export function requireAnyBotScope(scopes: BotScope[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.bot) {
      throw errors.unauthorized('Bot authentication required');
    }

    const hasScope = scopes.some((scope) => request.bot!.scopes.includes(scope));
    if (!hasScope) {
      throw errors.botInsufficientScope(scopes.join(' or '));
    }
  };
}

/**
 * Helper to check if request is from a bot
 */
export function isBot(request: FastifyRequest): boolean {
  return !!request.bot;
}

/**
 * Helper to check if bot has workspace access
 */
export async function requireBotWorkspaceAccess(
  request: FastifyRequest,
  workspaceId: string
): Promise<void> {
  if (!request.bot) {
    throw errors.unauthorized('Bot authentication required');
  }

  if (request.bot.workspaceId !== workspaceId) {
    throw errors.forbidden('Bot does not have access to this workspace');
  }
}

/**
 * Helper to check if bot has channel access
 */
export async function requireBotChannelAccess(
  request: FastifyRequest,
  channelId: string
): Promise<{ channel: { id: string; workspaceId: string } }> {
  if (!request.bot) {
    throw errors.unauthorized('Bot authentication required');
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, workspaceId: true },
  });

  if (!channel) {
    throw errors.notFound('Channel');
  }

  if (channel.workspaceId !== request.bot.workspaceId) {
    throw errors.forbidden('Bot does not have access to this channel');
  }

  return { channel };
}
