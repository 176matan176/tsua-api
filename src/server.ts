import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { connectRedis, isRedisAvailable } from './lib/redis';
import { initSocket } from './socket';

import authRouter from './routes/auth';
import postsRouter from './routes/posts';
import stocksRouter from './routes/stocks';
import alertsRouter from './routes/alerts';
import roomsRouter from './routes/rooms';
import newsRouter from './routes/news';
import usersRouter from './routes/users';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3000',
  'https://tsua-rho.vercel.app',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: ${origin} not allowed`));
    }
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/posts', postsRouter);
app.use('/api/v1/stocks', stocksRouter);
app.use('/api/v1/alerts', alertsRouter);
app.use('/api/v1/rooms', roomsRouter);
app.use('/api/v1/news', newsRouter);
app.use('/api/v1/users', usersRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = parseInt(process.env.PORT ?? '3001');

async function main() {
  // Connect Redis
  await connectRedis();

  // Init Socket.io
  initSocket(httpServer);

  // Start price poller only when Redis is available
  if (isRedisAvailable() && process.env.NODE_ENV !== 'test') {
    const { startPricePoller } = await import('./jobs/pricePoller');
    startPricePoller();
  }

  httpServer.listen(PORT, () => {
    console.log(`\n🚀 Tsua API running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket ready`);
    console.log(`🇮🇱 Shuk closed? TASE polling paused automatically\n`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
