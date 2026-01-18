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
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { requireServerAdmin, logAdminAction, getServerSettings } from '../middleware/adminAuth.js';

// ============================================
// Validation Schemas
// ============================================

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const suspendUserSchema = z.object({
  reason: z.string().min(1).max(500),
});

const updateServerSettingsSchema = z.object({
  serverName: z.string().min(1).max(100).optional(),
  serverDescription: z.string().max(500).optional().nullable(),
  allowPublicRegistration: z.boolean().optional(),
  requireEmailVerification: z.boolean().optional(),
  maxWorkspacesPerUser: z.number().int().min(1).max(100).optional(),
  maxMembersPerWorkspace: z.number().int().min(1).max(10000).optional(),
  maxFileUploadSize: z.number().int().min(1048576).max(104857600).optional(), // 1MB to 100MB
  enableE2EE: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional().nullable(),
});

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  type: z.enum(['info', 'warning', 'critical']).default('info'),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
});

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(2000).optional(),
  type: z.enum(['info', 'warning', 'critical']).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
});

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // All admin routes require server admin authentication
  fastify.addHook('preHandler', requireServerAdmin);

  // ============================================
  // Dashboard & Statistics
  // ============================================

  /**
   * GET /admin/dashboard - Get admin dashboard statistics
   */
  fastify.get('/dashboard', async (request) => {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalWorkspaces,
      disabledWorkspaces,
      totalMessages,
      totalFiles,
      recentUsers,
      recentWorkspaces,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isSuspended: false } }),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.workspace.count(),
      prisma.workspace.count({ where: { isDisabled: true } }),
      prisma.message.count(),
      prisma.file.count(),
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, displayName: true, createdAt: true },
      }),
      prisma.workspace.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, createdAt: true, _count: { select: { members: true } } },
      }),
    ]);

    // Get storage usage
    const storageStats = await prisma.file.aggregate({
      _sum: { size: true },
    });

    // Get today's activity
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayMessages, todayUsers] = await Promise.all([
      prisma.message.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
    ]);

    return {
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          suspended: suspendedUsers,
          newToday: todayUsers,
        },
        workspaces: {
          total: totalWorkspaces,
          disabled: disabledWorkspaces,
        },
        messages: {
          total: totalMessages,
          today: todayMessages,
        },
        storage: {
          totalFiles: totalFiles,
          totalBytes: storageStats._sum.size || 0,
        },
      },
      recent: {
        users: recentUsers,
        workspaces: recentWorkspaces.map((w) => ({
          ...w,
          memberCount: w._count.members,
        })),
      },
    };
  });

  // ============================================
  // User Management
  // ============================================

  /**
   * GET /admin/users - List all users with pagination
   */
  fastify.get<{ Querystring: z.infer<typeof paginationSchema> & { status?: string } }>(
    '/users',
    async (request) => {
      const { page, limit, search, sortBy, sortOrder, status } = {
        ...paginationSchema.parse(request.query),
        status: request.query.status,
      };

      const skip = (page - 1) * limit;

      const where: any = {};
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (status === 'suspended') {
        where.isSuspended = true;
      } else if (status === 'active') {
        where.isSuspended = false;
      } else if (status === 'admin') {
        where.isServerAdmin = true;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy || 'createdAt']: sortOrder },
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            isServerAdmin: true,
            isSuspended: true,
            suspendedAt: true,
            suspendReason: true,
            lastLoginAt: true,
            loginCount: true,
            createdAt: true,
            _count: {
              select: {
                workspaceMembers: true,
                messages: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      return {
        users: users.map((u) => ({
          ...u,
          workspaceCount: u._count.workspaceMembers,
          messageCount: u._count.messages,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  );

  /**
   * GET /admin/users/:id - Get detailed user information
   */
  fastify.get<{ Params: { id: string } }>('/users/:id', async (request) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        isServerAdmin: true,
        isSuspended: true,
        suspendedAt: true,
        suspendedBy: true,
        suspendReason: true,
        lastLoginAt: true,
        loginCount: true,
        createdAt: true,
        workspaceMembers: {
          include: {
            workspace: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: {
            messages: true,
            uploadedFiles: true,
            createdBots: true,
          },
        },
      },
    });

    if (!user) {
      throw errors.notFound('User');
    }

    return { user };
  });

  /**
   * POST /admin/users/:id/suspend - Suspend a user
   */
  fastify.post<{ Params: { id: string }; Body: z.infer<typeof suspendUserSchema> }>(
    '/users/:id/suspend',
    async (request, reply) => {
      const { id } = request.params;
      const { reason } = suspendUserSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { id } });

      if (!user) {
        throw errors.notFound('User');
      }

      if (user.id === request.user.id) {
        throw errors.forbidden('Cannot suspend yourself');
      }

      if (user.isSuspended) {
        throw errors.validation('User is already suspended');
      }

      await prisma.user.update({
        where: { id },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedBy: request.user.id,
          suspendReason: reason,
        },
      });

      await logAdminAction(
        request.user.id,
        'user.suspend',
        'user',
        id,
        { reason, userEmail: user.email },
        request
      );

      return { success: true, message: 'User suspended' };
    }
  );

  /**
   * POST /admin/users/:id/unsuspend - Unsuspend a user
   */
  fastify.post<{ Params: { id: string } }>('/users/:id/unsuspend', async (request) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw errors.notFound('User');
    }

    if (!user.isSuspended) {
      throw errors.validation('User is not suspended');
    }

    await prisma.user.update({
      where: { id },
      data: {
        isSuspended: false,
        suspendedAt: null,
        suspendedBy: null,
        suspendReason: null,
      },
    });

    await logAdminAction(
      request.user.id,
      'user.unsuspend',
      'user',
      id,
      { userEmail: user.email },
      request
    );

    return { success: true, message: 'User unsuspended' };
  });

  /**
   * POST /admin/users/:id/promote - Promote user to server admin
   */
  fastify.post<{ Params: { id: string } }>('/users/:id/promote', async (request) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw errors.notFound('User');
    }

    if (user.isServerAdmin) {
      throw errors.validation('User is already a server admin');
    }

    if (user.isSuspended) {
      throw errors.validation('Cannot promote a suspended user');
    }

    await prisma.user.update({
      where: { id },
      data: { isServerAdmin: true },
    });

    await logAdminAction(
      request.user.id,
      'user.promote',
      'user',
      id,
      { userEmail: user.email },
      request
    );

    return { success: true, message: 'User promoted to server admin' };
  });

  /**
   * POST /admin/users/:id/demote - Remove server admin from user
   */
  fastify.post<{ Params: { id: string } }>('/users/:id/demote', async (request) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw errors.notFound('User');
    }

    if (user.id === request.user.id) {
      throw errors.forbidden('Cannot demote yourself');
    }

    if (!user.isServerAdmin) {
      throw errors.validation('User is not a server admin');
    }

    // Ensure at least one admin remains
    const adminCount = await prisma.user.count({ where: { isServerAdmin: true } });
    if (adminCount <= 1) {
      throw errors.forbidden('Cannot demote the last server admin');
    }

    await prisma.user.update({
      where: { id },
      data: { isServerAdmin: false },
    });

    await logAdminAction(
      request.user.id,
      'user.demote',
      'user',
      id,
      { userEmail: user.email },
      request
    );

    return { success: true, message: 'User demoted from server admin' };
  });

  /**
   * DELETE /admin/users/:id - Delete a user (permanent)
   */
  fastify.delete<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw errors.notFound('User');
    }

    if (user.id === request.user.id) {
      throw errors.forbidden('Cannot delete yourself');
    }

    if (user.isServerAdmin) {
      throw errors.forbidden('Cannot delete a server admin. Demote first.');
    }

    await prisma.user.delete({ where: { id } });

    await logAdminAction(
      request.user.id,
      'user.delete',
      'user',
      id,
      { userEmail: user.email, displayName: user.displayName },
      request
    );

    reply.status(204);
    return;
  });

  // ============================================
  // Workspace Management
  // ============================================

  /**
   * GET /admin/workspaces - List all workspaces with pagination
   */
  fastify.get<{ Querystring: z.infer<typeof paginationSchema> & { status?: string } }>(
    '/workspaces',
    async (request) => {
      const { page, limit, search, sortBy, sortOrder, status } = {
        ...paginationSchema.parse(request.query),
        status: request.query.status,
      };

      const skip = (page - 1) * limit;

      const where: any = {};
      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }
      if (status === 'disabled') {
        where.isDisabled = true;
      } else if (status === 'active') {
        where.isDisabled = false;
      }

      const [workspaces, total] = await Promise.all([
        prisma.workspace.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy || 'createdAt']: sortOrder },
          select: {
            id: true,
            name: true,
            description: true,
            isPublic: true,
            isDisabled: true,
            disabledAt: true,
            maxMembers: true,
            createdAt: true,
            _count: {
              select: {
                members: true,
                channels: true,
                messages: true,
              },
            },
          },
        }),
        prisma.workspace.count({ where }),
      ]);

      return {
        workspaces: workspaces.map((w) => ({
          ...w,
          memberCount: w._count.members,
          channelCount: w._count.channels,
          messageCount: w._count.messages,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  );

  /**
   * GET /admin/workspaces/:id - Get detailed workspace information
   */
  fastify.get<{ Params: { id: string } }>('/workspaces/:id', async (request) => {
    const { id } = request.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, displayName: true } },
          },
          take: 50,
        },
        _count: {
          select: {
            members: true,
            channels: true,
            messages: true,
            files: true,
            bots: true,
          },
        },
      },
    });

    if (!workspace) {
      throw errors.notFound('Workspace');
    }

    return { workspace };
  });

  /**
   * POST /admin/workspaces/:id/disable - Disable a workspace
   */
  fastify.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/workspaces/:id/disable',
    async (request) => {
      const { id } = request.params;
      const { reason } = request.body || {};

      const workspace = await prisma.workspace.findUnique({ where: { id } });

      if (!workspace) {
        throw errors.notFound('Workspace');
      }

      if (workspace.isDisabled) {
        throw errors.validation('Workspace is already disabled');
      }

      await prisma.workspace.update({
        where: { id },
        data: {
          isDisabled: true,
          disabledAt: new Date(),
          disabledBy: request.user.id,
        },
      });

      await logAdminAction(
        request.user.id,
        'workspace.disable',
        'workspace',
        id,
        { workspaceName: workspace.name, reason },
        request
      );

      return { success: true, message: 'Workspace disabled' };
    }
  );

  /**
   * POST /admin/workspaces/:id/enable - Enable a workspace
   */
  fastify.post<{ Params: { id: string } }>('/workspaces/:id/enable', async (request) => {
    const { id } = request.params;

    const workspace = await prisma.workspace.findUnique({ where: { id } });

    if (!workspace) {
      throw errors.notFound('Workspace');
    }

    if (!workspace.isDisabled) {
      throw errors.validation('Workspace is not disabled');
    }

    await prisma.workspace.update({
      where: { id },
      data: {
        isDisabled: false,
        disabledAt: null,
        disabledBy: null,
      },
    });

    await logAdminAction(
      request.user.id,
      'workspace.enable',
      'workspace',
      id,
      { workspaceName: workspace.name },
      request
    );

    return { success: true, message: 'Workspace enabled' };
  });

  /**
   * DELETE /admin/workspaces/:id - Delete a workspace (permanent)
   */
  fastify.delete<{ Params: { id: string } }>('/workspaces/:id', async (request, reply) => {
    const { id } = request.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });

    if (!workspace) {
      throw errors.notFound('Workspace');
    }

    await prisma.workspace.delete({ where: { id } });

    await logAdminAction(
      request.user.id,
      'workspace.delete',
      'workspace',
      id,
      { workspaceName: workspace.name, memberCount: workspace._count.members },
      request
    );

    reply.status(204);
    return;
  });

  // ============================================
  // Server Settings
  // ============================================

  /**
   * GET /admin/settings - Get server settings
   */
  fastify.get('/settings', async () => {
    const settings = await getServerSettings();
    return { settings };
  });

  /**
   * PATCH /admin/settings - Update server settings
   */
  fastify.patch<{ Body: z.infer<typeof updateServerSettingsSchema> }>(
    '/settings',
    async (request) => {
      const data = updateServerSettingsSchema.parse(request.body);

      const settings = await prisma.serverSettings.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...data },
        update: data,
      });

      await logAdminAction(
        request.user.id,
        'settings.update',
        'settings',
        'default',
        { changes: data },
        request
      );

      return { settings };
    }
  );

  // ============================================
  // System Announcements
  // ============================================

  /**
   * GET /admin/announcements - List all announcements
   */
  fastify.get<{ Querystring: { active?: string } }>('/announcements', async (request) => {
    const { active } = request.query;

    const where: any = {};
    if (active === 'true') {
      where.isActive = true;
    } else if (active === 'false') {
      where.isActive = false;
    }

    const announcements = await prisma.systemAnnouncement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return { announcements };
  });

  /**
   * POST /admin/announcements - Create an announcement
   */
  fastify.post<{ Body: z.infer<typeof createAnnouncementSchema> }>(
    '/announcements',
    async (request, reply) => {
      const data = createAnnouncementSchema.parse(request.body);

      const announcement = await prisma.systemAnnouncement.create({
        data: {
          title: data.title,
          content: data.content,
          type: data.type,
          startsAt: data.startsAt ? new Date(data.startsAt) : new Date(),
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          createdBy: request.user.id,
        },
      });

      await logAdminAction(
        request.user.id,
        'announcement.create',
        'announcement',
        announcement.id,
        { title: data.title, type: data.type },
        request
      );

      reply.status(201);
      return { announcement };
    }
  );

  /**
   * PATCH /admin/announcements/:id - Update an announcement
   */
  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateAnnouncementSchema> }>(
    '/announcements/:id',
    async (request) => {
      const { id } = request.params;
      const data = updateAnnouncementSchema.parse(request.body);

      const existing = await prisma.systemAnnouncement.findUnique({ where: { id } });

      if (!existing) {
        throw errors.notFound('Announcement');
      }

      const announcement = await prisma.systemAnnouncement.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.content !== undefined && { content: data.content }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.startsAt !== undefined && { startsAt: new Date(data.startsAt) }),
          ...(data.endsAt !== undefined && { endsAt: data.endsAt ? new Date(data.endsAt) : null }),
        },
      });

      await logAdminAction(
        request.user.id,
        'announcement.update',
        'announcement',
        id,
        { changes: data },
        request
      );

      return { announcement };
    }
  );

  /**
   * DELETE /admin/announcements/:id - Delete an announcement
   */
  fastify.delete<{ Params: { id: string } }>('/announcements/:id', async (request, reply) => {
    const { id } = request.params;

    const announcement = await prisma.systemAnnouncement.findUnique({ where: { id } });

    if (!announcement) {
      throw errors.notFound('Announcement');
    }

    await prisma.systemAnnouncement.delete({ where: { id } });

    await logAdminAction(
      request.user.id,
      'announcement.delete',
      'announcement',
      id,
      { title: announcement.title },
      request
    );

    reply.status(204);
    return;
  });

  // ============================================
  // Audit Logs
  // ============================================

  /**
   * GET /admin/audit-logs - Get admin audit logs
   */
  fastify.get<{
    Querystring: z.infer<typeof paginationSchema> & {
      action?: string;
      adminId?: string;
      targetType?: string;
    };
  }>('/audit-logs', async (request) => {
    const { page, limit, sortOrder, action, adminId, targetType } = {
      ...paginationSchema.parse(request.query),
      action: request.query.action,
      adminId: request.query.adminId,
      targetType: request.query.targetType,
    };

    const skip = (page - 1) * limit;

    const where: any = {};
    if (action) where.action = action;
    if (adminId) where.adminId = adminId;
    if (targetType) where.targetType = targetType;

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    // Get admin user info
    const adminIds = [...new Set(logs.map((l) => l.adminId))];
    const admins = await prisma.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, email: true, displayName: true },
    });
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    return {
      logs: logs.map((log) => ({
        ...log,
        admin: adminMap.get(log.adminId) || null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // ============================================
  // Public Endpoint (Active Announcements)
  // ============================================
};

/**
 * Public routes for getting active announcements (no auth required)
 */
export const publicAdminRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /announcements/active - Get active announcements for all users
   */
  fastify.get('/active', async () => {
    const now = new Date();

    const announcements = await prisma.systemAnnouncement.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: [{ type: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        startsAt: true,
        endsAt: true,
      },
    });

    return { announcements };
  });

  /**
   * GET /settings/public - Get public server settings
   */
  fastify.get('/public', async () => {
    const settings = await getServerSettings();

    return {
      settings: {
        serverName: settings.serverName,
        serverDescription: settings.serverDescription,
        allowPublicRegistration: settings.allowPublicRegistration,
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
      },
    };
  });
};
