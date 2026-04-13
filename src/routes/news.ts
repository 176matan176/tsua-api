import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

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

  res.json({ articles, page: parseInt(page), hasMore: articles.length === take });
});

export default router;
