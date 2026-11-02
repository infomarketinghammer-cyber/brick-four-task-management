/**
 * Overdue & Lateness Calculation Engine
 * 
 * These functions exist so the future KRA module can score on-time completions positively
 * and overdue tasks negatively, and completed_on_time is the single field that module will read.
 */

import { Task, TaskStatus } from './types';

/**
 * Checks if a task is currently past its deadline and not yet finished.
 */
export function isTaskLate(task: Partial<Task>, now: Date | string = new Date()): boolean {
  if (!task.due_date) return false;
  const status = task.status;
  if (status === 'COMPLETED' || status === 'CANCELLED') return false;

  const nowMs = new Date(now).getTime();
  const dueMs = new Date(task.due_date).getTime();
  return nowMs > dueMs;
}

/**
 * Applies the sticky overdue rule: once is_overdue is true, it stays true.
 * Never clears the flag for a task that goes back to IN_PROGRESS or SUBMITTED for rework.
 */
export function evaluateOverdue(
  task: Partial<Task>,
  now: Date | string = new Date()
): { is_overdue: boolean; overdue_since: string | null; status: TaskStatus } {
  const currentStatus = task.status || 'TODO';
  
  // If task is already marked overdue stickily, keep it sticky
  if (task.is_overdue) {
    const overdueSince = task.overdue_since
      ? new Date(task.overdue_since).toISOString()
      : task.due_date
      ? new Date(task.due_date).toISOString()
      : new Date(now).toISOString();

    return {
      is_overdue: true,
      overdue_since: overdueSince,
      status: currentStatus,
    };
  }

  // Check if deadline has been breached
  if (isTaskLate(task, now)) {
    const overdueSince = task.due_date
      ? new Date(task.due_date).toISOString()
      : new Date(now).toISOString();

    return {
      is_overdue: true,
      overdue_since: overdueSince,
      status: 'OVERDUE',
    };
  }

  return {
    is_overdue: false,
    overdue_since: null,
    status: currentStatus,
  };
}

/**
 * Evaluates whether a completed task was completed on time.
 * True only when completedAt <= due_date AND is_overdue is false.
 * A task that was ever overdue can never be completed_on_time.
 */
export function evaluateCompletion(
  task: Partial<Task>,
  completedAt: Date | string = new Date()
): { completed_on_time: boolean } {
  if (task.is_overdue) {
    return { completed_on_time: false };
  }

  if (!task.due_date) {
    return { completed_on_time: true };
  }

  const completedMs = new Date(completedAt).getTime();
  const dueMs = new Date(task.due_date).getTime();

  const isOnTime = completedMs <= dueMs && !task.is_overdue;
  return { completed_on_time: isOnTime };
}

/**
 * Calculates lateness in minutes for the KRA module.
 * Positive when late, negative when early, null if no due_date exists.
 */
export function getLatenessMinutes(
  task: Partial<Task>,
  now: Date | string = new Date()
): number | null {
  if (!task.due_date) return null;

  const dueMs = new Date(task.due_date).getTime();
  const referenceMs = task.completed_at
    ? new Date(task.completed_at).getTime()
    : new Date(now).getTime();

  const diffMs = referenceMs - dueMs;
  return Math.round(diffMs / (1000 * 60));
}
