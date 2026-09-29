import { verifyAccess } from '../lib/jwt.js';
import { HttpError } from '../lib/helpers.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const payload = header.startsWith('Bearer ') ? verifyAccess(header.slice(7)) : null;
  if (!payload) return next(new HttpError(401, 'ต้องเข้าสู่ระบบก่อนใช้งาน'));
  req.user = { id: payload.sub, email: payload.email, role: payload.role, name: payload.name, perms: payload.perms || [] };
  next();
}

// ตรวจสิทธิ์ละเอียด — SUPERADMIN ผ่านทุกข้อ (รองรับ token เก่าที่ยังไม่มี perms)
export const requirePerm = (perm) => [
  requireAuth,
  (req, _res, next) => {
    if (req.user.role === 'SUPERADMIN' || req.user.perms.includes(perm)) return next();
    next(new HttpError(403, `ไม่มีสิทธิ์สำหรับการกระทำนี้ (${perm})`));
  },
];

// fallback เดิม — ใช้กับไฟล์ที่ยังไม่ได้เปลี่ยนเป็น requirePerm
export const requireAdmin = [
  requireAuth,
  (req, _res, next) => ['ADMIN', 'SUPERADMIN'].includes(req.user.role)
    ? next()
    : next(new HttpError(403, 'เฉพาะผู้ดูแลระบบเท่านั้น')),
];