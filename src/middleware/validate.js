import { HttpError } from '../lib/helpers.js';

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const parsed = schema.safeParse(req[source] ?? {});
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    const first = Object.values(details)[0]?.[0];
    return next(new HttpError(400, first || 'ข้อมูลไม่ถูกต้อง', details));
  }
  req[source] = parsed.data;
  next();
};