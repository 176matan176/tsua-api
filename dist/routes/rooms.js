"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    const rooms = await prisma_1.prisma.room.findMany({
        orderBy: [{ isOfficial: 'desc' }, { memberCount: 'desc' }],
        include: { stock: { select: { ticker: true, nameEn: true, nameHe: true } } },
    });
    res.json(rooms);
});
router.get('/:slug', async (req, res) => {
    const room = await prisma_1.prisma.room.findUnique({
        where: { slug: req.params.slug },
        include: { stock: { select: { ticker: true, nameEn: true, nameHe: true } } },
    });
    if (!room)
        return res.status(404).json({ error: 'Room not found' });
    res.json(room);
});
router.get('/:slug/messages', async (req, res) => {
    const room = await prisma_1.prisma.room.findUnique({ where: { slug: req.params.slug } });
    if (!room)
        return res.status(404).json({ error: 'Room not found' });
    const messages = await prisma_1.prisma.roomMessage.findMany({
        where: { roomId: room.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
            author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        },
    });
    res.json(messages.reverse());
});
exports.default = router;
