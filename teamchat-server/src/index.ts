/**
 * TeamChat API Server Entry Point
 *
 * This is the main entry point for the TeamChat API server. It initializes
 * all required services (database, Redis, file storage), creates the HTTP
 * server with Fastify, and sets up Socket.io for real-time communication.
 *
 * Startup sequence:
 * 1. Connect to PostgreSQL database via Prisma
 * 2. Connect to Redis for caching and pub/sub
 * 3. Initialize local file storage directory
 * 4. Build Fastify application with middleware and routes
 * 5. Create HTTP server and attach Socket.io
 * 6. Start listening on configured port
 *
 * @module apps/api/src/index
 */

import { createServer } from 'http';
import { buildApp } from './app.js';
import { setupSocketServer } from './socket/index.js';
import { connectDatabase, disconnectDatabase } from './lib/db.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { initFileStorage } from './lib/file-storage.js';
import { config } from './lib/config.js';

/**
 * Main application bootstrap function.
 * Initializes all services and starts the server with graceful shutdown support.
 */
async function main() {
  try {
    // Initialize services
    await connectDatabase();
    await connectRedis();
    await initFileStorage();

    // Build Fastify app
    const app = await buildApp();

    // Create HTTP server (needed for Socket.io)
    const httpServer = createServer(app.server);

    // Setup Socket.io
    const io = setupSocketServer(httpServer);

    // Store io instance for use in routes
    app.decorate('io', io);

    // Start server
    await app.listen({ port: config.port, host: config.host });

    console.log(`
╔════════════════════════════════════════════╗
║       TeamChat API Server Started          ║
╠════════════════════════════════════════════╣
║  HTTP:   http://${config.host}:${config.port}              ║
║  Socket: ws://${config.host}:${config.port}                ║
║  Env:    ${config.nodeEnv.padEnd(32)}║
╚════════════════════════════════════════════╝
    `);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);

      await app.close();
      io.close();
      await disconnectRedis();
      await disconnectDatabase();

      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
