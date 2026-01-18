import type { FastifyPluginAsync } from 'fastify';
import * as argon2 from 'argon2';
import { signupSchema, loginSchema } from '@teamchat/shared';
import { prisma } from '../lib/db.js';
import { signToken, setTokenCookie, clearTokenCookie } from '../lib/auth.js';
import { errors } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/signup
  fastify.post('/signup', async (request, reply) => {
    const result = signupSchema.safeParse(request.body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { email, password, displayName } = result.data;

    // Check if email exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      throw errors.emailExists();
    }

    // Hash password
    const passwordHash = await argon2.hash(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        displayName,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    // Generate token
    const token = await signToken(user);

    // Set cookie
    setTokenCookie(reply, token);

    return reply.status(201).send({
      user,
      token,
    });
  });

  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      throw errors.validation('Invalid input', { errors: result.error.flatten() });
    }

    const { email, password } = result.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw errors.invalidCredentials();
    }

    // Verify password
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw errors.invalidCredentials();
    }

    const authUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };

    // Generate token
    const token = await signToken(authUser);

    // Set cookie
    setTokenCookie(reply, token);

    return reply.send({
      user: authUser,
      token,
    });
  });

  // POST /auth/logout
  fastify.post('/logout', async (request, reply) => {
    clearTokenCookie(reply);
    return reply.status(204).send();
  });

  // GET /auth/me
  fastify.get('/me', { preHandler: authenticate }, async (request) => {
    // Fetch fresh user data including admin status
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
        isServerAdmin: true,
      },
    });

    if (!user) {
      throw errors.notFound('User');
    }

    return { user };
  });
};
