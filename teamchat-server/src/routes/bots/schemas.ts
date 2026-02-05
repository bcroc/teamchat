import { z } from 'zod';

export const createBotSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'Name must be lowercase alphanumeric with dashes/underscores'),
  displayName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  scopes: z.array(z.string()).min(1),
});

export const updateBotSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  isEnabled: z.boolean().optional(),
});

export const createTokenSchema = z.object({
  name: z.string().min(1).max(100).default('default'),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const updateScopesSchema = z.object({
  scopes: z.array(z.string()).min(1),
});
