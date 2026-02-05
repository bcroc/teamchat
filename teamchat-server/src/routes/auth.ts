import type { FastifyPluginAsync } from 'fastify';
import { registerAuthSignupRoutes } from './auth/signup.js';
import { registerAuthLoginRoutes } from './auth/login.js';
import { registerAuthSessionRoutes } from './auth/session.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  registerAuthSignupRoutes(fastify);
  registerAuthLoginRoutes(fastify);
  registerAuthSessionRoutes(fastify);
};
