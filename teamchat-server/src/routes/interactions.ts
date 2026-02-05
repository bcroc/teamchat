import type { FastifyInstance } from 'fastify';
import { registerInteractionTriggerRoutes } from './interactions/trigger.js';
import { registerInteractionActionRoutes } from './interactions/actions.js';

export default async function interactionsRoutes(fastify: FastifyInstance) {
  registerInteractionTriggerRoutes(fastify);
  registerInteractionActionRoutes(fastify);
}
