/**
 * Recurrence Engine Module
 * Computes scheduled execution dates for repeating tasks and clones template instances.
 */

import {
  addDays,
  addMonths,
  addWeeks,
  getDaysInMonth,
  getISODay,
  isAfter,
  isBefore,
  isSameDay,
  setDate,
  startOfDay,
} from 'date-fns';
import { RecurrenceRule, Task } from './types';

/**
 * Calculates the next run date for a given recurrence rule after a reference date.
 *
 * Handles DAILY, WEEKLY (with days_of_week array), MONTHLY (clamped to month-end e.g. Feb 28),
 * and CUSTOM (calendar-picked dates).
 * Respects starts_on, ends_on, max_occurrences, and is_active flags.
 *
 * @param rule Recurrence rule parameters
 * @param from Base reference date (defaults to current date)
 * @returns Next run Date object, or null if recurrence is exhausted or inactive
 */
export function computeNextRun(
  rule: RecurrenceRule,
  from: Date = new Date()
): Date | null {
  if (!rule.is_active) {
    return null;
  }

  // Check max occurrences limit
  if (
    rule.max_occurrences !== null &&
    rule.max_occurrences !== undefined &&
    rule.occurrences_count !== undefined &&
    rule.occurrences_count >= rule.max_occurrences
  ) {
    return null;
  }

  const startsOn = new Date(rule.starts_on);
  const endsOn = rule.ends_on ? new Date(rule.ends_on) : null;
  const interval = Math.max(1, rule.interval || 1);
  const refDate = isAfter(from, startsOn) ? from : startsOn;

  let candidate: Date | null = null;

  switch (rule.frequency) {
    case 'DAILY': {
      candidate = addDays(refDate, isSameDay(refDate, startsOn) ? 0 : interval);
      if (isBefore(candidate, startsOn)) {
        candidate = startsOn;
      }
      break;
    }

    case 'WEEKLY': {
      // days_of_week e.g. [1, 3, 5] (ISO: 1 = Mon, 7 = Sun)
      const allowedDays = rule.days_of_week && rule.days_of_week.length > 0
        ? rule.days_of_week
        : [getISODay(startsOn)];

      // Search up to 8 weeks ahead for matching weekday
      let checkDate = addDays(refDate, 1);
      const maxSearchDays = 56 * interval;
      let found = false;

      for (let i = 0; i < maxSearchDays; i++) {
        const isoDay = getISODay(checkDate);
        if (allowedDays.includes(isoDay)) {
          candidate = checkDate;
          found = true;
          break;
        }
        checkDate = addDays(checkDate, 1);
      }

      if (!found) candidate = null;
      break;
    }

    case 'MONTHLY': {
      const targetDay = rule.day_of_month || startsOn.getDate();

      // Next candidate month
      let nextMonthDate = addMonths(refDate, isSameDay(refDate, startsOn) ? 0 : interval);

      // Clamp target day to days in month (e.g. 31st in Feb becomes 28th/29th)
      const daysInTargetMonth = getDaysInMonth(nextMonthDate);
      const clampedDay = Math.min(targetDay, daysInTargetMonth);

      candidate = setDate(nextMonthDate, clampedDay);

      // Ensure candidate is strictly after refDate
      if (!isAfter(candidate, refDate)) {
        nextMonthDate = addMonths(nextMonthDate, interval);
        const newMaxDays = getDaysInMonth(nextMonthDate);
        candidate = setDate(nextMonthDate, Math.min(targetDay, newMaxDays));
      }
      break;
    }

    case 'CUSTOM': {
      if (!rule.custom_dates || rule.custom_dates.length === 0) {
        return null;
      }

      const sortedDates = rule.custom_dates
        .map((d) => new Date(d))
        .sort((a, b) => a.getTime() - b.getTime());

      candidate = sortedDates.find((d) => isAfter(d, refDate)) || null;
      break;
    }

    default:
      return null;
  }

  if (!candidate) {
    return null;
  }

  // Check ends_on boundary
  if (endsOn && isAfter(candidate, endsOn)) {
    return null;
  }

  return candidate;
}

/**
 * Spawns a new task instance from a template recurring task.
 *
 * @param templateTask Original task template
 * @param runDate Scheduled start date for the new instance
 * @returns Cloned Task instance with reset progress, timestamps, and shifted due date
 */
export function spawnRecurringTask(templateTask: Task, runDate: Date): Task {
  let newDueDate: Date | null = null;

  // Calculate due_date relative duration offset if template had start and due dates
  if (templateTask.due_date && templateTask.start_date) {
    const origStart = new Date(templateTask.start_date).getTime();
    const origDue = new Date(templateTask.due_date).getTime();
    const durationMs = Math.max(0, origDue - origStart);
    newDueDate = new Date(runDate.getTime() + durationMs);
  } else if (templateTask.due_date) {
    // If only due_date existed, default to same offset from now
    newDueDate = addDays(runDate, 1);
  }

  const newTaskId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  return {
    ...templateTask,
    id: newTaskId,
    status: templateTask.status === 'DRAFT' ? 'DRAFT' : 'ASSIGNED',
    progress_percent: 0,
    start_date: runDate,
    due_date: newDueDate,
    completed_at: null,
    is_recurring: true,
    created_at: new Date(),
    updated_at: new Date(),
  };
}
