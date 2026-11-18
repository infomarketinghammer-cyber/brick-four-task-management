import { Router } from 'express';
import { CalendarController } from './calendar.controller';
import { authenticate } from '../../middleware/auth';
import { resyncIfStale } from '../../db/mongodb';

const router = Router();

router.use(authenticate);
// Pulls in events/invitees created by a sibling warm serverless instance that this
// instance's in-memory store hasn't seen yet (see resyncIfStale in db/mongodb.ts).
router.use(async (req, res, next) => {
  await resyncIfStale();
  next();
});

// Calendar routes
router.get('/calendar', CalendarController.getCalendar);
router.post('/calendar/events', CalendarController.createEvent);
router.get('/calendar/events/:id', CalendarController.getEventDetail);
router.patch('/calendar/events/:id', CalendarController.updateEvent);
router.delete('/calendar/events/:id', CalendarController.deleteEvent);
router.patch('/calendar/events/:id/respond', CalendarController.respondToEvent);

export default router;
