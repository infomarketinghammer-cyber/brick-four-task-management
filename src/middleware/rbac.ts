/**
 * Role-Based Access Control (RBAC) Middleware
 */

import { NextFunction, Request, Response } from 'express';
import { Role } from '../types';
import { AppError } from '../utils/errors';

/**
 * Restricts access to specified roles (e.g. requireRole('ADMIN'))
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Action restricted to roles: [${allowedRoles.join(', ')}]. User role '${req.user.role}' is not authorized.`
        )
      );
    }

    next();
  };
}

/**
 * Ensures user hierarchy level is at or above a minimum threshold (e.g., maxLevel 0 for Admin only, maxLevel 1 for Dept Head+)
 */
export function requireMaxHierarchyLevel(maxLevel: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    if (req.user.hierarchy_level > maxLevel) {
      return next(
        AppError.forbidden(
          `Requires hierarchy level <= ${maxLevel}. User hierarchy level is ${req.user.hierarchy_level}.`
        )
      );
    }

    next();
  };
}
