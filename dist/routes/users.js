"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/:username', async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { username: req.params.username },
        select: {
            id: true, username: true, displayName: true, avatarUrl: true,
            bio: true, isVerified: true, followerCount: true, followingCount: true,
            preferredLang: true, createdAt: true,
            _count: { select: { posts: true } },
        },
    });
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    res.json({ ...user, postCount: user._count.posts });
});
router.post('/:username/follow', auth_1.requireAuth, async (req, res) => {
    const target = await prisma_1.prisma.user.findUnique({ where: { username: req.params.username } });
    if (!target)
        return res.status(404).json({ error: 'User not found' });
    if (target.id === req.userId)
        return res.status(400).json({ error: 'Cannot follow yourself' });
    const existing = await prisma_1.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: req.userId, followingId: target.id } },
    });
    if (existing) {
        await prisma_1.prisma.follow.delete({
            where: { followerId_followingId: { followerId: req.userId, followingId: target.id } },
        });
        await prisma_1.prisma.user.update({ where: { id: target.id }, data: { followerCount: { decrement: 1 } } });
        await prisma_1.prisma.user.update({ where: { id: req.userId }, data: { followingCount: { decrement: 1 } } });
        return res.json({ following: false });
    }
    await prisma_1.prisma.follow.create({ data: { followerId: req.userId, followingId: target.id } });
    await prisma_1.prisma.user.update({ where: { id: target.id }, data: { followerCount: { increment: 1 } } });
    await prisma_1.prisma.user.update({ where: { id: req.userId }, data: { followingCount: { increment: 1 } } });
    res.json({ following: true });
});
exports.default = router;
