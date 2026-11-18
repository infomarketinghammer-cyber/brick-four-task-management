/**
 * Cron Job Worker Definitions (Overdue Sweep & Reminder Dispatch)
 */

import cron from 'node-cron';
import { tasksStore, NotificationItem } from '../db/tasksStore';
import { persistReminder } from '../db/mongodb';
import { getIO } from '../sockets';

/**
 * JOB 1 & 2: Overdue Sweep (Runs every 5 minutes)
 * Selects active, non-completed tasks past due_date where is_overdue is false,
 * sets is_overdue = true, overdue_since = due_date, status = 'OVERDUE',
 * notifies assignee and assigner, and logs system activity.
 */
export function runOverdueSweep() {
  try {
    const now = new Date();
    for (const task of tasksStore.tasks.values()) {
      if (task.is_deleted) continue;
      if (!task.due_date) continue;

      const dueDate = new Date(task.due_date);
      if (isNaN(dueDate.getTime())) continue;

      // Select tasks past due_date, not COMPLETED or CANCELLED, and where is_overdue is false
      if (
        dueDate < now &&
        !['COMPLETED', 'CANCELLED'].includes(task.status) &&
        !task.is_overdue
      ) {
        const oldStatus = task.status;
        task.is_overdue = true;
        task.overdue_since = new Date(task.due_date).toISOString();
        task.status = 'OVERDUE';
        task.updated_at = now.toISOString();
        // Mutating the object in place doesn't persist it (only .set() triggers the
        // write-through hook) — without this, the periodic Mongo resync overwrites
        // is_overdue back to false and this sweep re-fires the same notification forever.
        tasksStore.tasks.set(task.id, task);

        // Write ActivityLog entry with actor 'SYSTEM'
        tasksStore.activityLogs.unshift({
          id: 'act-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          task_id: task.id,
          task_title: task.title,
          user_id: 'SYSTEM',
          user_name: 'SYSTEM',
          action: 'AUTO_MARKED_OVERDUE',
          field_name: 'status',
          old_value: oldStatus,
          new_value: 'OVERDUE',
          created_at: now.toISOString(),
        });

        // Create Notifications for BOTH assignee and assigner
        const notifAssignee: NotificationItem = {
          id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          user_id: task.assigned_to_id,
          title: `Task Overdue: ${task.title}`,
          message: `Task "${task.title}" has breached its deadline and is marked overdue.`,
          type: 'OVERDUE',
          task_id: task.id,
          is_read: false,
          created_at: now.toISOString(),
        };
        tasksStore.notifications.unshift(notifAssignee);

        if (task.created_by_id && task.created_by_id !== task.assigned_to_id) {
          const notifAssigner: NotificationItem = {
            id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            user_id: task.created_by_id,
            title: `Task Overdue: ${task.title}`,
            message: `Task "${task.title}" assigned to ${task.assigned_to_id} is now overdue.`,
            type: 'OVERDUE',
            task_id: task.id,
            is_read: false,
            created_at: now.toISOString(),
          };
          tasksStore.notifications.unshift(notifAssigner);
        }

        // Emit socket event 'task:status_changed'
        const io = getIO();
        if (io) {
          const payload = {
            task_id: task.id,
            task,
            old_status: oldStatus,
            new_status: 'OVERDUE',
            actor: 'SYSTEM',
          };

          if (task.assigned_to_id) {
            io.to(`user:${task.assigned_to_id}`).emit('task:status_changed', payload);
            io.to(`user:${task.assigned_to_id}`).emit('notification:new', notifAssignee);
          }
          if (task.created_by_id && task.created_by_id !== task.assigned_to_id) {
            io.to(`user:${task.created_by_id}`).emit('task:status_changed', payload);
          }
        }
      }
    }
  } catch (err) {
    console.error('[cron] Overdue sweep error:', err);
  }
}

/**
 * JOB 3: Reminder Dispatch
 * Reads scheduled reminders whose time has passed, creates in-app notifications,
 * sets is_sent = true, and emits 'notification:new' via sockets.
 */
export function runReminderDispatch() {
  try {
    const now = new Date();
    for (const r of tasksStore.reminders) {
      if (r.is_sent) continue;

      const schedTimeStr = r.scheduled_at || r.remind_at;
      if (!schedTimeStr) continue;

      const schedDate = new Date(schedTimeStr);
      if (isNaN(schedDate.getTime())) continue;

      if (schedDate <= now) {
        const task = tasksStore.tasks.get(r.task_id);
        const taskTitle = r.task_title || task?.title || 'Task Reminder';

        const notif: NotificationItem = {
          id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          user_id: r.user_id,
          title: `Reminder: ${taskTitle}`,
          message:
            r.message ||
            (task
              ? `Reminder for task "${task.title}".`
              : 'You have a scheduled task reminder.'),
          type: 'REMINDER',
          task_id: r.task_id,
          is_read: false,
          created_at: now.toISOString(),
        };

        tasksStore.notifications.unshift(notif);
        r.is_sent = true;
        // Mutating the reminder in place doesn't persist it — without this, the periodic
        // Mongo resync reverts is_sent back to false and this dispatch re-fires forever.
        persistReminder(r).catch((e) => console.error('[cron] Failed to persist reminder:', e));

        const io = getIO();
        if (io) {
          io.to(`user:${r.user_id}`).emit('notification:new', notif);
        }
      }
    }
  } catch (err) {
    console.error('[cron] Reminder dispatch error:', err);
  }
}

let lastJobRunAt = Date.now();

/**
 * On Vercel the app runs as a serverless function, so `initializeCronJobs`'s node-cron
 * schedules (which need a persistent process) never fire in production — overdue sweeps
 * and reminder dispatch would silently never run. Called from a request-path middleware
 * instead, time-gated so it only actually does the work every `thresholdMs`.
 */
export function runScheduledJobsIfDue(thresholdMs = 5 * 60 * 1000) {
  const now = Date.now();
  if (now - lastJobRunAt < thresholdMs) return;
  lastJobRunAt = now;
  runOverdueSweep();
  runReminderDispatch();
}

/**
 * Initialize background cron schedules and run boot sweep
 */
export function initializeCronJobs() {
  console.log('[CronWorker] Scheduled task cron jobs initialized.');

  // Startup sweep immediately on boot
  try {
    runOverdueSweep();
  } catch (err) {
    console.error('[cron] Startup overdue sweep error:', err);
  }

  // Startup reminder check
  try {
    runReminderDispatch();
  } catch (err) {
    console.error('[cron] Startup reminder dispatch error:', err);
  }

  // Every 5 minutes: Check overdue tasks ('*/5 * * * *')
  cron.schedule('*/5 * * * *', () => {
    runOverdueSweep();
  });

  // Every 5 minutes: Dispatch due reminders ('*/5 * * * *')
  cron.schedule('*/5 * * * *', () => {
    runReminderDispatch();
  });
}
