import type { FastifyInstance } from 'fastify';
import { registerIncomingWebhookRoutes } from './webhooks/incoming.js';
import { registerOutgoingWebhookRoutes } from './webhooks/outgoing.js';

export { WEBHOOK_EVENTS } from './webhooks/constants.js';

export default async function webhooksRoutes(fastify: FastifyInstance) {
  registerIncomingWebhookRoutes(fastify);
  registerOutgoingWebhookRoutes(fastify);
}
