import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { registerMessageListRoutes } from './messages/list.js';
import { registerMessageCreateRoutes } from './messages/create.js';
import { registerMessageCrudRoutes } from './messages/crud.js';
import { registerMessageReactionRoutes } from './messages/reactions.js';
import { registerMessageReadRoutes } from './messages/reads.js';

export const messageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  registerMessageListRoutes(fastify);
  registerMessageCreateRoutes(fastify);
  registerMessageCrudRoutes(fastify);
  registerMessageReactionRoutes(fastify);
  registerMessageReadRoutes(fastify);
};
