import { prisma } from '../lib/prisma.js';

const CHAT_DAYS = Math.max(1, Number(process.env.CHAT_RETENTION_DAYS || 90));
const AUDIT_DAYS = Math.max(30, Number(process.env.AUDIT_RETENTION_DAYS || 365));

export async function purgeExpiredData() {
  try {
    const chats = await prisma.chatSession.deleteMany({ where: { lastMessageAt: { lt: new Date(Date.now() - CHAT_DAYS * 864e5) } } });
    const audits = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - AUDIT_DAYS * 864e5) } } });
    if (chats.count || audits.count) {
      console.log(`[retention] ลบแชทเกิน ${CHAT_DAYS} วัน: ${chats.count} ห้อง · audit log เกิน ${AUDIT_DAYS} วัน: ${audits.count} รายการ`);
    }
  } catch (e) { console.warn('[retention]', e.message); }
}