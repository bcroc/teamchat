import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const suspendUserSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const updateServerSettingsSchema = z.object({
  serverName: z.string().min(1).max(100).optional(),
  serverDescription: z.string().max(500).optional().nullable(),
  allowPublicRegistration: z.boolean().optional(),
  requireEmailVerification: z.boolean().optional(),
  maxWorkspacesPerUser: z.number().int().min(1).max(100).optional(),
  maxMembersPerWorkspace: z.number().int().min(1).max(10000).optional(),
  maxFileUploadSize: z.number().int().min(1048576).max(104857600).optional(),
  enableE2EE: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional().nullable(),
});

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  type: z.enum(['info', 'warning', 'critical']).default('info'),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
});

export const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(2000).optional(),
  type: z.enum(['info', 'warning', 'critical']).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
});
