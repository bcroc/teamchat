/**
 * Admin Panel Routes
 *
 * Server administration endpoints for:
 * - Dashboard statistics
 * - User management (list, suspend, promote)
 * - Workspace management (list, disable, delete)
 * - Server settings configuration
 * - System announcements
 * - Audit log viewing
 *
 * All routes require server admin authentication.
 *
 * @module apps/api/src/routes/admin
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireServerAdmin } from '../middleware/adminAuth.js';
import { registerAdminDashboardRoutes } from './admin/dashboard.js';
import { registerAdminUserRoutes } from './admin/users.js';
import { registerAdminWorkspaceRoutes } from './admin/workspaces.js';
import { registerAdminSettingsRoutes } from './admin/settings.js';
import { registerAdminAnnouncementRoutes } from './admin/announcements.js';
import { registerAdminAuditLogRoutes } from './admin/auditLogs.js';
import { registerPublicAdminRoutes } from './admin/public.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // All admin routes require server admin authentication
  fastify.addHook('preHandler', requireServerAdmin);
  registerAdminDashboardRoutes(fastify);
  registerAdminUserRoutes(fastify);
  registerAdminWorkspaceRoutes(fastify);
  registerAdminSettingsRoutes(fastify);
  registerAdminAnnouncementRoutes(fastify);
  registerAdminAuditLogRoutes(fastify);
};

/**
 * Public routes for getting active announcements (no auth required)
 */
export const publicAdminRoutes: FastifyPluginAsync = async (fastify) => {
  registerPublicAdminRoutes(fastify);
};
