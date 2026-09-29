import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { signAccess, newRefreshToken, hashToken } from '../lib/jwt.js';
import { effectivePerms } from '../lib/permissions.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/security.js';
import { asyncH, HttpError, writeAudit } from '../lib/helpers.js';

const router = Router();
const COOKIE = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth' };
const toPublicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, perms: effectivePerms(u) });

router.post('/login', authLimiter, validate(z.object({
  email: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน').max(128),
})), asyncH(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  const ok = user?.passwordHash && await bcrypt.compare(req.body.password, user.passwordHash);
  if (!ok) throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  if (user.status === 'SUSPENDED') {
    await writeAudit(req, 'AUTH_LOGIN_BLOCKED', user.email, user.email);
    throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน — กรุณาติดต่อผู้ดูแลระบบ');
  }

  const accessToken = signAccess(user);
  const raw = newRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.create({ data: { tokenHash: hashToken(raw), userId: user.id, expiresAt: new Date(Date.now() + env.REFRESH_DAYS * 864e5) } }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);
  await writeAudit(req, 'AUTH_LOGIN', user.email, user.email);
  res.cookie('rt', raw, { ...COOKIE, maxAge: env.REFRESH_DAYS * 864e5 });
  res.json({ accessToken, user: toPublicUser(user) });
}));

router.post('/refresh', asyncH(async (req, res) => {
  const raw = req.cookies?.rt;
  if (!raw) throw new HttpError(401, 'ไม่พบเซสชัน');
  const rec = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: true } });
  if (!rec || rec.revokedAt || rec.expiresAt < new Date()) {
    res.clearCookie('rt', { path: '/api/auth' });
    throw new HttpError(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }
  if (rec.user.status === 'SUSPENDED') { // ระงับแล้ว → ยกเลิกทุกเซสชันของบัญชีนี้ทันที
    await prisma.refreshToken.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    res.clearCookie('rt', { path: '/api/auth' });
    throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
  }
  const nextRaw = newRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({ data: { tokenHash: hashToken(nextRaw), userId: rec.userId, expiresAt: new Date(Date.now() + env.REFRESH_DAYS * 864e5) } }),
  ]);
  res.cookie('rt', nextRaw, { ...COOKIE, maxAge: env.REFRESH_DAYS * 864e5 });
  res.json({ accessToken: signAccess(rec.user), user: toPublicUser(rec.user) });
}));

router.post('/logout', asyncH(async (req, res) => {
  const raw = req.cookies?.rt;
  if (raw) await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(raw), revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => {});
  res.clearCookie('rt', { path: '/api/auth' });
  res.json({ ok: true });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default router;