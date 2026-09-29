import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requirePerm } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { chatLimiter } from '../middleware/security.js';
import { asyncH, HttpError, hashIp, hashVisitor, hashTokenId } from '../lib/helpers.js';
import { io } from '../sockets/chat.socket.js';

const router = Router();

function requireVisitor(req) {
  const vt = req.headers['x-visitor-token'];
  if (typeof vt !== 'string' || !vt) throw new HttpError(401, 'ไม่พบรหัสเซสชันแชทในเบราว์เซอร์นี้');
  return vt;
}

router.get('/my-data', asyncH(async (req, res) => {
  const vt = requireVisitor(req);
  const session = await prisma.chatSession.findUnique({
    where: { visitorToken: vt },
    include: { messages: { orderBy: { createdAt: 'asc' }, select: { senderRole: true, senderName: true, body: true, createdAt: true } } },
  });
  if (!session) throw new HttpError(404, 'ไม่พบข้อมูลแชทของคุณ (อาจถูกลบไปแล้ว)');
  const consents = await prisma.consentLog.findMany({
    where: { visitorHash: hashTokenId(vt) },
    select: { consentType: true, granted: true, policyVersion: true, createdAt: true, withdrawnAt: true },
  });
  res.json({
    exportedAt: new Date().toISOString(),
    policyVersion: env.POLICY_VERSION,
    session: { id: session.id, visitorName: session.visitorName, status: session.status, createdAt: session.createdAt },
    messages: session.messages,
    consents,
  });
}));

router.delete('/my-data', asyncH(async (req, res) => {
  const vt = requireVisitor(req);
  const session = await prisma.chatSession.findUnique({ where: { visitorToken: vt }, select: { id: true } });
  const deleted = await prisma.chatSession.deleteMany({ where: { visitorToken: vt } });
  await prisma.consentLog.updateMany({ where: { visitorHash: hashTokenId(vt), withdrawnAt: null }, data: { withdrawnAt: new Date() } });
  if (session) io?.to('agents').emit('chat:session-closed', { sessionId: session.id });
  res.json({ ok: true, deleted: deleted.count });
}));

router.post('/request', chatLimiter, validate(z.object({
  reqType: z.enum(['ACCESS', 'ERASURE', 'WITHDRAW']),
  contact: z.string().trim().toLowerCase().email('กรุณากรอกอีเมลสำหรับติดต่อกลับ'),
  detail: z.string().trim().max(1000).default(''),
})), asyncH(async (req, res) => {
  const row = await prisma.privacyRequest.create({ data: { ...req.body, visitorHash: hashVisitor(req) } });
  io?.to('agents').emit('privacy:new-request', { id: row.id, reqType: row.reqType });
  res.status(201).json({ ok: true, refId: row.id.slice(0, 8).toUpperCase() });
}));

router.get('/overview', requirePerm('privacy.manage'), asyncH(async (_req, res) => {
  const [functionalYes, functionalNo, chatYes, withdrawn, requests, audits] = await Promise.all([
    prisma.consentLog.count({ where: { consentType: 'COOKIES_FUNCTIONAL', granted: true } }),
    prisma.consentLog.count({ where: { consentType: 'COOKIES_FUNCTIONAL', granted: false } }),
    prisma.consentLog.count({ where: { consentType: 'CHAT', granted: true } }),
    prisma.consentLog.count({ where: { withdrawnAt: { not: null } } }),
    prisma.privacyRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);
  res.json({ consents: { functionalYes, functionalNo, chatYes, withdrawn }, requests, audits });
}));

router.patch('/requests/:id', requirePerm('privacy.manage'), validate(z.object({ status: z.enum(['PENDING', 'COMPLETED', 'REJECTED']) })), asyncH(async (req, res) => {
  const row = await prisma.privacyRequest.update({
    where: { id: req.params.id },
    data: { status: req.body.status, handledBy: req.user.email },
  });
  res.json({ item: row });
}));

export default router;