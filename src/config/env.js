import 'dotenv/config';

const req = (k) => { const v = process.env[k]; if (!v) throw new Error(`กรุณาตั้งค่า env: ${k}`); return v; };

export const env = {
  PORT: Number(process.env.PORT || 4000),
  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()),
  JWT_SECRET: req('JWT_SECRET'),
  ACCESS_TTL: process.env.JWT_ACCESS_TTL || '15m',
  REFRESH_DAYS: Number(process.env.JWT_REFRESH_TTL_DAYS || 7),
  SUPABASE_URL: req('SUPABASE_URL'),
  SUPABASE_SERVICE_KEY: req('SUPABASE_SERVICE_ROLE_KEY'),
  BACKUP_BUCKET: process.env.SUPABASE_BACKUP_BUCKET || 'backups',
  // เพิ่ม 2 บรรทัดนี้ใน object env
  HASH_SALT: process.env.HASH_SALT || process.env.JWT_SECRET, // ใช้ hash IP — ถ้าไม่ตั้งจะใช้ JWT_SECRET แทน
  POLICY_VERSION: process.env.POLICY_VERSION || '1.0',        // ต้องตรงกับ frontend (lib/consent.js)
};