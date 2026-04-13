"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    const { lang, ticker, page = '1' } = req.query;
    const take = 20;
    const skip = (parseInt(page) - 1) * take;
    const where = {};
    if (lang && (lang === 'he' || lang === 'en'))
        where.lang = lang;
    if (ticker) {
        const stock = await prisma_1.prisma.stock.findUnique({ where: { ticker: ticker.toUpperCase() } });
        if (stock)
            where.stockTags = { some: { stockId: stock.id } };
    }
    const articles = await prisma_1.prisma.newsArticle.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take,
        skip,
        include: { stockTags: { include: { stock: { select: { ticker: true, nameEn: true, nameHe: true } } } } },
    });
    res.json({ articles, page: parseInt(page), hasMore: articles.length === take });
});
exports.default = router;
