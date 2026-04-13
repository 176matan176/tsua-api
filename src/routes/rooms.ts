import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', async (_req, res) => {
  const rooms = await prisma.room.findMany({
    orderBy: [{ isOfficial: 'desc' }, { memberCount: 'desc' }],
    include: { stock: { select: { ticker: true, nameEn: true, nameHe: true } } },
  });
  res.json(rooms);
});

router.get('/:slug', async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { slug: req.params.slug },
    include: { stock: { select: { ticker: true, nameEn: true, nameHe: true } } },
  });
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

router.get('/:slug/messages', async (req, res) => {
  const room = await prisma.room.findUnique({ where: { slug: req.params.slug } });
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const messages = await prisma.roomMessage.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
    },
  });

  res.json(messages.reverse());
});

export default router;
