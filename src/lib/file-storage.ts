import { mkdir, writeFile, unlink, stat } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import { config } from './config.js';

// File storage abstraction - currently local disk, S3-ready interface
export interface FileStorage {
  save(
    workspaceId: string,
    filename: string,
    data: Buffer | Readable,
    mimeType: string
  ): Promise<{ storagePath: string; size: number }>;

  getPath(storagePath: string): string;

  getStream(storagePath: string): Readable;

  delete(storagePath: string): Promise<void>;

  exists(storagePath: string): Promise<boolean>;
}

class LocalFileStorage implements FileStorage {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async save(
    workspaceId: string,
    filename: string,
    data: Buffer | Readable,
    _mimeType: string
  ): Promise<{ storagePath: string; size: number }> {
    const ext = extname(filename);
    const uniqueName = `${randomUUID()}${ext}`;
    const dirPath = join(this.baseDir, workspaceId);
    const filePath = join(dirPath, uniqueName);

    // Ensure directory exists
    await mkdir(dirPath, { recursive: true });

    // Convert stream to buffer if needed
    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      buffer = Buffer.concat(chunks);
    }

    await writeFile(filePath, buffer);

    // Storage path is relative to base dir
    const storagePath = `${workspaceId}/${uniqueName}`;

    return {
      storagePath,
      size: buffer.length,
    };
  }

  getPath(storagePath: string): string {
    return join(this.baseDir, storagePath);
  }

  getStream(storagePath: string): Readable {
    const fullPath = this.getPath(storagePath);
    return createReadStream(fullPath);
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = this.getPath(storagePath);
    try {
      await unlink(fullPath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    const fullPath = this.getPath(storagePath);
    try {
      await stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

// Initialize storage - can be swapped for S3 implementation later
export const fileStorage: FileStorage = new LocalFileStorage(config.upload.dir);

// Ensure upload directory exists
export async function initFileStorage(): Promise<void> {
  if (!existsSync(config.upload.dir)) {
    await mkdir(config.upload.dir, { recursive: true });
  }
  console.log('File storage initialized at:', config.upload.dir);
}
