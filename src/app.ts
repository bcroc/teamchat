/**
 * Fastify Application Builder
 *
 * Configures and builds the main Fastify application with all necessary
 * plugins, middleware, and route handlers. This module is responsible for:
 *
 * - Security middleware (Helmet CSP, CORS, rate limiting)
 * - Request parsing (cookies, multipart file uploads)
 * - Global error handling with standardized responses
 * - Route registration for all API endpoints
 *
 * @module apps/api/src/app
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './lib/config.js';
import { AppError } from './lib/errors.js';
import { HTTP_STATUS } from '@teamchat/shared';

// Route handlers
import { authRoutes } from './routes/auth.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { channelRoutes } from './routes/channels.js';
import { dmRoutes } from './routes/dms.js';
import { messageRoutes } from './routes/messages.js';
import { fileRoutes } from './routes/files.js';
import { callRoutes } from './routes/calls.js';
import { pinRoutes } from './routes/pins.js';
import { savedRoutes } from './routes/saved.js';
import { userRoutes } from './routes/users.js';
import { linkRoutes } from './routes/links.js';
import { scheduledRoutes } from './routes/scheduled.js';
import { reminderRoutes } from './routes/reminders.js';
import { preferencesRoutes } from './routes/preferences.js';
import botsRoutes from './routes/bots.js';
import botApiRoutes from './routes/botApi.js';
import webhooksRoutes from './routes/webhooks.js';
import interactionsRoutes from './routes/interactions.js';
import { e2eeRoutes } from './routes/e2ee.js';
import { adminRoutes, publicAdminRoutes } from './routes/admin.js';

/**
 * Builds and configures the Fastify application instance.
 *
 * @returns Configured Fastify instance ready to start listening
 *
 * @example
 * const app = await buildApp();
 * await app.listen({ port: 3001 });
 */
export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.isDev ? 'info' : 'warn',
      transport: config.isDev
        ? {
            target: 'pino-pretty',
            options: { colorize: true },
          }
        : undefined,
    },
    trustProxy: true,
  });

  // Plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  });

  await app.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(cookie, {
    secret: process.env.JWT_SECRET || 'dev-secret',
    hook: 'onRequest',
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    keyGenerator: (request) => {
      return request.ip;
    },
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.upload.maxFileSize,
      files: 1,
    },
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.validation,
      });
    }

    // Rate limit error
    if (error.statusCode === 429) {
      return reply.status(HTTP_STATUS.TOO_MANY_REQUESTS).send({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      });
    }

    // Generic error
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      code: 'INTERNAL_ERROR',
      message: config.isDev ? error.message : 'Internal server error',
    });
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Register routes
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(workspaceRoutes, { prefix: '/workspaces' });
  await app.register(channelRoutes, { prefix: '/channels' });
  await app.register(dmRoutes, { prefix: '/dms' });
  await app.register(messageRoutes, { prefix: '/messages' });
  await app.register(fileRoutes, { prefix: '/files' });
  await app.register(callRoutes, { prefix: '/calls' });
  await app.register(pinRoutes, { prefix: '/pins' });
  await app.register(savedRoutes, { prefix: '/saved' });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(linkRoutes, { prefix: '/links' });
  await app.register(scheduledRoutes, { prefix: '/scheduled' });
  await app.register(reminderRoutes, { prefix: '/reminders' });
  await app.register(preferencesRoutes, { prefix: '/preferences' });
  await app.register(botsRoutes, { prefix: '/bots' });
  await app.register(botApiRoutes, { prefix: '/bot/api' });
  await app.register(webhooksRoutes, { prefix: '/webhooks' });
  await app.register(e2eeRoutes, { prefix: '/e2ee' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(publicAdminRoutes, { prefix: '/announcements' });
  await app.register(interactionsRoutes, { prefix: '/interactions' });

  return app;
}
