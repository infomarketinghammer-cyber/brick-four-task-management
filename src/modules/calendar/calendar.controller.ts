import { NextFunction, Request, Response } from 'express';
import { CalendarService } from './calendar.service';
import { sendSuccess } from '../../utils/envelope';

export class CalendarController {
  static async getCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = (req as any).fullUser || req.user!;
      const { start, end, user_id } = req.query;

      const events = await CalendarService.getCalendarEvents(requester, {
        start: start ? String(start) : undefined,
        end: end ? String(end) : undefined,
        user_id: user_id ? String(user_id) : undefined,
      });

      res.json(sendSuccess(events));
    } catch (err) {
      next(err);
    }
  }

  static async createEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = (req as any).fullUser || req.user!;
      const newEvent = await CalendarService.createCalendarEvent(requester, req.body);
      res.status(201).json(sendSuccess(newEvent));
    } catch (err) {
      next(err);
    }
  }

  static async getEventDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = (req as any).fullUser || req.user!;
      const eventDetail = await CalendarService.getCalendarEventDetail(requester, req.params.id);
      res.json(sendSuccess(eventDetail));
    } catch (err) {
      next(err);
    }
  }

  static async updateEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = (req as any).fullUser || req.user!;
      const updated = await CalendarService.updateCalendarEvent(requester, req.params.id, req.body);
      res.json(sendSuccess(updated));
    } catch (err) {
      next(err);
    }
  }

  static async deleteEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = (req as any).fullUser || req.user!;
      const result = await CalendarService.deleteCalendarEvent(requester, req.params.id);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }

  static async respondToEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = (req as any).fullUser || req.user!;
      const { status } = req.body;
      const result = await CalendarService.respondToCalendarEvent(requester, req.params.id, status);
      res.json(sendSuccess(result));
    } catch (err) {
      next(err);
    }
  }
}
