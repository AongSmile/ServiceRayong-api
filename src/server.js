import { createServer } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { initSocket } from './sockets/chat.socket.js';
import { prisma } from './lib/prisma.js';
import { purgeExpiredData } from './services/retention.js';

const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(env.PORT, () => console.log(`✔ API + Socket.io → http://localhost:${env.PORT}`));

async function shutdown(signal) {
  console.log(`\n${signal} — กำลังปิดเซิร์ฟเวอร์…`);
  httpServer.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

purgeExpiredData(); // ล้างตอนเปิดเครื่อง
const retentionTimer = setInterval(purgeExpiredData, 24 * 60 * 60 * 1000); // และทุก 24 ชม.
// ในฟังก์ชัน shutdown() เพิ่ม: clearInterval(retentionTimer);