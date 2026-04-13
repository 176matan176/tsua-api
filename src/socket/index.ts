import type { Server as HTTPServer } from 'http';
import { Server as IOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { redisSub } from '../lib/redis';

export function initSocket(httpServer: HTTPServer) {
  const io = new IOServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Optional JWT auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret') as { sub: string };
        (socket as any).userId = payload.sub;
      } catch { /* anonymous ok */ }
    }
    next();
  });

  // Subscribe to Redis pub/sub for price broadcasts
  redisSub.subscribe('prices', (message: string) => {
    try {
      const { ticker, quote } = JSON.parse(message);
      io.to(`ticker:${ticker}`).emit(`price:${ticker}`, quote);
    } catch { /* skip */ }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Price subscriptions
    socket.on('subscribe:price', ({ ticker }: { ticker: string }) => {
      socket.join(`ticker:${ticker}`);
    });
    socket.on('unsubscribe:price', ({ ticker }: { ticker: string }) => {
      socket.leave(`ticker:${ticker}`);
    });

    // Trading room events
    socket.on('room:join', ({ slug }: { slug: string }) => {
      socket.join(`room:${slug}`);
      socket.to(`room:${slug}`).emit('room:user_joined', { socketId: socket.id });
    });
    socket.on('room:leave', ({ slug }: { slug: string }) => {
      socket.leave(`room:${slug}`);
    });
    socket.on('room:message', (data: { slug: string; body: string; lang: 'he' | 'en' }) => {
      const userId = (socket as any).userId;
      const msg = {
        id: Date.now().toString(),
        body: data.body,
        lang: data.lang,
        userId,
        socketId: socket.id,
        createdAt: new Date().toISOString(),
      };
      io.to(`room:${data.slug}`).emit('room:message', msg);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}
