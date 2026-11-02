/**
 * Auth Controller Handlers
 */

import { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/envelope';
import {
  ForgotPasswordSchema,
  LoginSchema,
  RefreshTokenSchema,
  ResetPasswordSchema,
} from './auth.schema';
import { AuthService } from './auth.service';

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = LoginSchema.parse(req.body);
      const result = await AuthService.login(validated);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = RefreshTokenSchema.parse(req.body);
      const result = await AuthService.refresh(validated);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.body.refreshToken;
      const result = await AuthService.logout(refreshToken);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = ForgotPasswordSchema.parse(req.body);
      const result = await AuthService.forgotPassword(validated);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = ResetPasswordSchema.parse(req.body);
      const result = await AuthService.resetPassword(validated);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await AuthService.getMe(userId);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }
}
