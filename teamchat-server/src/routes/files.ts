import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/db.js';
import { errors } from '../lib/errors.js';
import { authenticate, requireWorkspaceMember } from '../middleware/auth.js';
import { fileStorage } from '../lib/file-storage.js';
import { config } from '../lib/config.js';

// Security: Allowed MIME types for file uploads
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documents
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain', 'text/csv', 'text/markdown', 'application/json',
  // Archives
  'application/zip', 'application/x-tar', 'application/gzip',
  // Audio/Video
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm',
]);

// Security: Dangerous MIME types that should never be allowed
const BLOCKED_MIME_TYPES = new Set([
  'application/x-msdownload', 'application/x-executable',
  'application/x-shockwave-flash', 'text/html', 'application/xhtml+xml',
  'application/javascript', 'text/javascript',
]);

/**
 * Sanitize filename to prevent header injection and path traversal
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\\\/:\*\?"<>\|]/g, '_') // Remove dangerous chars
    .replace(/\.\./g, '_') // Prevent path traversal
    .replace(/[\r\n]/g, '') // Remove newlines (header injection)
    .slice(0, 255); // Limit length
}

export const fileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // POST /files - Upload file
  fastify.post('/', async (request, reply) => {
    const data = await request.file();

    if (!data) {
      throw errors.validation('No file uploaded');
    }

    // Get workspaceId from field
    const workspaceIdField = data.fields.workspaceId;
    const workspaceId =
      workspaceIdField && 'value' in workspaceIdField ? workspaceIdField.value : null;

    if (!workspaceId || typeof workspaceId !== 'string') {
      throw errors.validation('workspaceId is required');
    }

    await requireWorkspaceMember(request.user.id, workspaceId);

    // Security: Validate MIME type
    if (BLOCKED_MIME_TYPES.has(data.mimetype)) {
      throw errors.validation('This file type is not allowed for security reasons');
    }

    // Check file size
    const buffer = await data.toBuffer();
    if (buffer.length > config.upload.maxFileSize) {
      throw errors.validation(
        `File too large. Maximum size is ${config.upload.maxFileSize / 1024 / 1024}MB`
      );
    }

    // Security: Sanitize filename
    const sanitizedFilename = sanitizeFilename(data.filename);

    // Save file
    const { storagePath, size } = await fileStorage.save(
      workspaceId,
      sanitizedFilename,
      buffer,
      data.mimetype
    );

    // Create database record
    const file = await prisma.file.create({
      data: {
        workspaceId,
        uploaderId: request.user.id,
        originalName: data.filename,
        mimeType: data.mimetype,
        size,
        storagePath,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });

    return reply.status(201).send({ file });
  });

  // GET /files/:id - Get file info
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { id } = request.params;

    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        uploader: {
          select: { id: true, displayName: true },
        },
      },
    });

    if (!file) {
      throw errors.notFound('File');
    }

    await requireWorkspaceMember(request.user.id, file.workspaceId);

    return { file };
  });

  // GET /files/:id/download - Download file
  fastify.get<{ Params: { id: string } }>('/:id/download', async (request, reply) => {
    const { id } = request.params;

    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        originalName: true,
        mimeType: true,
        storagePath: true,
      },
    });

    if (!file) {
      throw errors.notFound('File');
    }

    await requireWorkspaceMember(request.user.id, file.workspaceId);

    // Check if file exists
    const exists = await fileStorage.exists(file.storagePath);
    if (!exists) {
      throw errors.notFound('File data');
    }

    const stream = fileStorage.getStream(file.storagePath);

    // Security: Sanitize filename in Content-Disposition header
    const safeFilename = sanitizeFilename(file.originalName);

    return reply
      .header('Content-Type', file.mimeType)
      .header('Content-Disposition', `attachment; filename="${safeFilename}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(stream);
  });

  // DELETE /files/:id - Delete file
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        uploaderId: true,
        storagePath: true,
      },
    });

    if (!file) {
      throw errors.notFound('File');
    }

    // Only uploader or admin can delete
    const canDelete = file.uploaderId === request.user.id;

    if (!canDelete) {
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: file.workspaceId, userId: request.user.id },
        },
      });

      if (!member || !['owner', 'admin'].includes(member.role)) {
        throw errors.forbidden('Cannot delete this file');
      }
    }

    // Delete from storage
    await fileStorage.delete(file.storagePath);

    // Delete from database
    await prisma.file.delete({ where: { id } });

    return reply.status(204).send();
  });
};
