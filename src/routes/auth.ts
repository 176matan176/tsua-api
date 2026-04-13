import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const router = Router();

const RegisterSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(60).optional(),
  preferredLang: z.enum(['he', 'en']).default('he'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { username, email, password, displayName, preferredLang } = parsed.data;

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (exists) {
    return res.status(409).json({ error: 'Username or email already taken' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, displayName, preferredLang },
    select: { id: true, username: true, displayName: true, email: true, preferredLang: true },
  });

  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET ?? 'dev-secret', { expiresIn: '30d' });
  res.status(201).json({ user, token });
});

router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET ?? 'dev-secret', { expiresIn: '30d' });
  res.json({
    user: { id: user.id, username: user.username, displayName: user.displayName, email: user.email, preferredLang: user.preferredLang },
    token,
  });
});

export default router;
