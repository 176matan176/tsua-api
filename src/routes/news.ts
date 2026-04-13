import { Router } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma';

const router = Router();

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? '';

interface FinnhubNewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  datetime: number; // unix timestamp
  category: string;
  related: string;
}

router.get('/', async (req, res) => {
  const { lang, ticker, page = '1' } = req.query as Record<string, string>;
  const take = 20;
  const skip = (parseInt(page) - 1) * take;

  const where: any = {};
  if (lang && (lang === 'he' || lang === 'en')) where.lang = lang;

  if (ticker) {
    const stock = await prisma.stock.findUnique({ where: { ticker: ticker.toUpperCase() } });
    if (stock) where.stockTags = { some: { stockId: stock.id } };
  }

  const articles = await prisma.newsArticle.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take,
    skip,
    include: { stockTags: { include: { stock: { select: { ticker: true, nameEn: true, nameHe: true } } } } },
  });

  // Finnhub fallback: if no articles in DB on first page, fetch from Finnhub
  if (articles.length === 0 && parseInt(page) === 1 && FINNHUB_KEY) {
    try {
      const { data } = await axios.get<FinnhubNewsItem[]>(
        'https://finnhub.io/api/v1/news',
        { params: { category: 'general', token: FINNHUB_KEY }, timeout: 8000 }
      );

      const fallback = (data ?? []).slice(0, take).map((item) => ({
        id: String(item.id),
        source: item.source ?? 'Finnhub',
        titleHe: null,
        titleEn: item.headline ?? null,
        summaryHe: null,
        summaryEn: item.summary ? item.summary.slice(0, 300) : null,
        url: item.url,
        imageUrl: item.image || null,
        publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : null,
        lang: 'en',
        stockTags: [],
      }));

      return res.json({ articles: fallback, page: 1, hasMore: false, source: 'finnhub' });
    } catch (err) {
      console.error('[News] Finnhub fallback failed:', (err as Error).message);
    }
  }

  res.json({ articles, page: parseInt(page), hasMore: articles.length === take });
});

export default router;
