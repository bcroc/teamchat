import { z } from 'zod';

export const triggerActionSchema = z.object({
  messageId: z.string().uuid(),
  actionId: z.string(),
  value: z.string().optional(),
});

export const actionResponseSchema = z.object({
  responseType: z.enum(['ephemeral', 'in_channel', 'update']).optional(),
  text: z.string().max(10000).optional(),
  replaceOriginal: z.boolean().optional(),
  deleteOriginal: z.boolean().optional(),
});
