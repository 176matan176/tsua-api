import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const alerts = await prisma.alert.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: {
      stock: { select: { ticker: true, nameEn: true, nameHe: true } },
    },
  });
  res.json(alerts);
});

const CreateAlertSchema = z.object({
  ticker: z.string().min(1).max(20),
  alertType: z.enum(['price_above', 'price_below', 'volume_spike', 'news']),
  threshold: z.number().positive().optional(),
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { ticker, alertType, threshold } = parsed.data;

  let stock = await prisma.stock.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!stock) {
    return res.status(404).json({ error: 'Stock not found. Please add it first.' });
  }

  const alert = await prisma.alert.create({
    data: {
      userId: req.userId!,
      stockId: stock.id,
      alertType,
      threshold,
    },
    include: { stock: { select: { ticker: true, nameEn: true, nameHe: true } } },
  });

  res.status(201).json(alert);
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;

  const alert = await prisma.alert.findFirst({
    where: { id, userId: req.userId },
  });

  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  await prisma.alert.delete({ where: { id } });
  res.json({ success: true });
});

export default router;
