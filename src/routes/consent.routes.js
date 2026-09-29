import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { chatLimiter } from '../middleware/security.js';
import { asyncH, hashIp, hashVisitor } from '../lib/helpers.js';

const router = Router();

// บันทึกความยินยอมคุกกี้ — เก็บ "ทั้งยอมรับและปฏิเสธ" เป็นหลักฐานตามหลัก PDPA
router.post('/', chatLimiter, validate(z.object({ functional: z.boolean() })), asyncH(async (req, res) => {
  const base = {
    visitorHash: hashVisitor(req),
    ipHash: hashIp(req),
    userAgent: (req.headers['user-agent'] || '').slice(0, 200),
    policyVersion: env.POLICY_VERSION,
  };
  await prisma.consentLog.createMany({ data: [
    { ...base, consentType: 'COOKIES_NECESSARY', granted: true },
    { ...base, consentType: 'COOKIES_FUNCTIONAL', granted: req.body.functional },
  ]});
  res.json({ ok: true, policyVersion: env.POLICY_VERSION });
}));

// ถอนความยินยอม — ทำได้ง่ายเท่าการให้ยินยอม
router.post('/withdraw', chatLimiter, asyncH(async (req, res) => {
  await prisma.consentLog.updateMany({
    where: { visitorHash: hashVisitor(req), withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });
  res.json({ ok: true });
}));

export default router;