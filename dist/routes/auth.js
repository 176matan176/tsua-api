"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
const RegisterSchema = zod_1.z.object({
    username: zod_1.z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    displayName: zod_1.z.string().min(1).max(60).optional(),
    preferredLang: zod_1.z.enum(['he', 'en']).default('he'),
});
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string(),
});
router.post('/register', async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { username, email, password, displayName, preferredLang } = parsed.data;
    const exists = await prisma_1.prisma.user.findFirst({
        where: { OR: [{ email }, { username }] },
    });
    if (exists) {
        return res.status(409).json({ error: 'Username or email already taken' });
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    const user = await prisma_1.prisma.user.create({
        data: { username, email, passwordHash, displayName, preferredLang },
        select: { id: true, username: true, displayName: true, email: true, preferredLang: true },
    });
    const token = jsonwebtoken_1.default.sign({ sub: user.id }, process.env.JWT_SECRET ?? 'dev-secret', { expiresIn: '30d' });
    res.status(201).json({ user, token });
});
router.post('/login', async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jsonwebtoken_1.default.sign({ sub: user.id }, process.env.JWT_SECRET ?? 'dev-secret', { expiresIn: '30d' });
    res.json({
        user: { id: user.id, username: user.username, displayName: user.displayName, email: user.email, preferredLang: user.preferredLang },
        token,
    });
});
exports.default = router;
