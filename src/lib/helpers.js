import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';

const THAI_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g; // สระบน-ล่าง + วรรณยุกต์

export const normThai = (s) => String(s ?? '').toLowerCase().replace(THAI_MARKS, '');
export const buildSearchText = (s) => normThai([s.name, s.description, s.code, (s.tags || []).join(' ')].join(' · '));

export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── เครื่องมือด้าน PDPA ──

// IP เป็นข้อมูลส่วนบุคคลตาม PDPA → เก็บเป็น hash เท่านั้น ไม่มีทางย้อนกลับ
export function hashIp(req) {
  return crypto.createHash('sha256').update('ip:' + (req?.ip || '') + '|' + env.HASH_SALT).digest('hex').slice(0, 32);
}

// ระบุตัวตนผู้ใช้แชทด้วย hash ของ visitor token (token สุ่มมาอยู่แล้ว ไม่ต้อง salt)
export function hashTokenId(vt) {
  return crypto.createHash('sha256').update('vt:' + vt).digest('hex').slice(0, 32);
}

// ใช้ token ถ้ามี ไม่งั้น fallback เป็น hash ของ IP
export function hashVisitor(req) {
  const vt = req?.headers?.['x-visitor-token'];
  return (typeof vt === 'string' && vt) ? hashTokenId(vt) : hashIp(req);
}

// บันทึก audit trail — พลาดแล้วไม่ crash เซิร์ฟเวอร์
export async function writeAudit(req, action, target = '', actorEmail = null) {
  try {
    await prisma.auditLog.create({
      data: { actorEmail: actorEmail || req?.user?.email || 'anonymous', action, target, ipHash: hashIp(req) },
    });
  } catch (e) { console.warn('[audit]', e.message); }
}