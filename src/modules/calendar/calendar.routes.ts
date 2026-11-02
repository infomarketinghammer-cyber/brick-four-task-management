import { Router } from 'express';
import { CalendarController } from './calendar.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

// Calendar routes
router.get('/calendar', CalendarController.getCalendar);
router.post('/calendar/events', CalendarController.createEvent);
router.get('/calendar/events/:id', CalendarController.getEventDetail);
router.patch('/calendar/events/:id', CalendarController.updateEvent);
router.delete('/calendar/events/:id', CalendarController.deleteEvent);
router.patch('/calendar/events/:id/respond', CalendarController.respondToEvent);

export default router;
