import rateLimit from 'express-rate-limit';

// จำกัดแยกชั้น: ทั่วไป / ล็อกอิน / แชท
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' },
});
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
  message: { error: 'พยายามเข้าสู่ระบบมากเกินไป ลองอีกครั้งใน 15 นาที' },
});
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 15,
  message: { error: 'ส่งข้อความถี่เกินไป กรุณารอสักครู่' },
});