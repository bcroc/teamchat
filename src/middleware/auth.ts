import type { FastifyRequest, FastifyReply } from 'fastify';
import { getTokenFromRequest, verifyToken } from '../lib/auth.js';
import { errors } from '../lib/errors.js';
import { prisma } from '../lib/db.js';
import type { WorkspaceRole } from '@teamchat/shared';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      displayName: string;
      avatarUrl?: string | null;
    };
  }
}

export async function authenticate(
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

  // Attach user to request
  request.user = {
    id: payload.sub,
    email: payload.email,
    displayName: payload.displayName,
    avatarUrl: payload.avatarUrl,
  };
}

// Helper to check workspace membership
export async function requireWorkspaceMember(
  userId: string,
  workspaceId: string
): Promise<{ role: WorkspaceRole }> {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
  });

  if (!member) {
    throw errors.notMember();
  }

  return { role: member.role as WorkspaceRole };
}

// Helper to check workspace role
export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  requiredRoles: WorkspaceRole[]
): Promise<{ role: WorkspaceRole }> {
  const { role } = await requireWorkspaceMember(userId, workspaceId);

  if (!requiredRoles.includes(role)) {
    throw errors.insufficientRole(requiredRoles.join(' or '));
  }

  return { role };
}

// Helper to check channel access
export async function requireChannelAccess(
  userId: string,
  channelId: string
): Promise<{ channel: { id: string; workspaceId: string; isPrivate: boolean } }> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, workspaceId: true, isPrivate: true },
  });

  if (!channel) {
    throw errors.notFound('Channel');
  }

  // Check workspace membership first
  await requireWorkspaceMember(userId, channel.workspaceId);

  // If private, check channel membership
  if (channel.isPrivate) {
    const channelMember = await prisma.channelMember.findUnique({
      where: {
        channelId_userId: { channelId, userId },
      },
    });

    if (!channelMember) {
      throw errors.forbidden('You do not have access to this channel');
    }
  }

  return { channel };
}

// Helper to check DM access
export async function requireDmAccess(
  userId: string,
  dmThreadId: string
): Promise<{ dmThread: { id: string; workspaceId: string; userAId: string; userBId: string } }> {
  const dmThread = await prisma.dmThread.findUnique({
    where: { id: dmThreadId },
    select: { id: true, workspaceId: true, userAId: true, userBId: true },
  });

  if (!dmThread) {
    throw errors.notFound('DM thread');
  }

  // User must be one of the participants
  if (dmThread.userAId !== userId && dmThread.userBId !== userId) {
    throw errors.forbidden('You do not have access to this DM');
  }

  return { dmThread };
}
