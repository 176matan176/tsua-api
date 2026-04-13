"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/', auth_1.requireAuth, async (req, res) => {
    const alerts = await prisma_1.prisma.alert.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        include: {
            stock: { select: { ticker: true, nameEn: true, nameHe: true } },
        },
    });
    res.json(alerts);
});
const CreateAlertSchema = zod_1.z.object({
    ticker: zod_1.z.string().min(1).max(20),
    alertType: zod_1.z.enum(['price_above', 'price_below', 'volume_spike', 'news']),
    threshold: zod_1.z.number().positive().optional(),
});
router.post('/', auth_1.requireAuth, async (req, res) => {
    const parsed = CreateAlertSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { ticker, alertType, threshold } = parsed.data;
    let stock = await prisma_1.prisma.stock.findUnique({ where: { ticker: ticker.toUpperCase() } });
    if (!stock) {
        return res.status(404).json({ error: 'Stock not found. Please add it first.' });
    }
    const alert = await prisma_1.prisma.alert.create({
        data: {
            userId: req.userId,
            stockId: stock.id,
            alertType,
            threshold,
        },
        include: { stock: { select: { ticker: true, nameEn: true, nameHe: true } } },
    });
    res.status(201).json(alert);
});
router.delete('/:id', auth_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const alert = await prisma_1.prisma.alert.findFirst({
        where: { id, userId: req.userId },
    });
    if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
    }
    await prisma_1.prisma.alert.delete({ where: { id } });
    res.json({ success: true });
});
exports.default = router;
