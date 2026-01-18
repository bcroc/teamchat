import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHmac } from 'crypto';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { getSocketServer } from '../socket/index.js';
import { SOCKET_EVENTS } from '@teamchat/shared';

// Validation schemas
const triggerActionSchema = z.object({
  messageId: z.string().uuid(),
  actionId: z.string(),
  value: z.string().optional(), // For select menus
});

// Response from bot for action
const actionResponseSchema = z.object({
  responseType: z.enum(['ephemeral', 'in_channel', 'update']).optional(),
  text: z.string().max(10000).optional(),
  replaceOriginal: z.boolean().optional(),
  deleteOriginal: z.boolean().optional(),
});

export default async function interactionsRoutes(fastify: FastifyInstance) {
  // User triggers an interactive action (button click, select choice)
  fastify.post<{ Body: z.infer<typeof triggerActionSchema> }>(
    '/trigger',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = triggerActionSchema.parse(request.body);

      // Find the action
      const action = await prisma.interactiveMessageAction.findFirst({
        where: {
          messageId: data.messageId,
          actionId: data.actionId,
        },
        include: {
          message: {
            include: {
              bot: {
                include: {
                  outgoingWebhooks: {
                    where: {
                      isEnabled: true,
                      events: { has: 'interaction' },
                    },
                  },
                },
              },
              channel: { select: { id: true, name: true, workspaceId: true } },
            },
          },
        },
      });

      if (!action) {
        throw errors.notFound('Action');
      }

      // If the action has a URL, it's a link button - let client handle it
      if (action.url) {
        return { type: 'url', url: action.url };
      }

      // Get the bot's interaction webhook URL
      const bot = action.message.bot;
      if (!bot) {
        // No bot associated - might be a standalone webhook message
        // In this case, we could look for a slash command URL or just acknowledge
        return {
          type: 'acknowledged',
          message: 'Action received',
        };
      }

      // Find interaction webhook for this bot
      const interactionWebhook = bot.outgoingWebhooks.find((w) =>
        w.events.includes('interaction')
      );

      if (!interactionWebhook) {
        // Bot doesn't handle interactions
        return {
          type: 'acknowledged',
          message: 'Action received',
        };
      }

      // Build interaction payload
      const payload = {
        type: 'interaction',
        timestamp: new Date().toISOString(),
        action: {
          id: action.id,
          actionId: action.actionId,
          type: action.type,
          value: data.value || action.value,
        },
        message: {
          id: action.message.id,
          channelId: action.message.channelId,
          body: action.message.body,
        },
        channel: action.message.channel,
        user: {
          id: request.user.id,
          displayName: request.user.displayName,
        },
        bot: {
          id: bot.id,
          name: bot.name,
        },
      };

      // Sign the payload
      const body = JSON.stringify(payload);
      const signature = createHmac('sha256', interactionWebhook.secret)
        .update(body)
        .digest('hex');

      try {
        // Send to bot's webhook
        const response = await fetch(interactionWebhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TeamChat-Signature': `sha256=${signature}`,
            'X-TeamChat-Event': 'interaction',
          },
          body,
          signal: AbortSignal.timeout(5000), // 5 second timeout for interactions
        });

        if (!response.ok) {
          throw new Error(`Bot responded with ${response.status}`);
        }

        // Parse bot's response
        const responseText = await response.text();
        if (!responseText) {
          return { type: 'acknowledged' };
        }

        let botResponse: z.infer<typeof actionResponseSchema>;
        try {
          botResponse = actionResponseSchema.parse(JSON.parse(responseText));
        } catch {
          return { type: 'acknowledged' };
        }

        // Handle the bot's response
        if (botResponse.deleteOriginal) {
          // Delete the original message
          await prisma.message.update({
            where: { id: action.message.id },
            data: { isDeleted: true },
          });

          const io = getSocketServer();
          if (action.message.channelId) {
            io.to(`channel:${action.message.channelId}`).emit(
              SOCKET_EVENTS.MESSAGE_DELETED,
              { messageId: action.message.id }
            );
          }

          return { type: 'deleted' };
        }

        if (botResponse.replaceOriginal && botResponse.text) {
          // Update the original message
          const updated = await prisma.message.update({
            where: { id: action.message.id },
            data: { body: botResponse.text },
            include: {
              sender: { select: { id: true, displayName: true, avatarUrl: true } },
              bot: { select: { id: true, displayName: true, avatarUrl: true } },
            },
          });

          const io = getSocketServer();
          if (action.message.channelId) {
            io.to(`channel:${action.message.channelId}`).emit(
              SOCKET_EVENTS.MESSAGE_UPDATED,
              { message: updated }
            );
          }

          return { type: 'updated', message: updated };
        }

        if (botResponse.text) {
          if (botResponse.responseType === 'in_channel') {
            // Post as a new message in the channel
            const botInfo = await prisma.bot.findUnique({
              where: { id: bot.id },
              select: { createdBy: true },
            });

            const newMessage = await prisma.message.create({
              data: {
                workspaceId: action.message.channel!.workspaceId,
                channelId: action.message.channelId,
                senderId: botInfo!.createdBy,
                botId: bot.id,
                body: botResponse.text,
              },
              include: {
                sender: { select: { id: true, displayName: true, avatarUrl: true } },
                bot: { select: { id: true, displayName: true, avatarUrl: true } },
              },
            });

            const io = getSocketServer();
            if (action.message.channelId) {
              io.to(`channel:${action.message.channelId}`).emit(
                SOCKET_EVENTS.MESSAGE_CREATED,
                {
                  message: {
                    ...newMessage,
                    sender: {
                      id: newMessage.sender.id,
                      displayName: newMessage.bot?.displayName || bot.displayName,
                      avatarUrl: newMessage.bot?.avatarUrl,
                      isBot: true,
                    },
                  },
                }
              );
            }

            return { type: 'message', message: newMessage };
          }

          // Ephemeral response - only shown to the user who triggered
          return {
            type: 'ephemeral',
            text: botResponse.text,
          };
        }

        return { type: 'acknowledged' };
      } catch (error) {
        // Bot didn't respond in time or errored
        console.error('Interaction delivery failed:', error);
        return {
          type: 'error',
          message: 'Bot did not respond',
        };
      }
    }
  );

  // Get interactive actions for a message
  fastify.get<{ Params: { messageId: string } }>(
    '/message/:messageId',
    { preHandler: [authenticate] },
    async (request) => {
      const actions = await prisma.interactiveMessageAction.findMany({
        where: { messageId: request.params.messageId },
        orderBy: { position: 'asc' },
      });

      return { actions };
    }
  );
}
