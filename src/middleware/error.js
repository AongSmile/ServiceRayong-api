export const notFound = (_req, res) => res.status(404).json({ error: 'ไม่พบเส้นทางนี้' });

export const errorHandler = (err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์', details: err.details });
};