import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, optionalAuth, type AuthRequest } from '../middleware/auth';
import { extractCashtags, resolveStockMentions } from '../services/cashtag';

const router = Router();

router.get('/', optionalAuth, async (req: AuthRequest, res) => {
  const { ticker, page = '1', limit = '20', lang } = req.query as Record<string, string>;
  const take = Math.min(parseInt(limit), 50);
  const skip = (parseInt(page) - 1) * take;

  const where: any = { isDeleted: false };

  if (ticker) {
    const stock = await prisma.stock.findUnique({ where: { ticker: ticker.toUpperCase() } });
    if (stock) {
      where.stockMentions = { some: { stockId: stock.id } };
    }
  }

  if (lang && (lang === 'he' || lang === 'en')) {
    where.lang = lang;
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip,
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      stockMentions: { include: { stock: { select: { ticker: true, nameEn: true, nameHe: true, exchange: true } } } },
      likes: req.userId ? { where: { userId: req.userId } } : false,
    },
  });

  const formatted = posts.map((p) => ({
    ...p,
    isLiked: req.userId ? p.likes?.length > 0 : false,
    stockMentions: p.stockMentions.map((m) => ({
      ticker: m.stock.ticker,
      nameEn: m.stock.nameEn,
      nameHe: m.stock.nameHe,
      exchange: m.stock.exchange,
    })),
    likes: undefined,
  }));

  res.json({ posts: formatted, page: parseInt(page), hasMore: posts.length === take });
});

const CreatePostSchema = z.object({
  body: z.string().min(1).max(280),
  lang: z.enum(['he', 'en']),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  imageUrls: z.array(z.string().url()).max(4).optional(),
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreatePostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { body, lang, sentiment, imageUrls = [] } = parsed.data;
  const tickers = extractCashtags(body);
  const stocks = await resolveStockMentions(tickers);

  const post = await prisma.post.create({
    data: {
      authorId: req.userId!,
      body,
      lang,
      sentiment,
      // @ts-ignore – Prisma array field; correct with PostgreSQL provider
      imageUrls,
      stockMentions: {
        create: stocks.map((s) => ({ stockId: s.id })),
      },
    },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      stockMentions: { include: { stock: { select: { ticker: true, nameEn: true, nameHe: true, exchange: true } } } },
    },
  });

  res.status(201).json(post);
});

router.post('/:id/like', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.userId!;

  const existing = await prisma.postLike.findUnique({
    where: { userId_postId: { userId, postId: id } },
  });

  if (existing) {
    await prisma.postLike.delete({ where: { userId_postId: { userId, postId: id } } });
    await prisma.post.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
    return res.json({ liked: false });
  }

  await prisma.postLike.create({ data: { userId, postId: id } });
  await prisma.post.update({ where: { id }, data: { likeCount: { increment: 1 } } });
  res.json({ liked: true });
});

export default router;
