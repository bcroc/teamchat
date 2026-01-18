/**
 * Database Client Configuration
 *
 * Provides a singleton Prisma client instance with proper handling for
 * development hot-reloading. In development, the client is stored on
 * globalThis to prevent creating new connections on each module reload.
 *
 * @module apps/api/src/lib/db
 */

import { PrismaClient } from '@prisma/client';

/**
 * Global Prisma client storage for development hot-reload safety.
 * Prevents "too many connections" errors during development.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('Database connected');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('Database disconnected');
}
