import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requirePerm } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncH, HttpError, writeAudit } from '../lib/helpers.js';
import { PERMISSIONS, ROLE_DEFAULTS, effectivePerms } from '../lib/permissions.js';

const router = Router();
const permList = z.array(z.enum(Object.keys(PERMISSIONS)));

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง'),
  name: z.string().trim().min(2, 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร').max(80),
  role: z.enum(['USER', 'ADMIN', 'SUPERADMIN']),
  password: z.string().min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร').max(128),
  extraPerms: permList.default([]),
  blockedPerms: permList.default([]),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['USER', 'ADMIN', 'SUPERADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  password: z.string().min(8).max(128).optional(),
  extraPerms: permList.optional(),
  blockedPerms: permList.optional(),
});

// รายการสิทธิ์ทั้งหมด + ค่าเริ่มต้นแต่ละ role (ฟอร์มฝั่ง frontend ใช้)
router.get('/perms-meta', requirePerm('users.manage'), (_req, res) => {
  res.json({ permissions: PERMISSIONS, roleDefaults: ROLE_DEFAULTS });
});

router.get('/', requirePerm('users.manage'), asyncH(async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, email: true, name: true, role: true, status: true, extraPerms: true, blockedPerms: true, lastLoginAt: true, createdAt: true },
  });
  res.json({ items: users.map(u => ({ ...u, perms: effectivePerms(u) })) });
}));

router.post('/', requirePerm('users.manage'), validate(createSchema), asyncH(async (req, res) => {
  const { email, name, role, password, extraPerms, blockedPerms } = req.body;
  if (role === 'SUPERADMIN' && req.user.role !== 'SUPERADMIN') throw new HttpError(403, 'เฉพาะ SUPERADMIN จึงจะสร้างบัญชี SUPERADMIN ได้');
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new HttpError(409, 'อีเมลนี้มีในระบบแล้ว');
  const user = await prisma.user.create({ data: { email, name, role, passwordHash: await bcrypt.hash(password, 12), extraPerms, blockedPerms } });
  await writeAudit(req, 'USER_CREATE', email);
  res.status(201).json({ item: { ...user, passwordHash: undefined, perms: effectivePerms(user) } });
}));

router.patch('/:id', requirePerm('users.manage'), validate(updateSchema), asyncH(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) throw new HttpError(404, 'ไม่พบบัญชีนี้');
  if (target.role === 'SUPERADMIN' && req.user.role !== 'SUPERADMIN') throw new HttpError(403, 'เฉพาะ SUPERADMIN จึงจะแก้ไขบัญชี SUPERADMIN ได้');

  const demoting = req.body.role && req.body.role !== target.role && req.body.role !== 'SUPERADMIN';
  const suspending = req.body.status === 'SUSPENDED';
  if (target.id === req.user.id && (demoting || suspending)) throw new HttpError(400, 'ไม่สามารถลดสิทธิ์หรือระงับบัญชีของตนเองได้');
  if (target.role === 'SUPERADMIN' && (demoting || suspending)) {
    const supers = await prisma.user.count({ where: { role: 'SUPERADMIN', status: 'ACTIVE' } });
    if (supers <= 1) throw new HttpError(400, 'ระบบต้องมี SUPERADMIN ที่ใช้งานได้อย่างน้อย 1 บัญชีเสมอ');
  }

  const data = { ...req.body };
  delete data.password;
  if (req.body.password) data.passwordHash = await bcrypt.hash(req.body.password, 12);
  const user = await prisma.user.update({ where: { id: target.id }, data });
  const changed = Object.keys(req.body).filter(k => k !== 'password').join(',');
  await writeAudit(req, 'USER_UPDATE', `${target.email} :: ${changed}${req.body.password ? ' +password' : ''}`);
  res.json({ item: { ...user, passwordHash: undefined, perms: effectivePerms(user) } });
}));

router.delete('/:id', requirePerm('users.manage'), asyncH(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) throw new HttpError(404, 'ไม่พบบัญชีนี้');
  if (target.id === req.user.id) throw new HttpError(400, 'ไม่สามารถลบบัญชีของตนเองได้');
  if (target.role === 'SUPERADMIN') {
    if (req.user.role !== 'SUPERADMIN') throw new HttpError(403, 'เฉพาะ SUPERADMIN จึงจะลบบัญชี SUPERADMIN ได้');
    if (await prisma.user.count({ where: { role: 'SUPERADMIN', status: 'ACTIVE' } }) <= 1) throw new HttpError(400, 'ระบบต้องมี SUPERADMIN อย่างน้อย 1 บัญชีเสมอ');
  }
  await prisma.user.delete({ where: { id: target.id } }); // refresh token ถูกลบตาม, ระบบงานที่สร้างไว้คงอยู่ (createdBy SetNull)
  await writeAudit(req, 'USER_DELETE', target.email);
  res.json({ ok: true });
}));

export default router;