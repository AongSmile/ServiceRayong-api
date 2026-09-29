import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { requirePerm, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncH, HttpError, normThai, buildSearchText, writeAudit } from '../lib/helpers.js';

const router = Router();

const systemSchema = z.object({
  type: z.enum(['CORE', 'EXTERNAL']),
  name: z.string().trim().min(2, 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร').max(120),
  url: z.string().trim().url('URL ไม่ถูกต้อง').refine(u => /^https?:/i.test(u), 'อนุญาตเฉพาะ http/https'),
  description: z.string().trim().max(600).default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  status: z.enum(['ACTIVE', 'MAINTENANCE']).default('ACTIVE'),
});

async function nextCode(type) {
  const prefix = type === 'CORE' ? 'SYS' : 'EXT';
  const last = await prisma.system.findFirst({ where: { type }, orderBy: { code: 'desc' } });
  const n = last ? (parseInt(last.code.split('-')[1], 10) || 0) + 1 : 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

/* ── อ่าน: ต้องล็อกอินก่อน (ตามระบบประตูที่เพิ่งทำ) ── */
router.get('/', requireAuth, asyncH(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
  const type = ['CORE', 'EXTERNAL'].includes(req.query.type) ? req.query.type : undefined;
  const tag = typeof req.query.tag === 'string' && req.query.tag.trim() ? req.query.tag.trim().slice(0, 30) : undefined;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 20));

  const where = {};
  if (type) where.type = type;
  if (tag) where.tags = { has: tag };
  const terms = normThai(q).split(/\s+/).filter(Boolean).slice(0, 6);
  if (terms.length) where.AND = terms.map(t => ({ searchText: { contains: t } }));

  const [items, total] = await prisma.$transaction([
    prisma.system.findMany({ where, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.system.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
}));

router.get('/meta', requireAuth, asyncH(async (_req, res) => {
  const [total, core, external, rows] = await Promise.all([
    prisma.system.count(),
    prisma.system.count({ where: { type: 'CORE' } }),
    prisma.system.count({ where: { type: 'EXTERNAL' } }),
    prisma.system.findMany({ select: { tags: true } }),
  ]);
  const counts = {};
  rows.forEach(r => r.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const tags = Object.entries(counts).map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  res.json({ total, core, external, tags });
}));

/* ── เขียน: แอดมินเท่านั้น + บันทึก audit ทุกครั้ง ── */
router.get('/export', requirePerm('systems.write'), asyncH(async (_req, res) => {
  const items = await prisma.system.findMany({ orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }] });
  const filename = `registry-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    if (supabase) {
      await supabase.storage.from(env.BACKUP_BUCKET).upload(filename, JSON.stringify(items, null, 2), { contentType: 'application/json', upsert: true });
    }
  } catch (e) { console.warn('[backup] Supabase Storage:', e.message); }
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.type('application/json').send(JSON.stringify(items, null, 2));
}));

router.post('/', requirePerm('systems.export'), validate(systemSchema), asyncH(async (req, res) => {
  const code = await nextCode(req.body.type);
  const max = await prisma.system.aggregate({ where: { type: req.body.type }, _max: { sortOrder: true } });
  const item = await prisma.system.create({
    data: { ...req.body, code, sortOrder: (max._max.sortOrder ?? -1) + 1, searchText: buildSearchText({ ...req.body, code }), createdById: req.user.id },
  });
  await writeAudit(req, 'SYSTEM_CREATE', item.code);
  res.status(201).json({ item });
}));

router.patch('/:id', requirePerm('systems.export'), validate(systemSchema.partial()), asyncH(async (req, res) => {
  const current = await prisma.system.findUnique({ where: { id: req.params.id } });
  if (!current) throw new HttpError(404, 'ไม่พบระบบงานนี้');
  let code = current.code;
  if (req.body.type && req.body.type !== current.type) code = await nextCode(req.body.type);
  const merged = { ...current, ...req.body, code };
  const item = await prisma.system.update({ where: { id: current.id }, data: { ...req.body, code, searchText: buildSearchText(merged) } });
  await writeAudit(req, 'SYSTEM_UPDATE', item.code);
  res.json({ item });
}));

router.patch('/:id/reorder', requirePerm('systems.export'), asyncH(async (req, res) => {
  const dir = req.body?.dir === 'up' ? -1 : 1;
  const item = await prisma.system.findUnique({ where: { id: req.params.id } });
  if (!item) throw new HttpError(404, 'ไม่พบระบบงานนี้');
  const siblings = await prisma.system.findMany({ where: { type: item.type }, orderBy: { sortOrder: 'asc' } });
  const idx = siblings.findIndex(s => s.id === item.id);
  const swap = siblings[idx + dir];
  if (!swap) return res.json({ ok: true });
  await prisma.$transaction([
    prisma.system.update({ where: { id: item.id }, data: { sortOrder: swap.sortOrder } }),
    prisma.system.update({ where: { id: swap.id }, data: { sortOrder: item.sortOrder } }),
  ]);
  await writeAudit(req, 'SYSTEM_REORDER', item.code);
  res.json({ ok: true });
}));

router.delete('/:id', requirePerm('systems.delete'), asyncH(async (req, res) => {
  const found = await prisma.system.findUnique({ where: { id: req.params.id }, select: { id: true, code: true } });
  if (!found) throw new HttpError(404, 'ไม่พบระบบงานนี้');
  await prisma.system.delete({ where: { id: req.params.id } });
  await writeAudit(req, 'SYSTEM_DELETE', found.code);
  res.json({ ok: true });
}));

export default router;