import type { Server } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }

  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      displayName: string;
      avatarUrl?: string | null;
    };
    bot?: {
      id: string;
      workspaceId: string;
      name: string;
      displayName: string;
      scopes: string[];
    };
  }
}
