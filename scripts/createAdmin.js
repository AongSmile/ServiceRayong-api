import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!email || password.length < 8) {
  console.error('✖ ตั้งค่า ADMIN_EMAIL และ ADMIN_PASSWORD (≥8 ตัวอักษร) ใน .env ก่อน');
  process.exit(1);
}

await prisma.user.upsert({
  where: { email },
  update: { role: 'ADMIN' },
  create: { email, name: process.env.ADMIN_NAME || 'ผู้ดูแลระบบ', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) },
});
console.log('✔ บัญชีผู้ดูแลระบบพร้อมใช้งาน:', email);

const SEED = [
  ['SYS-001', 'CORE', 'ระบบสารบรรณอิเล็กทรอนิกส์', 'https://example.org/?sys=edoc', 'รับ-ส่งและลงทะเบียนหนังสือราชการ ติดตามสถานะเอกสาร', ['เอกสาร', 'หนังสือราชการ', 'สารบรรณ']],
  ['SYS-002', 'CORE', 'ระบบลาและเวลาปฏิบัติงาน', 'https://example.org/?sys=leave', 'ยื่นใบลาออนไลน์ บันทึกเวลาเข้า-ออก ตรวจสิทธิวันลาคงเหลือ', ['บุคคล', 'ลางาน', 'เวลา']],
  ['SYS-003', 'CORE', 'ระบบสารสนเทศทรัพยากรบุคคล', 'https://example.org/?sys=hris', 'ทะเบียนประวัติพนักงาน โครงสร้างกำลังคน ผลการประเมิน', ['บุคคล', 'ประเมินผล']],
  ['SYS-004', 'CORE', 'ระบบเงินเดือนและสวัสดิการ', 'https://example.org/?sys=payroll', 'ดาวน์โหลดสลิปเงินเดือน ตรวจรายการหักและภาษี', ['การเงิน', 'สลิป', 'สวัสดิการ']],
  ['SYS-005', 'CORE', 'ระบบจองห้องประชุมและยานพาหนะ', 'https://example.org/?sys=booking', 'จองห้องประชุม รถต้นสังกัด และอุปกรณ์นำเสนอ', ['จองห้อง', 'ประชุม'], 'MAINTENANCE'],
  ['SYS-006', 'CORE', 'ระบบช่วยสอนออนไลน์', 'https://example.org/?sys=lms', 'หลักสูตรอบรมออนไลน์ แบบทดสอบ สถิติชั่วโมงพัฒนา', ['อบรม', 'พัฒนา']],
  ['SYS-007', 'CORE', 'IT Helpdesk', 'https://example.org/?sys=helpdesk', 'แจ้งปัญหาคอมพิวเตอร์และระบบงาน ขอสิทธิ์เข้าใช้งาน', ['ไอที', 'แจ้งซ่อม']],
  ['EXT-001', 'EXTERNAL', 'ระบบจัดซื้อจัดจ้างภาครัฐ (e-GP)', 'https://www.gprocurement.go.th', 'ประกาศจัดซื้อจัดจ้าง ราคากลาง และผลการจัดซื้อจัดจ้าง', ['จัดซื้อจัดจ้าง', 'ราชการ']],
  ['EXT-002', 'EXTERNAL', 'ราชกิจจานุเบกษา', 'https://ratchakitcha.soc.go.th', 'ค้นหากฎหมายและประกาศราชการย้อนหลัง', ['กฎหมาย', 'ราชการ']],
  ['EXT-003', 'EXTERNAL', 'สำนักงานประกันสังคม', 'https://www.sso.go.th', 'ตรวจสอบสิทธิประโยชน์ บัญชีผู้ประกันตน', ['ประกันสังคม', 'สิทธิ']],
  ['EXT-004', 'EXTERNAL', 'ระบบตรวจสอบราชการ (NOC)', 'https://noc.ratchakitcha.soc.go.th', 'รับเรื่องร้องเรียน-ร้องทุกข์ของประชาชน', ['ร้องเรียน', 'ราชการ']],
  ['EXT-005', 'EXTERNAL', 'กรมบังคับคดี', 'https://www.rle.go.th', 'ตรวจสอบคดี ชำระหนี้ออนไลน์ ติดตามการบังคับคดี', ['คดี', 'การเงิน']],
].map(([code, type, name, url, description, tags, status], i) => ({
  code, type, name, url, description, tags, status: status || 'ACTIVE', sortOrder: i,
}));

const count = await prisma.system.count();
if (count === 0) {
  const strip = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g; // สระบน-ล่าง + วรรณยุกต์
  await prisma.system.createMany({
    data: SEED.map(s => ({ ...s, searchText: [s.name, s.description, s.code, s.tags.join(' ')].join(' · ').toLowerCase().replace(strip, '') })),
  });
  console.log(`✔ เพิ่มระบบงานตัวอย่าง ${SEED.length} รายการ`);
} else console.log('ℹ มีข้อมูลในฐานข้อมูลแล้ว ข้ามการ seed');

await prisma.$disconnect();