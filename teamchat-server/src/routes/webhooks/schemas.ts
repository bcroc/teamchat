import { z } from 'zod';

export const createIncomingWebhookSchema = z.object({
  workspaceId: z.string().uuid(),
  channelId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  botId: z.string().uuid().optional(),
});

export const updateIncomingWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  channelId: z.string().uuid().optional(),
  isEnabled: z.boolean().optional(),
});

export const createOutgoingWebhookSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  channelIds: z.array(z.string().uuid()).optional(),
  botId: z.string().uuid().optional(),
});

export const updateOutgoingWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  channelIds: z.array(z.string().uuid()).optional(),
  isEnabled: z.boolean().optional(),
});

export const webhookMessageSchema = z.object({
  text: z.string().min(1).max(10000),
  username: z.string().max(100).optional(),
  iconUrl: z.string().url().optional(),
  attachments: z.array(z.object({
    color: z.string().optional(),
    title: z.string().max(200).optional(),
    titleLink: z.string().url().optional(),
    text: z.string().max(3000).optional(),
    fields: z.array(z.object({
      title: z.string().max(100),
      value: z.string().max(500),
      short: z.boolean().optional(),
    })).max(10).optional(),
    imageUrl: z.string().url().optional(),
    thumbUrl: z.string().url().optional(),
    footer: z.string().max(100).optional(),
    footerIcon: z.string().url().optional(),
    ts: z.number().optional(),
  })).max(20).optional(),
  actions: z.array(z.object({
    type: z.enum(['button', 'select']),
    actionId: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    value: z.string().max(1000).optional(),
    style: z.enum(['primary', 'danger', 'default']).optional(),
    url: z.string().url().optional(),
    confirm: z.object({
      title: z.string().max(100),
      text: z.string().max(500),
      confirmText: z.string().max(50).optional(),
      denyText: z.string().max(50).optional(),
    }).optional(),
    options: z.array(z.object({
      label: z.string().max(100),
      value: z.string().max(1000),
      description: z.string().max(200).optional(),
    })).optional(),
  })).max(25).optional(),
});

export type WebhookMessageInput = z.infer<typeof webhookMessageSchema>;
