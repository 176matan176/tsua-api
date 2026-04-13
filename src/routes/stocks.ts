import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/redis';
import { fetchQuote, fetchHistory, searchStocks } from '../services/yahoo';
import type { StockQuote } from '../services/yahoo';
import { fetchTaseQuote } from '../services/tase';

const router = Router();

// ── Batch quotes (must be before /:ticker) ───────────────────────────
router.get('/batch', async (req, res) => {
  const { symbols } = req.query as { symbols?: string };
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' });

  const tickers = symbols
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (tickers.length === 0) return res.status(400).json({ error: 'No valid symbols provided' });

  const results: Record<string, { price: number; change: number; changePercent: number; volume?: number; name?: string }> = {};

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      const cacheKey = `price:${ticker}`;
      let quote = await cacheGet<Partial<StockQuote>>(cacheKey);

      if (!quote) {
        quote = ticker.endsWith('.TA')
          ? (await fetchTaseQuote(ticker)) ?? (await fetchQuote(ticker))
          : await fetchQuote(ticker);

        if (quote) await cacheSet(cacheKey, quote, 30);
      }

      if (quote && quote.price != null) {
        results[ticker] = {
          price: quote.price,
          change: quote.change ?? 0,
          changePercent: quote.changePercent ?? 0,
          volume: quote.volume,
          name: (quote as any).nameEn ?? (quote as any).name ?? undefined,
        };
      }
    })
  );

  res.json(results);
});

router.get('/search', async (req, res) => {
  const { q } = req.query as { q: string };
  if (!q || q.length < 1) return res.json([]);

  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  // Search DB first
  const dbResults = await prisma.stock.findMany({
    where: {
      isActive: true,
      OR: [
        { ticker: { contains: q.toUpperCase() } },
        { nameEn: { contains: q, mode: 'insensitive' } as any },
        { nameHe: { contains: q } },
      ],
    },
    take: 10,
    select: { ticker: true, nameEn: true, nameHe: true, exchange: true, currency: true },
  });

  // Supplement with Yahoo Finance if needed
  const results = dbResults.length >= 5 ? dbResults : await searchStocks(q);

  await cacheSet(cacheKey, results, 300);
  res.json(results);
});

router.get('/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const cacheKey = `price:${ticker}`;

  let quote = await cacheGet<Partial<StockQuote>>(cacheKey);
  if (!quote) {
    quote = await fetchQuote(ticker);
    if (quote) await cacheSet(cacheKey, quote, 30);
  }

  if (!quote) {
    return res.status(404).json({ error: 'Stock not found' });
  }

  res.json(quote);
});

router.get('/:ticker/history', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const { range = '1M' } = req.query as { range?: string };

  const period1Map: Record<string, string> = {
    '1D': new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().split('T')[0],
    '1W': new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
    '1M': new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
    '3M': new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().split('T')[0],
    '1Y': new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
  };

  const intervalMap: Record<string, '1d' | '1wk' | '1mo'> = {
    '1D': '1d', '1W': '1d', '1M': '1d', '3M': '1d', '1Y': '1wk',
  };

  const period1 = period1Map[range] ?? period1Map['1M'];
  const interval = intervalMap[range] ?? '1d';

  const cacheKey = `history:${ticker}:${range}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const bars = await fetchHistory(ticker, period1, interval);
  await cacheSet(cacheKey, bars, range === '1D' ? 60 : 3600);
  res.json(bars);
});

export default router;
