import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { errors } from '../../lib/errors.js';
import { authenticate } from '../../middleware/auth.js';
import { actionResponseSchema, triggerActionSchema } from './schemas.js';
import { emitMessageCreated, emitMessageDeleted, emitMessageUpdated, signPayload } from './helpers.js';
import { requireScopeAccessWithMessage } from '../helpers/scope.js';

export function registerInteractionTriggerRoutes(fastify: FastifyInstance): void {
  fastify.post<{ Body: z.infer<typeof triggerActionSchema> }>(
    '/trigger',
    { preHandler: [authenticate] },
    async (request) => {
      const data = triggerActionSchema.parse(request.body);

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

      await requireScopeAccessWithMessage(
        request.user.id,
        { channelId: action.message.channelId, dmThreadId: action.message.dmThreadId },
        'Invalid action scope'
      );

      if (action.url) {
        return { type: 'url', url: action.url };
      }

      const bot = action.message.bot;
      if (!bot) {
        return {
          type: 'acknowledged',
          message: 'Action received',
        };
      }

      const interactionWebhook = bot.outgoingWebhooks.find((w) =>
        w.events.includes('interaction')
      );

      if (!interactionWebhook) {
        return {
          type: 'acknowledged',
          message: 'Action received',
        };
      }

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

      const body = JSON.stringify(payload);
      const signature = signPayload(interactionWebhook.secret, body);

      try {
        const response = await fetch(interactionWebhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TeamChat-Signature': `sha256=${signature}`,
            'X-TeamChat-Event': 'interaction',
          },
          body,
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          throw new Error(`Bot responded with ${response.status}`);
        }

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

        if (botResponse.deleteOriginal) {
          await prisma.message.update({
            where: { id: action.message.id },
            data: { isDeleted: true },
          });

          emitMessageDeleted(action.message.channelId, action.message.id);
          return { type: 'deleted' };
        }

        if (botResponse.replaceOriginal && botResponse.text) {
          const updated = await prisma.message.update({
            where: { id: action.message.id },
            data: { body: botResponse.text },
            include: {
              sender: { select: { id: true, displayName: true, avatarUrl: true } },
              bot: { select: { id: true, displayName: true, avatarUrl: true } },
            },
          });

          emitMessageUpdated(action.message.channelId, updated);
          return { type: 'updated', message: updated };
        }

        if (botResponse.text) {
          if (botResponse.responseType === 'in_channel') {
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

            emitMessageCreated(action.message.channelId, {
              message: {
                ...newMessage,
                sender: {
                  id: newMessage.sender.id,
                  displayName: newMessage.bot?.displayName || bot.displayName,
                  avatarUrl: newMessage.bot?.avatarUrl,
                  isBot: true,
                },
              },
            });

            return { type: 'message', message: newMessage };
          }

          return {
            type: 'ephemeral',
            text: botResponse.text,
          };
        }

        return { type: 'acknowledged' };
      } catch (error) {
        console.error('Interaction delivery failed:', error);
        return {
          type: 'error',
          message: 'Bot did not respond',
        };
      }
    }
  );
}
