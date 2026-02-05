import type { FastifyInstance } from 'fastify';
import { registerBotManagementRoutes } from './bots/management.js';
import { registerBotTokenRoutes } from './bots/tokens.js';
import { registerBotScopeRoutes } from './bots/scopes.js';

export default async function botsRoutes(fastify: FastifyInstance) {
  registerBotManagementRoutes(fastify);
  registerBotTokenRoutes(fastify);
  registerBotScopeRoutes(fastify);
}
