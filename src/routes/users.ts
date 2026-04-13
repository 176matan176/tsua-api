import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();

// GET /leaderboard?period=7d|30d|all&category=all|tase|us
router.get('/leaderboard', async (req, res) => {
  try {
    const { period = '30d' } = req.query as { period?: string; category?: string };

    const since =
      period === '7d'
        ? new Date(Date.now() - 7 * 24 * 3600 * 1000)
        : period === '30d'
        ? new Date(Date.now() - 30 * 24 * 3600 * 1000)
        : new Date('2020-01-01');

    // Fetch users with their posts and likes in the given period
    const users = await prisma.user.findMany({
      take: 50,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        followerCount: true,
        posts: {
          where: { createdAt: { gte: since }, parentId: null, isDeleted: false },
          select: {
            id: true,
            sentiment: true,
            likeCount: true,
          },
        },
      },
    });

    // Build ranked list — score based on activity (no portfolio model yet)
    const ranked = users
      .map(u => {
        const postCount = u.posts.length;
        const totalLikes = u.posts.reduce((sum, p) => sum + p.likeCount, 0);
        const bullishCount = u.posts.filter(p => p.sentiment === 'bullish').length;
        const bearishCount = u.posts.filter(p => p.sentiment === 'bearish').length;

        // Assign badge based on post activity
        let badge: 'legend' | 'expert' | 'rising' | 'rookie' | null = null;
        if (postCount >= 50 || totalLikes >= 200) badge = 'legend';
        else if (postCount >= 20 || totalLikes >= 50) badge = 'expert';
        else if (postCount >= 5) badge = 'rising';
        else if (postCount > 0) badge = 'rookie';

        const score = postCount * 2 + totalLikes * 0.5 + u.followerCount * 0.3;

        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName ?? u.username,
          avatarUrl: u.avatarUrl,
          isVerified: u.isVerified,
          followersCount: u.followerCount,
          postCount,
          totalLikes,
          bullishCount,
          bearishCount,
          badge,
          score: Math.round(score * 100) / 100,
          // accuracy: sentiment engagement proxy (bullish+bearish out of all posts)
          accuracy: postCount > 0 ? Math.round(((bullishCount + bearishCount) / postCount) * 100) : 0,
        };
      })
      .filter(u => u.postCount > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((u, i) => ({ ...u, rank: i + 1 }));

    res.json(ranked);
  } catch (err) {
    console.error('[leaderboard] error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

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
