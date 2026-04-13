"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const cashtag_1 = require("../services/cashtag");
const router = (0, express_1.Router)();
router.get('/', auth_1.optionalAuth, async (req, res) => {
    const { ticker, page = '1', limit = '20', lang } = req.query;
    const take = Math.min(parseInt(limit), 50);
    const skip = (parseInt(page) - 1) * take;
    const where = { isDeleted: false };
    if (ticker) {
        const stock = await prisma_1.prisma.stock.findUnique({ where: { ticker: ticker.toUpperCase() } });
        if (stock) {
            where.stockMentions = { some: { stockId: stock.id } };
        }
    }
    if (lang && (lang === 'he' || lang === 'en')) {
        where.lang = lang;
    }
    const posts = await prisma_1.prisma.post.findMany({
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
const CreatePostSchema = zod_1.z.object({
    body: zod_1.z.string().min(1).max(280),
    lang: zod_1.z.enum(['he', 'en']),
    sentiment: zod_1.z.enum(['bullish', 'bearish', 'neutral']).optional(),
    imageUrls: zod_1.z.array(zod_1.z.string().url()).max(4).optional(),
});
router.post('/', auth_1.requireAuth, async (req, res) => {
    const parsed = CreatePostSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { body, lang, sentiment, imageUrls = [] } = parsed.data;
    const tickers = (0, cashtag_1.extractCashtags)(body);
    const stocks = await (0, cashtag_1.resolveStockMentions)(tickers);
    const post = await prisma_1.prisma.post.create({
        data: {
            authorId: req.userId,
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
router.post('/:id/like', auth_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;
    const existing = await prisma_1.prisma.postLike.findUnique({
        where: { userId_postId: { userId, postId: id } },
    });
    if (existing) {
        await prisma_1.prisma.postLike.delete({ where: { userId_postId: { userId, postId: id } } });
        await prisma_1.prisma.post.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
        return res.json({ liked: false });
    }
    await prisma_1.prisma.postLike.create({ data: { userId, postId: id } });
    await prisma_1.prisma.post.update({ where: { id }, data: { likeCount: { increment: 1 } } });
    res.json({ liked: true });
});
exports.default = router;
