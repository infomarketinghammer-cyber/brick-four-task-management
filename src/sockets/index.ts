/**
 * Socket.IO Handler Module
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';

let ioServer: SocketIOServer | null = null;

export function initializeSockets(httpServer: HttpServer): SocketIOServer {
  ioServer = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  ioServer.on('connection', (socket) => {
    // Resolve the user from the access token sent in the handshake; private user rooms
    // (messages, notifications) are only joined for a verified identity.
    let userId: string | null = null;
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token === 'string' && token) {
        userId = verifyAccessToken(token).userId;
        socket.join(`user:${userId}`);
      }
    } catch {
      userId = null;
    }

    socket.on('join_room', (room: string) => {
      if (typeof room !== 'string') return;
      if (room.startsWith('user:') && room !== `user:${userId}`) return;
      socket.join(room);
    });

    socket.on('leave_room', (room: string) => {
      socket.leave(room);
    });
  });

  return ioServer;
}

export function getIO(): SocketIOServer | null {
  return ioServer;
}
