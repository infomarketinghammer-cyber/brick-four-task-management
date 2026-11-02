import { Request, Response, NextFunction } from 'express';
import { TodosService } from './todos.service';
import { sendSuccess } from '../../utils/envelope';
import { dbStore } from '../../db/prisma';
import { AppError } from '../../utils/errors';

export class TodosController {
  static getTodos(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const { view, list_id } = req.query;
      const result = TodosService.getTodos(ownerId, view as string, list_id as string);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static createTodo(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const result = TodosService.createTodo(ownerId, req.body);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static updateTodo(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const todoId = req.params.id;
      const result = TodosService.updateTodo(todoId, ownerId, req.body);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static toggleComplete(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const todoId = req.params.id;
      const { is_completed } = req.body || {};
      const result = TodosService.toggleComplete(todoId, ownerId, is_completed);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static toggleMyDay(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const todoId = req.params.id;
      const { in_my_day } = req.body || {};
      const result = TodosService.toggleMyDay(todoId, ownerId, in_my_day);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static reorderTodos(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const items = Array.isArray(req.body) ? req.body : req.body?.items || [];
      const result = TodosService.reorderTodos(ownerId, items);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static deleteTodo(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const todoId = req.params.id;
      const result = TodosService.deleteTodo(todoId, ownerId);
      res.json(sendSuccess({ success: result }));
    } catch (err) {
      next(err);
    }
  }

  // Steps
  static addStep(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const todoId = req.params.id;
      const { title } = req.body;
      const result = TodosService.addStep(todoId, ownerId, title);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static updateStep(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const stepId = req.params.id;
      const result = TodosService.updateStep(stepId, ownerId, req.body);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static deleteStep(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const stepId = req.params.id;
      const result = TodosService.deleteStep(stepId, ownerId);
      res.json(sendSuccess({ success: result }));
    } catch (err) {
      next(err);
    }
  }

  // Lists
  static getLists(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const result = TodosService.getLists(ownerId);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static createList(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const { name, color } = req.body;
      const result = TodosService.createList(ownerId, name, color);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static updateList(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const listId = req.params.id;
      const result = TodosService.updateList(listId, ownerId, req.body);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static deleteList(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const listId = req.params.id;
      const result = TodosService.deleteList(listId, ownerId);
      res.json(sendSuccess({ success: result }));
    } catch (err) {
      next(err);
    }
  }

  // Manager Visibility
  static getUserTodosForManager(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = dbStore.users.get(req.user!.id);
      if (!requester) throw AppError.unauthorized('User record not found');
      const { userId } = req.params;
      const result = TodosService.getUserTodosForManager(requester, userId);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  // Manager Report Summary
  static getTodoSummaryReport(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = dbStore.users.get(req.user!.id);
      if (!requester) throw AppError.unauthorized('User record not found');
      const result = TodosService.getTodoSummaryReport(requester);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }
}
