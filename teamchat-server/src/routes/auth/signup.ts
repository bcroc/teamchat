import type { FastifyInstance } from 'fastify';
import * as argon2 from 'argon2';
import { signupSchema } from '@teamchat/shared';
import { prisma } from '../../lib/db.js';
import { signToken, setTokenCookie } from '../../lib/auth.js';
import { errors } from '../../lib/errors.js';
import { assertZodSuccess } from '../helpers/validation.js';

export function registerAuthSignupRoutes(fastify: FastifyInstance): void {
  fastify.post('/signup', async (request, reply) => {
    const { email, password, displayName } = assertZodSuccess(
      signupSchema.safeParse(request.body)
    );

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      throw errors.emailExists();
    }

    const passwordHash = await argon2.hash(password);

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

    const token = await signToken(user);
    setTokenCookie(reply, token);

    return reply.status(201).send({
      user,
      token,
    });
  });
}
