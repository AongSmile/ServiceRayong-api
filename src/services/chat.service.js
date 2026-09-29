import { prisma } from '../lib/prisma.js';
import { uuid } from '../lib/jwt.js';
import { HttpError } from '../lib/helpers.js';

export async function createSession(name) {
  const visitorToken = uuid();
  const s = await prisma.chatSession.create({ data: { visitorName: name, visitorToken } });
  return { session: { id: s.id, visitorName: s.visitorName, status: s.status, lastMessageAt: s.lastMessageAt }, visitorToken };
}

export async function addMessage({ sessionId, senderRole, senderName, body }) {
  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({ data: { sessionId, senderRole, senderName, body } }),
    prisma.chatSession.update({
      where: { id: sessionId },
      data: { lastMessageAt: new Date(), ...(senderRole === 'VISITOR' ? { unreadForAgent: { increment: 1 } } : { unreadForVisitor: { increment: 1 } }) },
    }),
  ]);
  return message;
}

export async function listSessions() {
  return prisma.chatSession.findMany({
    where: { status: 'OPEN' },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true, visitorName: true, status: true, unreadForAgent: true, lastMessageAt: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, senderRole: true } },
    },
  });
}

export async function listMessages(sessionId, after) {
  return prisma.chatMessage.findMany({
    where: { sessionId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
}

export async function markRead(sessionId, side) {
  return prisma.chatSession.update({ where: { id: sessionId }, data: side === 'AGENT' ? { unreadForAgent: 0 } : { unreadForVisitor: 0 } });
}

export async function closeSession(sessionId) {
  const session = await prisma.chatSession.update({ where: { id: sessionId }, data: { status: 'CLOSED' } }).catch(() => null);
  if (!session) throw new HttpError(404, 'ไม่พบห้องแชท');
  const system = await prisma.chatMessage.create({ data: { sessionId, senderRole: 'SYSTEM', senderName: 'ระบบ', body: 'เจ้าหน้าที่ปิดการสนทนาแล้ว ขอบคุณที่ติดต่อมา' } });
  return { session, system };
}