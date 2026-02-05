import type { FastifyInstance } from 'fastify';
import { BOT_SCOPES } from '../../middleware/botAuth.js';
import { getScopeDescription } from './helpers.js';

export function registerBotScopeRoutes(fastify: FastifyInstance): void {
  fastify.get('/scopes', async () => {
    return {
      scopes: Object.entries(BOT_SCOPES).map(([key, value]) => ({
        key,
        value,
        description: getScopeDescription(value),
      })),
    };
  });
}
