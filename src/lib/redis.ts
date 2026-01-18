/**
 * Redis Client and Real-time Feature Utilities
 *
 * Provides the Redis client instance and helper functions for:
 * - User presence tracking (online/offline status with TTL)
 * - Typing indicators with automatic expiration
 * - Pub/Sub clients for multi-instance communication
 *
 * Redis key patterns:
 * - presence:{userId} - User online status (2 min TTL)
 * - typing:{scope}:{userId} - Active typing indicator (5 sec TTL)
 *
 * @module apps/api/src/lib/redis
 */

import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Main Redis client instance for caching and presence operations.
 * Uses lazy connection to allow app startup without Redis being ready.
 */
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (error) {
    // ioredis may already be connected in lazy mode
    if ((error as Error).message !== 'Redis is already connecting/connected') {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  console.log('Redis disconnected');
}

// ============================================
// Presence Tracking
// ============================================

const PRESENCE_PREFIX = 'presence:';
const PRESENCE_TTL = 120; // 2 minutes - refreshed on activity

/**
 * Marks a user as online by storing their socket ID with a TTL.
 * Called when a user connects via WebSocket.
 */
export async function setUserOnline(userId: string, socketId: string): Promise<void> {
  const key = `${PRESENCE_PREFIX}${userId}`;
  await redis.setex(key, PRESENCE_TTL, JSON.stringify({ socketId, lastSeen: Date.now() }));
}

export async function setUserOffline(userId: string): Promise<void> {
  const key = `${PRESENCE_PREFIX}${userId}`;
  await redis.del(key);
}

export async function getUserPresence(userId: string): Promise<{ socketId: string; lastSeen: number } | null> {
  const key = `${PRESENCE_PREFIX}${userId}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function refreshPresence(userId: string): Promise<void> {
  const key = `${PRESENCE_PREFIX}${userId}`;
  await redis.expire(key, PRESENCE_TTL);
}

// ============================================
// Typing Indicators
// ============================================

const TYPING_PREFIX = 'typing:';
const TYPING_TTL = 5; // 5 seconds - auto-clears if user stops typing

/**
 * Sets a user's typing indicator for a channel or DM.
 * The indicator auto-expires after 5 seconds if not refreshed.
 */
export async function setTyping(
  scope: { channelId?: string; dmThreadId?: string },
  userId: string,
  displayName: string
): Promise<void> {
  const scopeKey = scope.channelId ? `channel:${scope.channelId}` : `dm:${scope.dmThreadId}`;
  const key = `${TYPING_PREFIX}${scopeKey}:${userId}`;
  await redis.setex(key, TYPING_TTL, displayName);
}

export async function clearTyping(
  scope: { channelId?: string; dmThreadId?: string },
  userId: string
): Promise<void> {
  const scopeKey = scope.channelId ? `channel:${scope.channelId}` : `dm:${scope.dmThreadId}`;
  const key = `${TYPING_PREFIX}${scopeKey}:${userId}`;
  await redis.del(key);
}

export async function getTypingUsers(
  scope: { channelId?: string; dmThreadId?: string }
): Promise<Array<{ userId: string; displayName: string }>> {
  const scopeKey = scope.channelId ? `channel:${scope.channelId}` : `dm:${scope.dmThreadId}`;
  const pattern = `${TYPING_PREFIX}${scopeKey}:*`;
  const keys = await redis.keys(pattern);

  const result: Array<{ userId: string; displayName: string }> = [];
  for (const key of keys) {
    const userId = key.split(':').pop()!;
    const displayName = await redis.get(key);
    if (displayName) {
      result.push({ userId, displayName });
    }
  }

  return result;
}

// ============================================
// Pub/Sub Clients
// ============================================

/**
 * Dedicated Redis clients for pub/sub operations.
 * Required for horizontal scaling with multiple API instances.
 * Socket.io uses these for cross-instance message broadcasting.
 */
export const pubClient = redis.duplicate();
export const subClient = redis.duplicate();
