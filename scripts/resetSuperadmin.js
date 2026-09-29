import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// รับค่าจาก command line ก่อน ถ้าไม่มี fallback เป็น .env
const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').toLowerCase();
const password = process.argv[3] || process.env.ADMIN_PASSWORD || '';
const name = process.argv[4] || process.env.ADMIN_NAME || 'ผู้ดูแลระบบสูงสุด';

if (!email || password.length < 8) {
  console.error('✖ วิธีใช้: node scripts/resetSuperadmin.js <email> <รหัสผ่าน≥8ตัว> [ชื่อ]');
  process.exit(1);
}

console.log('⏳ กำลังล้างข้อมูลทุกตาราง…');
// ลบตามลำดับความสัมพันธ์ FK — ลูกก่อนแม่เสมอ
await prisma.$transaction([
  prisma.chatMessage.deleteMany(),
  prisma.chatSession.deleteMany(),
  prisma.auditLog.deleteMany(),
  prisma.consentLog.deleteMany(),
  prisma.privacyRequest.deleteMany(),
  prisma.refreshToken.deleteMany(),
  prisma.system.deleteMany(),
  prisma.user.deleteMany(),
]);
console.log('✔ ล้างข้อมูลทั้งหมดแล้ว (ระบบงาน, แชท, ความยินยอม, audit log, ผู้ใช้)');

await prisma.user.create({
  data: { email, name, role: 'SUPERADMIN', passwordHash: await bcrypt.hash(password, 12) },
});
console.log('✔ สร้างบัญชี SUPERADMIN แล้ว:', email);
console.log('ℹ ระบบงานว่างเปล่า — เพิ่มเองได้ที่หลังบ้าน (รหัสจะเริ่มที่ SYS-001 / EXT-001)');

await prisma.$disconnect();