import type { FastifyInstance } from 'fastify';
import * as argon2 from 'argon2';
import { loginSchema } from '@teamchat/shared';
import { prisma } from '../../lib/db.js';
import { signToken, setTokenCookie } from '../../lib/auth.js';
import { errors } from '../../lib/errors.js';
import { assertZodSuccess } from '../helpers/validation.js';
import {
  isAccountLocked,
  recordFailedLogin,
  clearFailedLogins,
  getRemainingAttempts,
} from '../../lib/security.js';

export function registerAuthLoginRoutes(fastify: FastifyInstance): void {
  fastify.post('/login', async (request, reply) => {
    const { email, password } = assertZodSuccess(
      loginSchema.safeParse(request.body)
    );

    const normalizedEmail = email.toLowerCase();
    const clientIp = request.ip;

    if (await isAccountLocked(normalizedEmail)) {
      throw errors.forbidden(
        'Account temporarily locked due to too many failed attempts. Please try again later.'
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      await recordFailedLogin(normalizedEmail, clientIp);
      throw errors.invalidCredentials();
    }

    if (user.isSuspended) {
      throw errors.forbidden('Your account has been suspended. Please contact support.');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      const shouldLock = await recordFailedLogin(normalizedEmail, clientIp);
      if (shouldLock) {
        throw errors.forbidden(
          'Account locked due to too many failed attempts. Please try again in 15 minutes.'
        );
      }

      const remaining = await getRemainingAttempts(normalizedEmail);
      throw errors.unauthorized(
        `Invalid email or password. ${remaining} attempts remaining.`
      );
    }

    await clearFailedLogins(normalizedEmail);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    });

    const authUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };

    const token = await signToken(authUser);
    setTokenCookie(reply, token);

    return reply.send({
      user: authUser,
      token,
    });
  });
}
