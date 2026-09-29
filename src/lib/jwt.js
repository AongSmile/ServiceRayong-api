import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { effectivePerms } from './permissions.js';

export const signAccess = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name, perms: effectivePerms(user) },
    env.JWT_SECRET,
    { expiresIn: env.ACCESS_TTL, issuer: 'service-registry' }
  );

export const verifyAccess = (token) => {
  try { return jwt.verify(token, env.JWT_SECRET, { issuer: 'service-registry' }); } catch { return null; }
};

export const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const uuid = () => crypto.randomUUID();