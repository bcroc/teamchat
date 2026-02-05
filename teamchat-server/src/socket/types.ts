import type { Server, Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  userId: string;
  displayName: string;
}

export interface SocketContext {
  io: Server;
  socket: AuthenticatedSocket;
  userId: string;
  displayName: string;
}
