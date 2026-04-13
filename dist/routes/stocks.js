"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const redis_1 = require("../lib/redis");
const yahoo_1 = require("../services/yahoo");
const router = (0, express_1.Router)();
router.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 1)
        return res.json([]);
    const cacheKey = `search:${q.toLowerCase()}`;
    const cached = await (0, redis_1.cacheGet)(cacheKey);
    if (cached)
        return res.json(cached);
    // Search DB first
    const dbResults = await prisma_1.prisma.stock.findMany({
        where: {
            isActive: true,
            OR: [
                { ticker: { contains: q.toUpperCase() } },
                { nameEn: { contains: q, mode: 'insensitive' } },
                { nameHe: { contains: q } },
            ],
        },
        take: 10,
        select: { ticker: true, nameEn: true, nameHe: true, exchange: true, currency: true },
    });
    // Supplement with Yahoo Finance if needed
    const results = dbResults.length >= 5 ? dbResults : await (0, yahoo_1.searchStocks)(q);
    await (0, redis_1.cacheSet)(cacheKey, results, 300);
    res.json(results);
});
router.get('/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const cacheKey = `price:${ticker}`;
    let quote = await (0, redis_1.cacheGet)(cacheKey);
    if (!quote) {
        quote = await (0, yahoo_1.fetchQuote)(ticker);
        if (quote)
            await (0, redis_1.cacheSet)(cacheKey, quote, 30);
    }
    if (!quote) {
        return res.status(404).json({ error: 'Stock not found' });
    }
    res.json(quote);
});
router.get('/:ticker/history', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const { range = '1M' } = req.query;
    const period1Map = {
        '1D': new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().split('T')[0],
        '1W': new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
        '1M': new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
        '3M': new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().split('T')[0],
        '1Y': new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
    };
    const intervalMap = {
        '1D': '1d', '1W': '1d', '1M': '1d', '3M': '1d', '1Y': '1wk',
    };
    const period1 = period1Map[range] ?? period1Map['1M'];
    const interval = intervalMap[range] ?? '1d';
    const cacheKey = `history:${ticker}:${range}`;
    const cached = await (0, redis_1.cacheGet)(cacheKey);
    if (cached)
        return res.json(cached);
    const bars = await (0, yahoo_1.fetchHistory)(ticker, period1, interval);
    await (0, redis_1.cacheSet)(cacheKey, bars, range === '1D' ? 60 : 3600);
    res.json(bars);
});
exports.default = router;
