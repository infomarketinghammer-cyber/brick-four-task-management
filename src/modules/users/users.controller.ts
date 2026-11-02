/**
 * Users Controller Handlers
 */

import { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/envelope';
import {
  CreateUserSchema,
  GetUsersQuerySchema,
  UpdateManagerSchema,
  UpdateUserSchema,
} from './users.schema';
import { UsersService } from './users.service';

export class UsersController {
  static async getCapabilities(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await UsersService.getCapabilities(userId);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedQuery = GetUsersQuerySchema.parse(req.query);
      const requestor = { id: req.user!.id, role: req.user!.role };
      const result = await UsersService.getUsers(requestor, validatedQuery);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id;
      const result = await UsersService.getUserById(userId);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = CreateUserSchema.parse(req.body);
      const result = await UsersService.createUser(validated);
      res.status(201).json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id;
      const validated = UpdateUserSchema.parse(req.body);
      const requestor = { id: req.user!.id, name: req.user!.name || 'Admin' };
      const result = await UsersService.updateUser(userId, validated, requestor);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id;
      const requestor = { id: req.user!.id, name: req.user!.name || 'Admin' };
      const result = await UsersService.resetPassword(userId, requestor);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id;
      const result = await UsersService.deleteUser(userId);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async getOrgChart(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await UsersService.getOrgChart();
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async getSubordinates(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id;
      const result = await UsersService.getSubordinates(userId);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async updateManager(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id;
      const validated = UpdateManagerSchema.parse(req.body);
      const result = await UsersService.updateManager(userId, validated);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }
}
