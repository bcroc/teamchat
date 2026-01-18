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

import crypto from 'crypto';
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
      // Security: Redact sensitive data from logs
      redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password'],
    },
    trustProxy: true,
    // Security: Disable x-powered-by header
    disableRequestLogging: config.isProd,
  });

  // Security: Add security headers with Helmet
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    // Security: Additional headers
    crossOriginEmbedderPolicy: false, // Required for some WebRTC setups
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    noSniff: true,
    xssFilter: true,
  });

  await app.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400, // Cache preflight for 24 hours
  });

  await app.register(cookie, {
    secret: process.env.JWT_SECRET || 'dev-secret',
    hook: 'onRequest',
    parseOptions: {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
    },
  });

  // Security: Enhanced rate limiting
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    keyGenerator: (request) => {
      // Use X-Forwarded-For in production (behind reverse proxy)
      return request.ip;
    },
    // Skip rate limiting for health checks
    allowList: (request) => request.url === '/health',
    // Add rate limit headers
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true },
    addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'retry-after': true },
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.upload.maxFileSize,
      files: 1,
      fieldSize: 1024 * 100, // 100KB max for text fields
    },
  });

  // Security: Add request ID for tracing
  app.addHook('onRequest', (request, reply, done) => {
    const requestId = request.headers['x-request-id'] || crypto.randomUUID();
    reply.header('X-Request-ID', requestId);
    done();
  });

  // Error handler with security considerations
  app.setErrorHandler((error, request, reply) => {
    // Log full error internally
    request.log.error({
      err: error,
      requestId: reply.getHeader('X-Request-ID'),
      url: request.url,
      method: request.method,
    });

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Fastify validation errors - sanitize output
    if (error.validation) {
      return reply.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: config.isDev ? error.validation : undefined,
      });
    }

    // Rate limit error
    if (error.statusCode === 429) {
      return reply.status(HTTP_STATUS.TOO_MANY_REQUESTS).send({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      });
    }

    // Zod validation errors
    if (error.name === 'ZodError') {
      return reply.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
      });
    }

    // Prisma errors - don't leak database details
    if (error.name === 'PrismaClientKnownRequestError') {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        code: 'DATABASE_ERROR',
        message: 'A database error occurred',
      });
    }

    // Generic error - never leak stack traces or internal details in production
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      ...(config.isDev && { debug: error.message }),
    });
  });

  // Health check with optional detailed info
  app.get('/health', async (request) => {
    const detailed = request.query && 'detailed' in (request.query as object);
    
    const response: Record<string, unknown> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
    
    // Only return detailed info in dev or if explicitly requested
    if (config.isDev || detailed) {
      response.version = process.env.npm_package_version || '1.0.0';
      response.uptime = process.uptime();
      response.memory = process.memoryUsage();
    }
    
    return response;
  });

  // Readiness check (for Kubernetes)
  app.get('/ready', async () => ({ status: 'ready' }));

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
