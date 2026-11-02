/**
 * JWT Authentication Helpers
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Role } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-task-management-key-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-refresh-task-management-key-2026';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  hierarchy_level: number;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function signRefreshToken(payload: JwtPayload): string {
  const nonce = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
  return jwt.sign({ ...payload, jti: nonce }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
}
