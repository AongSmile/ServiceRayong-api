import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { verifyAccess } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import * as chat from '../services/chat.service.js';

export let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: env.CORS_ORIGIN, credentials: true }, maxHttpBufferSize: 8e3 });

  // ตรวจสอบสิทธิ์ตอน handshake — ไม่มี token ที่ถูกต้องจะเชื่อมต่อไม่ได้เลย
  io.use((socket, next) => {
    const { adminToken, visitorToken } = socket.handshake.auth || {};
        if (adminToken) {
      const p = verifyAccess(adminToken);
      if (p && (p.perms?.includes('chat.agent') || ['ADMIN', 'SUPERADMIN'].includes(p.role))) {
        socket.data = { role: 'AGENT', name: p.name };
        return next();
      }
    }
    if (typeof visitorToken === 'string' && /^[\w-]{16,80}$/.test(visitorToken)) {
      socket.data = { role: 'VISITOR', visitorToken };
      return next();
    }
    next(new Error('unauthorized'));
  });

  io.on('connection', (socket) => {
    const { role, visitorToken, name } = socket.data;
    if (role === 'AGENT') socket.join('agents'); // ห้องแจ้งเตือนสำหรับแอดมินทุกคน

    socket.on('chat:join', async ({ sessionId } = {}, ack = () => {}) => {
      try {
        const s = await prisma.chatSession.findUnique({ where: { id: sessionId } });
        if (!s) throw new Error('ไม่พบห้องแชท');
        if (role === 'VISITOR' && s.visitorToken !== visitorToken) throw new Error('ไม่มีสิทธิ์เข้าห้องนี้');
        socket.join(`session:${sessionId}`);
        await chat.markRead(sessionId, role);
        ack({ ok: true });
      } catch (e) { ack({ ok: false, error: e.message }); }
    });

    socket.on('chat:message', async ({ sessionId, body } = {}, ack = () => {}) => {
      try {
        if (!sessionId || typeof body !== 'string' || !body.trim()) throw new Error('ข้อความไม่ถูกต้อง');
        // sanitize: ตัดแท็ก HTML + จำกัดความยาว (กัน XSS ฝั่งเก็บข้อมูล)
        const clean = body.trim().slice(0, 1000).replace(/<[^>]*>/g, '');
        let senderName;
        const s = await prisma.chatSession.findUnique({ where: { id: sessionId }, select: { visitorToken: true, visitorName: true, status: true } });
        if (!s) throw new Error('ไม่พบห้องแชท');
        if (s.status === 'CLOSED') throw new Error('การสนทนานี้ปิดแล้ว');
        if (role === 'AGENT') senderName = name;
        else {
          if (s.visitorToken !== visitorToken) throw new Error('ไม่มีสิทธิ์ส่งข้อความ');
          senderName = s.visitorName;
        }
        const message = await chat.addMessage({ sessionId, senderRole: role === 'AGENT' ? 'AGENT' : 'VISITOR', senderName, body: clean });
        io.to(`session:${sessionId}`).emit('chat:message', { sessionId, message });
        io.to('agents').emit('chat:session-update', { sessionId, lastMessage: message, unreadDelta: role === 'AGENT' ? 0 : 1 });
        ack({ ok: true, message });
      } catch (e) { ack({ ok: false, error: e.message }); }
    });

    socket.on('chat:typing', ({ sessionId, typing } = {}) => {
      if (sessionId) socket.to(`session:${sessionId}`).emit('chat:typing', { sessionId, typing: !!typing, by: role });
    });

    socket.on('chat:close', async ({ sessionId } = {}, ack = () => {}) => {
      try {
        if (role !== 'AGENT') throw new Error('ไม่มีสิทธิ์');
        const { system } = await chat.closeSession(sessionId);
        io.to(`session:${sessionId}`).emit('chat:message', { sessionId, message: system });
        io.to('agents').emit('chat:session-closed', { sessionId });
        ack({ ok: true });
      } catch (e) { ack({ ok: false, error: e.message }); }
    });
  });

  return io;
}