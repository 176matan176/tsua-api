"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const redis_1 = require("../lib/redis");
function initSocket(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
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
                const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET ?? 'dev-secret');
                socket.userId = payload.sub;
            }
            catch { /* anonymous ok */ }
        }
        next();
    });
    // Subscribe to Redis pub/sub for price broadcasts
    redis_1.redisSub.subscribe('prices', (message) => {
        try {
            const { ticker, quote } = JSON.parse(message);
            io.to(`ticker:${ticker}`).emit(`price:${ticker}`, quote);
        }
        catch { /* skip */ }
    });
    io.on('connection', (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);
        // Price subscriptions
        socket.on('subscribe:price', ({ ticker }) => {
            socket.join(`ticker:${ticker}`);
        });
        socket.on('unsubscribe:price', ({ ticker }) => {
            socket.leave(`ticker:${ticker}`);
        });
        // Trading room events
        socket.on('room:join', ({ slug }) => {
            socket.join(`room:${slug}`);
            socket.to(`room:${slug}`).emit('room:user_joined', { socketId: socket.id });
        });
        socket.on('room:leave', ({ slug }) => {
            socket.leave(`room:${slug}`);
        });
        socket.on('room:message', (data) => {
            const userId = socket.userId;
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
