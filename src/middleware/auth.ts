/**
 * Express Authentication Middleware
 * Extracts bearer token, verifies JWT signature, and attaches user payload to req.user.
 */

import { NextFunction, Request, Response } from 'express';
import { Role, User } from '../types';
import { AppError } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';
import { dbStore } from '../db/prisma';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  role: Role;
  hierarchy_level: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      fullUser?: User;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or malformed Authorization header. Bearer token required.');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
      hierarchy_level: payload.hierarchy_level,
    };

    const fullUser = dbStore.users.get(payload.userId);
    if (fullUser) {
      req.fullUser = fullUser;
      req.user.name = fullUser.name;
    }

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return next(AppError.unauthorized('Access token has expired', 'TOKEN_EXPIRED'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(AppError.unauthorized('Invalid access token signature', 'INVALID_TOKEN'));
    }
    next(err);
  }
}
