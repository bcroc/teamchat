/**
 * Admin Authentication Middleware
 *
 * Provides middleware for server admin routes:
 * - Validates user is a server admin
 * - Logs admin actions for audit trail
 * - Checks for suspended accounts
 *
 * @module apps/api/src/middleware/adminAuth
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getTokenFromRequest, verifyToken } from '../lib/auth.js';
import { errors } from '../lib/errors.js';
import { prisma } from '../lib/db.js';

/**
 * Middleware to authenticate and authorize server admins only
 */
export async function requireServerAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = getTokenFromRequest(request);

  if (!token) {
    throw errors.unauthorized('No authentication token provided');
  }

  const payload = await verifyToken(token);

  if (!payload) {
    throw errors.unauthorized('Invalid or expired token');
  }

  // Fetch full user to check admin status
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      isServerAdmin: true,
      isSuspended: true,
    },
  });

  if (!user) {
    throw errors.unauthorized('User not found');
  }

  if (user.isSuspended) {
    throw errors.forbidden('Your account has been suspended');
  }

  if (!user.isServerAdmin) {
    throw errors.forbidden('Server admin access required');
  }

  // Attach user to request
  request.user = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Log an admin action to the audit log
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown>,
  request: FastifyRequest
): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      details,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] || null,
    },
  });
}

/**
 * Get or create default server settings
 */
export async function getServerSettings() {
  let settings = await prisma.serverSettings.findUnique({
    where: { id: 'default' },
  });

  if (!settings) {
    settings = await prisma.serverSettings.create({
      data: { id: 'default' },
    });
  }

  return settings;
}
