/**
 * In-Memory Rate Limiter Middleware
 */

import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

export function rateLimit(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return next(
        AppError.badRequest(
          `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
          'RATE_LIMIT_EXCEEDED'
        )
      );
    }

    record.count += 1;
    next();
  };
}
