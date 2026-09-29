import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyAccess } from '../lib/jwt.js';
import { env } from '../config/env.js';
import { requirePerm } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { chatLimiter } from '../middleware/security.js';
import { asyncH, HttpError, hashIp, hashTokenId } from '../lib/helpers.js';
import * as chat from '../services/chat.service.js';

const router = Router();

// เข้าถึงห้องแชทได้ 2 ทาง: ผู้มีสิทธิ์ chat.agent (JWT) หรือเจ้าของห้อง (visitor token)
const chatAccess = asyncH(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const payload = header.startsWith('Bearer ') ? verifyAccess(header.slice(7)) : null;
  if (payload && (payload.perms?.includes('chat.agent') || ['ADMIN', 'SUPERADMIN'].includes(payload.role))) {
    req.chatRole = 'AGENT';
    return next();
  }
  const vt = req.headers['x-visitor-token'];
  if (typeof vt === 'string' && vt) {
    const s = await prisma.chatSession.findUnique({ where: { id: req.params.id }, select: { visitorToken: true } });
    if (s && s.visitorToken === vt) { req.chatRole = 'VISITOR'; return next(); }
  }
  throw new HttpError(403, 'ไม่มีสิทธิ์เข้าถึงห้องแชทนี้');
});

router.post('/sessions', chatLimiter, validate(z.object({
  name: z.string().trim().min(2, 'กรุณากรอกชื่อ').max(60),
  consent: z.boolean().refine(v => v === true, { message: 'กรุณายินยอมตามนโยบายความเป็นส่วนตัวก่อนเริ่มแชท' }),
})), asyncH(async (req, res) => {
  const { session, visitorToken } = await chat.createSession(req.body.name);
  await prisma.consentLog.create({ data: {
    consentType: 'CHAT', granted: true,
    visitorHash: hashTokenId(visitorToken),
    ipHash: hashIp(req),
    userAgent: (req.headers['user-agent'] || '').slice(0, 200),
    policyVersion: env.POLICY_VERSION,
  } }).catch(() => {});
  res.status(201).json({ session, visitorToken });
}));

router.get('/sessions', requirePerm('chat.agent'), asyncH(async (_req, res) => {
  const rows = await chat.listSessions();
  res.json({ items: rows.map(r => ({ ...r, lastMessage: r.messages[0] || null, messages: undefined })) });
}));

router.get('/sessions/:id/messages', chatAccess, asyncH(async (req, res) => {
  const items = await chat.listMessages(req.params.id, typeof req.query.after === 'string' ? req.query.after : undefined);
  res.json({ items });
}));

router.post('/sessions/:id/read', chatAccess, asyncH(async (req, res) => {
  await chat.markRead(req.params.id, req.chatRole);
  res.json({ ok: true });
}));

export default router;