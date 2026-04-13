import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/:username', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { username: req.params.username },
    select: {
      id: true, username: true, displayName: true, avatarUrl: true,
      bio: true, isVerified: true, followerCount: true, followingCount: true,
      preferredLang: true, createdAt: true,
      _count: { select: { posts: true } },
    },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ...user, postCount: user._count.posts });
});

router.post('/:username/follow', requireAuth, async (req: AuthRequest, res) => {
  const target = await prisma.user.findUnique({ where: { username: req.params.username } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.userId) return res.status(400).json({ error: 'Cannot follow yourself' });

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: req.userId!, followingId: target.id } },
  });

  if (existing) {
    await prisma.follow.delete({
      where: { followerId_followingId: { followerId: req.userId!, followingId: target.id } },
    });
    await prisma.user.update({ where: { id: target.id }, data: { followerCount: { decrement: 1 } } });
    await prisma.user.update({ where: { id: req.userId }, data: { followingCount: { decrement: 1 } } });
    return res.json({ following: false });
  }

  await prisma.follow.create({ data: { followerId: req.userId!, followingId: target.id } });
  await prisma.user.update({ where: { id: target.id }, data: { followerCount: { increment: 1 } } });
  await prisma.user.update({ where: { id: req.userId }, data: { followingCount: { increment: 1 } } });
  res.json({ following: true });
});

export default router;
