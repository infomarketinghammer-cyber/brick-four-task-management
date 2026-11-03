import './src/loadEnv';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';

import authRoutes from './src/modules/auth/auth.routes';
import userRoutes from './src/modules/users/users.routes';
import todosRoutes from './src/modules/todos/todos.routes';
import calendarRoutes from './src/modules/calendar/calendar.routes';
import assistantRoutes from './src/modules/assistant/assistant.routes';
import kpiRoutes from './src/modules/kpi/kpi.routes';
import { calendarStore } from './src/db/calendarStore';
import { errorHandler } from './src/middleware/errorHandler';
import { rateLimit } from './src/middleware/rateLimit';
import { initializeCronJobs } from './src/jobs';
import { initializeSockets, getIO } from './src/sockets';
import { sendSuccess } from './src/utils/envelope';
import { authenticate } from './src/middleware/auth';
import { tasksStore } from './src/db/tasksStore';
import { attachmentsStore, AttachmentRecord, UPLOADS_DIR } from './src/db/attachmentsStore';
import { dbStore } from './src/db/prisma';
import {
  canViewTask,
  canAssignTask,
  canEditTask,
  getSubordinateIds,
  canChangeStatus,
  canEditPriority,
  getTaskActorRole,
  isPeerDeptHeadAssignment,
} from './src/permissions';
import { validateTransition } from './src/taskStateMachine';
import { sanitizeRichText } from './src/utils/sanitizer';
import { evaluateCompletion } from './src/overdueEngine';
import { Task, TaskChecklistItem, User } from './src/types';
import {
  computeTaskProgressAndInfo,
  canMarkCompleted,
  getBlockingChildren,
  propagateProgressUpward,
  backfillAllTasksProgress,
} from './src/progressRollup';
import {
  validateAttachment,
  generateSignedAttachmentUrl,
  verifySignedAttachmentUrl,
} from './src/utils/attachments';
import { AppError } from './src/utils/errors';
import {
  initMongoDB,
  persistConversation,
  persistMessage,
  loadConversationsFromMongo,
  loadMessagesFromMongo,
} from './src/db/mongodb';

/** Builds the Express app with every API route. Shared by the long-running server and the Vercel function. */
export function createApp() {
  const app = express();

  // Security Hardening: Helmet Security Headers (configured for AI Studio preview iframe compatibility)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false, // Disables X-Frame-Options: SAMEORIGIN so AI Studio iframe can render
      contentSecurityPolicy: false, // Disabled for Vite HMR & preview iframe compatibility
    })
  );

  // Ensure iframe header permits embedding in AI Studio preview
  app.use((req, res, next) => {
    res.removeHeader('X-Frame-Options');
    next();
  });

  // Security Hardening: CORS Allowlist
  const corsAllowlist = process.env.CORS_ALLOWLIST
    ? process.env.CORS_ALLOWLIST.split(',').map((s) => s.trim())
    : undefined;

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || !corsAllowlist || corsAllowlist.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS origin '${origin}' not allowed by allowlist policy`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api/v1/auth', authRoutes);

  // Global API Rate Limiting (1000 req per 15 min)
  app.use('/api', rateLimit(15 * 60 * 1000, 1000));

  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1', todosRoutes);
  app.use('/api/v1', calendarRoutes);
  app.use('/api/v1/assistant', rateLimit(15 * 60 * 1000, 60), assistantRoutes);
  app.use('/api/v1/kpi', kpiRoutes);

  // Router for Dashboard, Tasks, Notifications, Conversations & Reports
  const apiRouter = express.Router();
  apiRouter.use(authenticate);

  // Task lookup used by canViewTask to resolve the upstream delegation chain
  const getTask = (id: string) => tasksStore.tasks.get(id);

  // Store an in-app notification and push it to the recipient's socket room
  function notifyUser(userId: string, title: string, message: string, type: string, taskId?: string) {
    const notif = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      user_id: userId,
      title,
      message,
      type,
      task_id: taskId,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    tasksStore.notifications.unshift(notif);
    try {
      getIO()?.to(`user:${userId}`).emit('notification:new', notif);
    } catch (e) {
      console.error('Failed to emit notification event:', e);
    }
  }

  // DASHBOARD KPIS (supports both /dashboard/kpis and /reports/dashboard)
  const getDashboardKPIs = (req: express.Request, res: express.Response) => {
    const userId = req.user?.id || '';
    const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);
    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    const scopedTasks = currentUser.role === 'ADMIN'
      ? allTasks
      : allTasks.filter((t) => canViewTask(currentUser, t, { allUsers, getTask }));

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    // My Open Tasks (assigned to me, not completed/cancelled)
    const myOpen = scopedTasks.filter(
      (t) => t.assigned_to_id === userId && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
    ).length;

    // Due Today (assigned to me, due today, not completed/cancelled)
    const dueToday = scopedTasks.filter((t) => {
      if (t.assigned_to_id !== userId || t.status === 'COMPLETED' || t.status === 'CANCELLED') return false;
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      return d >= todayStart && d <= todayEnd;
    }).length;

    // Overdue (assigned to me or created by me, is_overdue === true and status != COMPLETED or CANCELLED)
    const overdue = scopedTasks.filter((t) => {
      if (t.status === 'COMPLETED' || t.status === 'CANCELLED') return false;
      if (currentUser.role !== 'ADMIN' && t.assigned_to_id !== userId && t.created_by_id !== userId) return false;
      return Boolean(t.is_overdue);
    }).length;

    // Awaiting My Approval (status SUBMITTED or UNDER_REVIEW and created_by_id === userId)
    const awaitingApproval = scopedTasks.filter(
      (t) => (t.created_by_id === userId || currentUser.role === 'ADMIN') && (t.status === 'SUBMITTED' || t.status === 'UNDER_REVIEW')
    ).length;

    // Completed This Week (assigned to me or created by me)
    const completedThisWeek = scopedTasks.filter((t) => {
      if (t.status !== 'COMPLETED' || !t.completed_at) return false;
      if (currentUser.role !== 'ADMIN' && t.assigned_to_id !== userId && t.created_by_id !== userId) return false;
      return new Date(t.completed_at) >= weekAgo;
    }).length;

    res.json(
      sendSuccess({
        myOpen,
        dueToday,
        overdue,
        awaitingApproval,
        completedThisWeek,
      })
    );
  };

  apiRouter.get('/dashboard/kpis', getDashboardKPIs);
  apiRouter.get('/reports/dashboard', getDashboardKPIs);

  // MY TASKS
  apiRouter.get('/tasks/my-tasks', (req, res) => {
    const userId = req.user?.id || '';
    const myTasks = Array.from(tasksStore.tasks.values()).filter(
      (t) => t.assigned_to_id === userId && !t.is_deleted
    );
    res.json(sendSuccess(myTasks));
  });

  // DELEGATED BY ME TASKS
  apiRouter.get('/tasks/delegated', (req, res) => {
    const userId = req.user?.id || '';
    const delegatedTasks = Array.from(tasksStore.tasks.values()).filter(
      (t) => t.created_by_id === userId && t.assigned_to_id !== userId && !t.is_deleted
    );
    res.json(sendSuccess(delegatedTasks));
  });

  // Helper to enrich a task with 3-tier progress_info, checklist & attachment counts
  function enrichTaskWithProgressAndChecklist(task: Task): Task {
    const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);
    const checklistItems = Array.from(tasksStore.checklistItems.values());
    const taskChecklist = checklistItems
      .filter((c) => c.task_id === task.id)
      .sort((a, b) => a.position - b.position);

    const result = computeTaskProgressAndInfo(task, allTasks, checklistItems);

    const taskAtts = attachmentsStore.getByTask(task.id);
    const attachment_count = taskAtts.length;
    const currentRound = task.submission_count || 1;
    const submitted_attachment_count = taskAtts.filter(
      (a) => a.context === 'SUBMISSION' && a.submission_round === currentRound
    ).length;

    const assigneeUser = dbStore.users.get(task.assigned_to_id);
    const creatorUser = dbStore.users.get(task.created_by_id);

    // Everyone the work has been delegated to beneath this task (all depths)
    const delegated_to: Array<{
      task_id: string;
      task_title: string;
      user_id: string;
      user_name: string;
      department: string;
      delegated_by_name: string;
      status: string;
      depth: number;
    }> = [];
    const queue = [task.id];
    const seen = new Set<string>(queue);
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const child of allTasks) {
        if (child.parent_task_id !== parentId || seen.has(child.id)) continue;
        seen.add(child.id);
        queue.push(child.id);
        const childAssignee = dbStore.users.get(child.assigned_to_id);
        const childDelegator = dbStore.users.get(child.created_by_id);
        delegated_to.push({
          task_id: child.id,
          task_title: child.title,
          user_id: child.assigned_to_id,
          user_name: childAssignee?.name || child.assigned_to_id,
          department: childAssignee?.department || '',
          delegated_by_name: childDelegator?.name || child.created_by_id,
          status: child.status,
          depth: child.depth || 0,
        });
      }
    }

    return {
      ...task,
      delegated_to,
      assigned_to_department: assigneeUser?.department || null,
      assigned_to_name: assigneeUser ? assigneeUser.name : (task as any).assigned_to_name || task.assigned_to_id,
      created_by_name: creatorUser ? creatorUser.name : (task as any).created_by_name || task.created_by_id,
      submission_count: task.submission_count || 0,
      last_submitted_at: task.last_submitted_at || null,
      attachment_count,
      submitted_attachment_count,
      progress_percent: result.progress,
      progress_info: result.info,
      checklist: taskChecklist,
    };
  }

  // Initial Backfill of Progress for all seeded tasks
  backfillAllTasksProgress(
    Array.from(tasksStore.tasks.values()),
    Array.from(tasksStore.checklistItems.values())
  );

  // ALL TASKS WITH PERMISSION SCOPING AND FILTERS
  apiRouter.get('/tasks', (req, res) => {
    let all = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);
    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    // SECURITY: Scope tasks by permission layer
    all = all.filter((t) => canViewTask(currentUser, t, { allUsers, getTask }));

    const { status, priority, assignee_id, search, view, is_overdue, parent_task_id } = req.query;

    if (parent_task_id) {
      all = all.filter((t) => t.parent_task_id === String(parent_task_id));
    }

    if (view === 'my') {
      all = all.filter((t) => t.assigned_to_id === currentUser.id);
    } else if (view === 'assigned_by_me' || view === 'delegated') {
      all = all.filter((t) => t.created_by_id === currentUser.id && t.assigned_to_id !== currentUser.id);
    }

    if (String(is_overdue) === 'true') {
      all = all.filter((t) => t.is_overdue);
    } else if (status && status !== 'ALL') {
      if (status === 'OVERDUE') {
        all = all.filter((t) => t.is_overdue);
      } else {
        all = all.filter((t) => t.status === status);
      }
    }
    if (priority && priority !== 'ALL') {
      all = all.filter((t) => t.priority === priority);
    }
    if (assignee_id) {
      all = all.filter((t) => t.assigned_to_id === assignee_id);
    }
    if (search) {
      const q = String(search).toLowerCase();
      all = all.filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
    }

    const enrichedTasks = all.map((t) => enrichTaskWithProgressAndChecklist(t));

    res.json(sendSuccess({ tasks: enrichedTasks, total: enrichedTasks.length }));
  });

  // GET SINGLE TASK BY ID WITH STRICT PERMISSION CHECKING
  apiRouter.get('/tasks/:id', (req, res, next) => {
    const task = tasksStore.tasks.get(req.params.id);
    if (!task || task.is_deleted) {
      return next(AppError.notFound(`Task with ID ${req.params.id} not found`));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    // SECURITY: Scope check - verify user can view this task
    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to view or access this task'));
    }

    const enriched = enrichTaskWithProgressAndChecklist(task);
    res.json(sendSuccess(enriched));
  });

  // CREATE TASK WITH SERVER-SIDE HTML SANITIZATION & ASSIGNMENT CHECK
  apiRouter.post('/tasks', (req, res, next) => {
    const {
      title,
      description,
      assigned_to_id,
      priority,
      start_date,
      due_date,
      is_recurring,
      recurrence_pattern,
      reminders,
    } = req.body;

    if (!title) {
      return next(AppError.badRequest('Task title is required'));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    const activeSubordinatesCount = allUsers.filter(
      (u) => u.manager_id === currentUser.id && u.is_active
    ).length;

    const assignee = assigned_to_id ? dbStore.users.get(assigned_to_id) : currentUser;
    if (assigned_to_id && !assignee) {
      return next(AppError.notFound(`Assignee user ${assigned_to_id} not found`));
    }
    if (assignee && assignee.id !== currentUser.id) {
      const isPeerHead = isPeerDeptHeadAssignment(currentUser, assignee);
      if (currentUser.role !== 'ADMIN' && !isPeerHead && activeSubordinatesCount === 0) {
        return next(AppError.forbidden('User has zero subordinates and cannot assign tasks to others'));
      }
      if (!canAssignTask(currentUser, assignee, allUsers)) {
        return next(AppError.forbidden(`Cannot assign tasks to ${assignee.name} due to hierarchy rules`));
      }
    }

    // SECURITY: Sanitize rich-text description before storing
    const cleanDescription = sanitizeRichText(description || '');

    const taskId = 'tsk-' + Date.now();
    const newTask = {
      id: taskId,
      title: title.trim(),
      description: cleanDescription,
      created_by_id: currentUser.id,
      assigned_to_id: assignee ? assignee.id : currentUser.id,
      parent_task_id: null,
      root_task_id: taskId,
      depth: 0,
      status: 'TODO' as const,
      priority: (priority || 'CRITICAL') as any,
      start_date: start_date ? new Date(start_date).toISOString() : new Date().toISOString(),
      due_date: due_date ? new Date(due_date).toISOString() : null,
      progress_percent: 0,
      is_recurring: Boolean(is_recurring),
      recurrence_pattern: is_recurring ? recurrence_pattern || 'DAILY' : null,
      submission_count: 0,
      last_submitted_at: null,
      first_submitted_at: null,
      is_overdue: false,
      overdue_since: null,
      completed_on_time: null,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    tasksStore.tasks.set(taskId, newTask);
    calendarStore.syncTaskDeadlineEvent(newTask);

    // Save reminders if provided
    if (Array.isArray(reminders)) {
      reminders.forEach((r: any, idx: number) => {
        const rType = r.type || 'RELATIVE';
        const relativeMinutes = Number(r.relativeMinutes ?? r.relative_minutes_before ?? 15);
        let scheduledAt: string | null = null;

        if (rType === 'RELATIVE') {
          if (!newTask.due_date) {
            return; // Skip relative reminder if task has no due_date
          }
          const dueDateMs = new Date(newTask.due_date).getTime();
          scheduledAt = new Date(dueDateMs - relativeMinutes * 60 * 1000).toISOString();
        } else if (rType === 'ABSOLUTE') {
          const rawScheduled = r.scheduledAt || r.scheduled_at;
          if (rawScheduled) {
            scheduledAt = new Date(rawScheduled).toISOString();
          }
        }

        if (!scheduledAt) return;

        // Create reminder for ASSIGNEE and ASSIGNER (if different)
        const targetUserIds = [newTask.assigned_to_id];
        if (newTask.created_by_id && newTask.created_by_id !== newTask.assigned_to_id) {
          targetUserIds.push(newTask.created_by_id);
        }

        targetUserIds.forEach((uid) => {
          tasksStore.reminders.push({
            id: `rem-${taskId}-${uid}-${idx}`,
            task_id: taskId,
            task_title: newTask.title,
            user_id: uid,
            type: rType,
            relative_minutes_before: relativeMinutes,
            scheduled_at: scheduledAt,
            remind_at: scheduledAt,
            is_sent: false,
          });
        });
      });
    }

    // Push real-time notification to assignee
    if (newTask.assigned_to_id !== currentUser.id) {
      notifyUser(
        newTask.assigned_to_id,
        'New Task Assigned',
        `${currentUser.name || 'A manager'} assigned you task: "${newTask.title}"`,
        'TASK_ASSIGNED',
        newTask.id
      );
    }

    res.status(201).json(sendSuccess(newTask));
  });

  // UPDATE TASK (PATCH /tasks/:id)
  apiRouter.patch('/tasks/:id', (req, res, next) => {
    const task = tasksStore.tasks.get(req.params.id);
    if (!task || task.is_deleted) {
      return next(AppError.notFound(`Task with ID ${req.params.id} not found`));
    }

    const currentUserId = req.user?.id || 'usr-admin-001';
    const currentUser: User = (req as any).fullUser || dbStore.users.get(currentUserId) || {
      id: currentUserId,
      name: (req.user as any)?.name || 'Admin',
      email: (req.user as any)?.email || 'admin@company.com',
      role: req.user?.role || 'ADMIN',
      hierarchy_level: req.user?.hierarchy_level ?? 0,
      department: 'Executive',
      designation: 'Administrator',
      manager_id: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { status, priority, progress_percent, assigned_to_id, title, description, due_date } = req.body;
    const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);
    const allUsers = Array.from(dbStore.users.values());

    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to update this task'));
    }

    // Upstream monitors (e.g. the requesting head) can view & comment, but only assigner/assignee edit
    const editorRole = getTaskActorRole(currentUser, task);
    if (editorRole === 'OTHER' && (description !== undefined || progress_percent !== undefined)) {
      return next(AppError.forbidden('Only the assigner or assignee can edit this task'));
    }
    if (editorRole !== 'ASSIGNER' && (title !== undefined || due_date !== undefined || assigned_to_id !== undefined)) {
      return next(AppError.forbidden('Only the task assigner can change title, due date or assignee'));
    }
    if (assigned_to_id !== undefined && assigned_to_id !== task.assigned_to_id) {
      const newAssignee = dbStore.users.get(assigned_to_id);
      if (!newAssignee || !canAssignTask(currentUser, newAssignee, allUsers)) {
        return next(AppError.forbidden('Cannot reassign this task to the selected user due to hierarchy rules'));
      }
    }

    // c) PRIORITY: if priority is present in body and changed, verify permissions
    if (priority !== undefined && priority !== task.priority) {
      if (!canEditPriority(currentUser, task)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'PRIORITY_EDIT_FORBIDDEN',
            message: 'Only the task assigner can change priority.',
          },
        });
      }
    }

    // b) Explicitly reject client-supplied 'OVERDUE' & a) STATUS transition checks
    if (status !== undefined && status !== task.status) {
      if (status === 'OVERDUE') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'OVERDUE_IS_SYSTEM_MANAGED',
            message: 'Only system triggers can mark a task as OVERDUE.',
          },
        });
      }

      const actorRole = getTaskActorRole(currentUser, task);
      if (actorRole === 'OTHER') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'STATUS_TRANSITION_FORBIDDEN',
            message: 'You do not have permission to change the status of this task.',
          },
        });
      }

      try {
        validateTransition(task.status, status, actorRole, {
          completed_at: task.completed_at,
          userRole: currentUser.role,
          isAdmin: currentUser.role === 'ADMIN',
        });
      } catch (err: any) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'STATUS_TRANSITION_FORBIDDEN',
            message: err.reason || err.message || 'Status transition forbidden',
          },
        });
      }

      // d) Completion Constraint Check: A parent cannot be set COMPLETED while any child is not COMPLETED or CANCELLED
      if (status === 'COMPLETED') {
        const blockingChildren = getBlockingChildren(task, allTasks);
        if (blockingChildren.length > 0) {
          return res.status(409).json({
            status: 'error',
            error: {
              message: 'Parent task cannot be marked COMPLETED while subtasks are incomplete.',
              code: 'PARENT_HAS_INCOMPLETE_CHILDREN',
              details: {
                blocking_tasks: blockingChildren.map((c) => ({
                  id: c.id,
                  title: c.title,
                  status: c.status,
                })),
              },
            },
          });
        }
      }
    }

    // Apply status change
    if (status !== undefined && status !== task.status) {
      const isTransitionToSubmitted = status === 'SUBMITTED' && task.status !== 'SUBMITTED';

      task.status = status;
      task.is_manual_progress = false;

      const nowIso = new Date().toISOString();

      if (status === 'COMPLETED') {
        task.completed_at = nowIso;
        const compEval = evaluateCompletion(task, nowIso);
        task.completed_on_time = compEval.completed_on_time;
      } else {
        task.completed_at = null;
        task.completed_on_time = null;
      }

      if (isTransitionToSubmitted) {
        task.submission_count = (task.submission_count || 0) + 1;
        task.last_submitted_at = nowIso;
        if (!task.first_submitted_at) {
          task.first_submitted_at = nowIso;
        }

        tasksStore.activityLogs.unshift({
          id: 'act-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          task_id: task.id,
          task_title: task.title,
          user_id: currentUser.id,
          user_name: (currentUser as any).name || 'System User',
          action: 'TASK_SUBMITTED',
          field_name: 'submission_round',
          new_value: String(task.submission_count),
          created_at: nowIso,
        });
      }
    }

    // Manual slider update (allowed between 1-99% only for Tier 2 leaf tasks in IN_PROGRESS)
    if (progress_percent !== undefined) {
      const activeChildren = allTasks.filter((c) => c.parent_task_id === task.id);
      const taskChecklist = Array.from(tasksStore.checklistItems.values()).filter((c) => c.task_id === task.id);

      if (activeChildren.length === 0 && taskChecklist.length === 0 && task.status === 'IN_PROGRESS') {
        const val = Number(progress_percent);
        task.progress_percent = Math.min(99, Math.max(1, val));
        task.is_manual_progress = true;
      }
    }

    if (priority !== undefined) task.priority = priority;
    if (assigned_to_id !== undefined) task.assigned_to_id = assigned_to_id;
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = sanitizeRichText(description);
    if (due_date !== undefined) task.due_date = due_date;

    task.updated_at = new Date().toISOString();
    tasksStore.tasks.set(task.id, task);
    calendarStore.syncTaskDeadlineEvent(task);

    // Recalculate & Propagate progress upward via root_task_id
    const checklistItems = Array.from(tasksStore.checklistItems.values());
    propagateProgressUpward(task.id, allTasks, checklistItems);

    // f) Log update in activity feed
    const actorRole = getTaskActorRole(currentUser, task);
    const roleLabel = actorRole === 'ASSIGNER' ? 'assigner' : actorRole === 'ASSIGNEE' ? 'assignee' : 'user';

    tasksStore.activityLogs.unshift({
      id: 'act-' + Date.now(),
      task_id: task.id,
      task_title: task.title,
      user_id: currentUser.id,
      user_name: (currentUser as any).name || 'System User',
      action: status ? `STATUS_CHANGED_TO_${status}` : 'TASK_UPDATED',
      field_name: status ? 'status' : 'task',
      new_value: status ? `${status} (by ${roleLabel})` : String(task.progress_percent),
      created_at: new Date().toISOString(),
    });

    const enriched = enrichTaskWithProgressAndChecklist(task);
    res.json(sendSuccess(enriched));
  });

  // TASK CHECKLIST ENDPOINTS
  apiRouter.get('/tasks/:taskId/checklist', (req, res, next) => {
    const task = tasksStore.tasks.get(req.params.taskId);
    if (!task || task.is_deleted) {
      return next(AppError.notFound('Task not found'));
    }
    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to view this task checklist'));
    }

    const items = Array.from(tasksStore.checklistItems.values())
      .filter((i) => i.task_id === req.params.taskId)
      .sort((a, b) => a.position - b.position);

    res.json(sendSuccess(items));
  });

  apiRouter.post('/tasks/:taskId/checklist', (req, res, next) => {
    const task = tasksStore.tasks.get(req.params.taskId);
    if (!task || task.is_deleted) {
      return next(AppError.notFound('Task not found'));
    }
    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to modify this task checklist'));
    }

    const { title, position } = req.body;
    if (!title || !String(title).trim()) {
      return next(AppError.badRequest('Checklist item title is required'));
    }

    const existingItems = Array.from(tasksStore.checklistItems.values()).filter(
      (i) => i.task_id === req.params.taskId
    );
    const nextPos = position !== undefined ? Number(position) : existingItems.length + 1;

    const newItem: TaskChecklistItem = {
      id: 'chk-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      task_id: req.params.taskId,
      title: String(title).trim(),
      is_done: false,
      position: nextPos,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    tasksStore.checklistItems.set(newItem.id, newItem);

    // Recalculate task progress and propagate upward
    const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);
    const allChecklist = Array.from(tasksStore.checklistItems.values());
    propagateProgressUpward(task.id, allTasks, allChecklist);

    const updatedTask = enrichTaskWithProgressAndChecklist(task);

    res.status(201).json(
      sendSuccess({
        item: newItem,
        task: updatedTask,
      })
    );
  });

  apiRouter.patch('/tasks/:taskId/checklist/:itemId', (req, res, next) => {
    const item = tasksStore.checklistItems.get(req.params.itemId);
    if (!item || item.task_id !== req.params.taskId) {
      return next(AppError.notFound('Checklist item not found'));
    }

    const task = tasksStore.tasks.get(req.params.taskId);
    if (!task || task.is_deleted) {
      return next(AppError.notFound('Task not found'));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to modify this task checklist'));
    }

    const { title, is_done, position } = req.body;
    if (title !== undefined) item.title = String(title).trim();
    if (is_done !== undefined) item.is_done = Boolean(is_done);
    if (position !== undefined) item.position = Number(position);
    item.updated_at = new Date().toISOString();

    tasksStore.checklistItems.set(item.id, item);

    if (task) {
      const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);
      const allChecklist = Array.from(tasksStore.checklistItems.values());
      propagateProgressUpward(task.id, allTasks, allChecklist);
    }

    const updatedTask = task ? enrichTaskWithProgressAndChecklist(task) : null;

    res.json(
      sendSuccess({
        item,
        task: updatedTask,
      })
    );
  });

  apiRouter.delete('/tasks/:taskId/checklist/:itemId', (req, res, next) => {
    const item = tasksStore.checklistItems.get(req.params.itemId);
    if (!item || item.task_id !== req.params.taskId) {
      return next(AppError.notFound('Checklist item not found'));
    }

    const task = tasksStore.tasks.get(req.params.taskId);
    if (!task || task.is_deleted) {
      return next(AppError.notFound('Task not found'));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to delete items from this checklist'));
    }

    tasksStore.checklistItems.delete(req.params.itemId);

    if (task) {
      const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);
      const allChecklist = Array.from(tasksStore.checklistItems.values());
      propagateProgressUpward(task.id, allTasks, allChecklist);
    }

    const updatedTask = task ? enrichTaskWithProgressAndChecklist(task) : null;

    res.json(
      sendSuccess({
        deleted_id: req.params.itemId,
        task: updatedTask,
      })
    );
  });

  apiRouter.put('/tasks/:taskId/checklist/reorder', (req, res, next) => {
    const task = tasksStore.tasks.get(req.params.taskId);
    if (!task || task.is_deleted) {
      return next(AppError.notFound('Task not found'));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to reorder this task checklist'));
    }

    const { items } = req.body;
    if (Array.isArray(items)) {
      for (const re of items) {
        const existing = tasksStore.checklistItems.get(re.id);
        if (existing && existing.task_id === req.params.taskId) {
          existing.position = Number(re.position);
          tasksStore.checklistItems.set(existing.id, existing);
        }
      }
    }

    if (task) {
      const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);
      const allChecklist = Array.from(tasksStore.checklistItems.values());
      propagateProgressUpward(task.id, allTasks, allChecklist);
    }

    const updatedTask = task ? enrichTaskWithProgressAndChecklist(task) : null;
    const checklist = Array.from(tasksStore.checklistItems.values())
      .filter((i) => i.task_id === req.params.taskId)
      .sort((a, b) => a.position - b.position);

    res.json(sendSuccess({ checklist, task: updatedTask }));
  });

  // TASK DELEGATION CHAIN / LINEAGE BREADCRUMB
  apiRouter.get('/tasks/:id/lineage', (req, res, next) => {
    const currentTask = tasksStore.tasks.get(req.params.id);
    if (!currentTask || currentTask.is_deleted) {
      return next(AppError.notFound(`Task with ID ${req.params.id} not found`));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, currentTask, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to view this task lineage'));
    }

    const lineage: Array<{ id: string; title: string; depth: number; status: string }> = [];
    let curr: Task | null | undefined = currentTask;
    let guard = 0;

    while (curr && guard < 10) {
      lineage.unshift({
        id: curr.id,
        title: curr.title,
        depth: curr.depth || 0,
        status: curr.status,
      });
      if (curr.parent_task_id) {
        curr = tasksStore.tasks.get(curr.parent_task_id);
      } else {
        curr = null;
      }
      guard++;
    }

    res.json(sendSuccess(lineage));
  });

  // DELEGATE TASK TO SUBORDINATE
  apiRouter.post('/tasks/:id/delegate', (req, res, next) => {
    const parentTask = tasksStore.tasks.get(req.params.id);
    if (!parentTask || parentTask.is_deleted) {
      return next(AppError.notFound(`Task with ID ${req.params.id} not found`));
    }

    const { subordinate_id, title, description, due_date, priority } = req.body;
    if (!subordinate_id) {
      return next(AppError.badRequest('Subordinate ID is required for task delegation'));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, parentTask, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to delegate this task'));
    }

    const activeSubordinatesCount = allUsers.filter(
      (u) => u.manager_id === currentUser.id && u.is_active
    ).length;

    const subordinate = dbStore.users.get(subordinate_id);
    if (!subordinate) {
      return next(AppError.notFound(`Subordinate user ${subordinate_id} not found`));
    }

    if (
      currentUser.role !== 'ADMIN' &&
      activeSubordinatesCount === 0 &&
      !isPeerDeptHeadAssignment(currentUser, subordinate)
    ) {
      return next(AppError.forbidden('User has zero subordinates and cannot delegate tasks'));
    }

    if (!canAssignTask(currentUser, subordinate, allUsers)) {
      return next(AppError.forbidden(`Cannot delegate task to ${subordinate.name} due to hierarchy rules`));
    }

    const newTaskId = 'tsk-del-' + Date.now();
    const subtask: Task = {
      id: newTaskId,
      title: title || `[Delegated] ${parentTask.title}`,
      description: sanitizeRichText(description || parentTask.description || ''),
      created_by_id: currentUser.id,
      assigned_to_id: subordinate.id,
      parent_task_id: parentTask.id,
      root_task_id: parentTask.root_task_id || parentTask.id,
      depth: (parentTask.depth || 0) + 1,
      status: 'TODO',
      priority: priority || 'CRITICAL',
      start_date: new Date().toISOString(),
      due_date: due_date || parentTask.due_date,
      progress_percent: 0,
      is_recurring: false,
      submission_count: 0,
      last_submitted_at: null,
      first_submitted_at: null,
      is_overdue: false,
      overdue_since: null,
      completed_on_time: null,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    tasksStore.tasks.set(newTaskId, subtask);
    calendarStore.syncTaskDeadlineEvent(subtask);

    // Recalculate & propagate progress upward since parentTask now has subtasks (Tier 3)
    const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);
    const allChecklist = Array.from(tasksStore.checklistItems.values());
    propagateProgressUpward(newTaskId, allTasks, allChecklist);

    // Activity Log
    tasksStore.activityLogs.unshift({
      id: 'act-' + Date.now(),
      task_id: parentTask.id,
      task_title: parentTask.title,
      user_id: currentUser.id,
      user_name: currentUser.name || 'Manager',
      action: 'DELEGATED_SUBTASK',
      field_name: 'assigned_to',
      new_value: `${subordinate.name} (${newTaskId})`,
      created_at: new Date().toISOString(),
    });

    // Notify the new assignee, plus everyone upstream in the chain so requesting heads can see who picked it up
    notifyUser(
      subordinate.id,
      'Task Delegated To You',
      `${currentUser.name || 'Your manager'} delegated: "${subtask.title}"`,
      'TASK_DELEGATED',
      newTaskId
    );
    const upstreamUserIds = new Set<string>();
    const visitedAncestors = new Set<string>();
    let ancestor: Task | undefined = parentTask;
    while (ancestor && !visitedAncestors.has(ancestor.id)) {
      visitedAncestors.add(ancestor.id);
      upstreamUserIds.add(ancestor.created_by_id);
      upstreamUserIds.add(ancestor.assigned_to_id);
      ancestor = ancestor.parent_task_id ? tasksStore.tasks.get(ancestor.parent_task_id) : undefined;
    }
    upstreamUserIds.delete(currentUser.id);
    upstreamUserIds.delete(subordinate.id);
    upstreamUserIds.forEach((uid) =>
      notifyUser(
        uid,
        'Task Delegated',
        `${currentUser.name || 'A manager'} delegated "${parentTask.title}" to ${subordinate.name} (${subordinate.department})`,
        'TASK_DELEGATED',
        newTaskId
      )
    );

    const enrichedSubtask = enrichTaskWithProgressAndChecklist(subtask);
    res.status(201).json(sendSuccess(enrichedSubtask));
  });

  // COMMENTS FOR TASK
  const taskCommentsStore = new Map<string, Array<{
    id: string;
    task_id: string;
    user_id: string;
    user_name: string;
    user_designation: string;
    content: string;
    attachment_ids?: string[];
    created_at: string;
  }>>();

  // Resolve a comment's attachment ids to the attachment records that still exist
  const withCommentAttachments = <T extends { attachment_ids?: string[] }>(comment: T) => ({
    ...comment,
    attachments: (comment.attachment_ids || [])
      .map((attId) => attachmentsStore.getById(attId))
      .filter((a): a is AttachmentRecord => Boolean(a)),
  });

  // Seed sample comment for tsk-001 / tsk-002
  taskCommentsStore.set('tsk-001', [
    {
      id: 'cmt-1',
      task_id: 'tsk-001',
      user_id: 'usr-dept-eng',
      user_name: 'Employee',
      user_designation: 'VP of Engineering',
      content: 'Phase 1 architecture blueprint approved. Proceeding with frontend component suite optimizations.',
      created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    },
  ]);

  apiRouter.get('/tasks/:id/comments', (req, res, next) => {
    const task = tasksStore.tasks.get(req.params.id);
    if (!task || task.is_deleted) {
      return next(AppError.notFound(`Task with ID ${req.params.id} not found`));
    }
    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;
    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to view this task comments'));
    }

    const comments = taskCommentsStore.get(req.params.id) || [];
    res.json(sendSuccess(comments.map(withCommentAttachments)));
  });

  apiRouter.post('/tasks/:id/comments', (req, res, next) => {
    const task = tasksStore.tasks.get(req.params.id);
    if (!task || task.is_deleted) {
      return next(AppError.notFound(`Task with ID ${req.params.id} not found`));
    }
    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || req.user || {
      id: 'usr-admin-001',
      name: 'Admin',
      designation: 'Administrator',
      role: 'ADMIN',
      hierarchy_level: 0,
    };
    if (!canViewTask(currentUser as any, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to comment on this task'));
    }

    const { content, attachment_ids } = req.body;

    // Only link attachments that were uploaded to this same task
    const linkedAttachmentIds: string[] = Array.isArray(attachment_ids)
      ? attachment_ids.filter((attId: unknown) => {
          if (typeof attId !== 'string') return false;
          const att = attachmentsStore.getById(attId);
          return Boolean(att && att.task_id === task.id);
        })
      : [];

    const text = typeof content === 'string' ? content.trim() : '';
    if (!text && linkedAttachmentIds.length === 0) {
      return next(AppError.badRequest('Comment content cannot be empty'));
    }

    const cleanContent = sanitizeRichText(text);
    const newComment = {
      id: 'cmt-' + Date.now(),
      task_id: req.params.id,
      user_id: currentUser.id,
      user_name: (currentUser as any).name || 'User',
      user_designation: (currentUser as any).designation || 'Team Member',
      content: cleanContent,
      attachment_ids: linkedAttachmentIds,
      created_at: new Date().toISOString(),
    };

    const existing = taskCommentsStore.get(req.params.id) || [];
    existing.push(newComment);
    taskCommentsStore.set(req.params.id, existing);

    // Let the other side of the task know a reply came in
    new Set([task.created_by_id, task.assigned_to_id]).forEach((uid) => {
      if (uid && uid !== currentUser.id) {
        const fileNote = linkedAttachmentIds.length > 0 ? ` with ${linkedAttachmentIds.length} document(s)` : '';
        notifyUser(
          uid,
          'New Reply on Task',
          `${newComment.user_name} replied on "${task.title}"${fileNote}`,
          'COMMENT_ADDED',
          task.id
        );
      }
    });

    res.status(201).json(sendSuccess(withCommentAttachments(newComment)));
  });

  // TASK ACTIVITY LOGS
  apiRouter.get('/tasks/:id/activity', (req, res, next) => {
    const task = tasksStore.tasks.get(req.params.id);
    if (!task || task.is_deleted) {
      return next(AppError.notFound(`Task with ID ${req.params.id} not found`));
    }
    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;
    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to view activity for this task'));
    }

    const logs = tasksStore.activityLogs.filter((log) => log.task_id === req.params.id);
    res.json(sendSuccess(logs));
  });

  // MULTER CONFIGURATION FOR ATTACHMENT UPLOADS
  const multerStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      }
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const random = Math.random().toString(36).substring(2, 8);
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, `${Date.now()}-${random}-${sanitizedName}`);
    },
  });

  const upload = multer({
    storage: multerStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 5,
    },
    fileFilter: (_req, file, cb) => {
      const val = validateAttachment(file.mimetype, 0);
      if (!val.valid) {
        cb(new Error(val.error || 'Invalid attachment type'));
        return;
      }
      cb(null, true);
    },
  });

  // REAL ATTACHMENTS PIPELINE ENDPOINTS

  // POST /api/v1/tasks/:taskId/attachments
  apiRouter.post('/tasks/:taskId/attachments', (req, res, next) => {
    const taskId = req.params.taskId;
    const task = tasksStore.tasks.get(taskId);
    if (!task || task.is_deleted) {
      return next(AppError.notFound(`Task with ID ${taskId} not found`));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
      name: (req.user as any)?.name || 'User',
    } as any;

    // Enforce canViewTask check FIRST
    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to access or view this task'));
    }

    upload.array('files', 5)(req, res, (err: any) => {
      if (err) {
        return next(AppError.badRequest(err.message || 'File upload failed'));
      }

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        return next(AppError.badRequest('No files provided in request'));
      }

      const context = req.body.context === 'SUBMISSION' ? 'SUBMISSION' : 'REFERENCE';

      // Only assignee may upload with context 'SUBMISSION'
      if (context === 'SUBMISSION') {
        const actorRole = getTaskActorRole(currentUser, task);
        if (currentUser.id !== task.assigned_to_id && actorRole !== 'ASSIGNEE') {
          return next(AppError.forbidden('Only the assigned user can upload submission attachments'));
        }
      }

      // Calculate submission_round from task's current submission counter
      const submission_round = task.status === 'SUBMITTED' ? (task.submission_count || 1) : (task.submission_count || 0) + 1;

      const createdRecords: AttachmentRecord[] = [];
      for (const file of files) {
        const record: AttachmentRecord = {
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          task_id: task.id,
          uploaded_by_id: currentUser.id,
          uploaded_by_name: currentUser.name || (currentUser as any).user_name || 'User',
          file_key: file.filename,
          file_name: file.originalname,
          mime_type: file.mimetype,
          size_bytes: file.size,
          context,
          submission_round,
          created_at: new Date().toISOString(),
        };
        attachmentsStore.create(record);
        createdRecords.push(record);
      }

      // Write ActivityLog entry
      tasksStore.activityLogs.unshift({
        id: 'act-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        task_id: task.id,
        task_title: task.title,
        user_id: currentUser.id,
        user_name: currentUser.name || 'User',
        action: 'ATTACHMENT_UPLOADED',
        field_name: 'attachments',
        new_value: `${createdRecords.length} file(s) attached (${context})`,
        created_at: new Date().toISOString(),
      });

      res.status(201).json(sendSuccess(createdRecords));
    });
  });

  // GET /api/v1/tasks/:taskId/attachments
  apiRouter.get('/tasks/:taskId/attachments', (req, res, next) => {
    const taskId = req.params.taskId;
    const task = tasksStore.tasks.get(taskId);
    if (!task || task.is_deleted) {
      return next(AppError.notFound(`Task with ID ${taskId} not found`));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to view attachments for this task'));
    }

    const attachments = attachmentsStore.getByTask(taskId);
    res.json(sendSuccess(attachments));
  });

  // GET /api/v1/attachments/:id/download
  apiRouter.get('/attachments/:id/download', (req, res, next) => {
    const attId = req.params.id;
    let att = attachmentsStore.getById(attId);
    if (!att) {
      att = attachmentsStore.getByFileKey(attId);
    }

    if (!att) {
      return next(AppError.notFound('Attachment record not found'));
    }

    const task = tasksStore.tasks.get(att.task_id);
    if (!task || task.is_deleted) {
      return next(AppError.notFound('Parent task not found'));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('You do not have permission to view or download attachments for this task'));
    }

    const filePath = path.join(UPLOADS_DIR, att.file_key);
    if (!fs.existsSync(filePath)) {
      return next(AppError.notFound('File missing from disk storage'));
    }

    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.file_name)}"`);
    res.sendFile(filePath);
  });

  // GET /api/v1/attachments/download (query parameter fallback)
  apiRouter.get('/attachments/download', (req, res, next) => {
    const fileKey = req.query.key as string;
    const expires = Number(req.query.expires);
    const sig = req.query.sig as string;

    if (!fileKey) {
      return next(AppError.badRequest('Missing key query parameter'));
    }

    if (expires && sig) {
      const isValid = verifySignedAttachmentUrl(fileKey, expires, sig);
      if (!isValid) {
        return next(AppError.forbidden('Attachment signature is invalid or link has expired'));
      }
    }

    const att = attachmentsStore.getByFileKey(fileKey);
    const filePath = path.join(UPLOADS_DIR, fileKey);
    if (!fs.existsSync(filePath)) {
      return next(AppError.notFound('File missing from disk storage'));
    }

    if (att) {
      const task = tasksStore.tasks.get(att.task_id);
      if (task) {
        const allUsers = Array.from(dbStore.users.values());
        const currentUser = req.fullUser || {
          id: req.user?.id || '',
          role: req.user?.role || 'EXECUTIVE',
          hierarchy_level: req.user?.hierarchy_level ?? 3,
        } as any;
        if (!canViewTask(currentUser, task, { allUsers, getTask })) {
          return next(AppError.forbidden('Access denied to file'));
        }
      }
      res.setHeader('Content-Type', att.mime_type);
      return res.sendFile(filePath);
    }

    res.sendFile(filePath);
  });

  // DELETE /api/v1/attachments/:id
  apiRouter.delete('/attachments/:id', (req, res, next) => {
    const attId = req.params.id;
    const att = attachmentsStore.getById(attId);
    if (!att) {
      return next(AppError.notFound('Attachment not found'));
    }

    const task = tasksStore.tasks.get(att.task_id);
    if (!task || task.is_deleted) {
      return next(AppError.notFound('Parent task not found'));
    }

    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (!canViewTask(currentUser, task, { allUsers, getTask })) {
      return next(AppError.forbidden('Access denied'));
    }

    // Only uploader or ADMIN
    if (currentUser.id !== att.uploaded_by_id && currentUser.role !== 'ADMIN') {
      return next(AppError.forbidden('Only the uploader or an admin can delete this attachment'));
    }

    // Blocked once the task is COMPLETED
    if (task.status === 'COMPLETED') {
      return next(AppError.forbidden('Cannot delete attachments from a completed task'));
    }

    const deleted = attachmentsStore.deleteById(att.id);
    if (!deleted) {
      return next(AppError.notFound('Attachment could not be deleted'));
    }

    tasksStore.activityLogs.unshift({
      id: 'act-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      task_id: task.id,
      task_title: task.title,
      user_id: currentUser.id,
      user_name: currentUser.name || 'User',
      action: 'ATTACHMENT_DELETED',
      field_name: 'attachments',
      new_value: att.file_name,
      created_at: new Date().toISOString(),
    });

    res.json(sendSuccess({ id: att.id, deleted: true }));
  });

  // Legacy POST /attachments/upload compatibility endpoint
  apiRouter.post('/attachments/upload', (req, res, next) => {
    const { filename, mimetype, size } = req.body;
    if (!filename || !mimetype || typeof size !== 'number') {
      return next(AppError.badRequest('Filename, mimetype, and size in bytes are required'));
    }

    const val = validateAttachment(mimetype, size);
    if (!val.valid) {
      return next(AppError.badRequest(val.error || 'Invalid attachment'));
    }

    const fileKey = `att-${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const signedData = generateSignedAttachmentUrl(fileKey, 3600);

    res.status(201).json(
      sendSuccess({
        fileKey,
        mimetype,
        size,
        downloadUrl: signedData.url,
        expiresAt: signedData.expiresAt,
        message: 'Attachment validated successfully.',
      })
    );
  });

  // HIERARCHY-SCOOPED TEAM WORKLOAD REPORT
  apiRouter.get('/reports/team-load', (req, res, next) => {
    try {
      const requester = req.user!;
      const allActiveUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active);
      const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);

      const isReqAdmin = requester.role === 'ADMIN';
      const requestedUserId = req.query.user_id ? String(req.query.user_id) : null;

      // Allow ADMIN to view from any user's perspective downward using ?user_id=
      let targetUserId = requester.id;
      if (isReqAdmin && requestedUserId) {
        targetUserId = requestedUserId;
      }

      const targetUser = dbStore.users.get(targetUserId);
      if (!targetUser) {
        return next(AppError.notFound('Target user not found'));
      }

      // 1. Get full descendant tree for target user
      const descendantIds = getSubordinateIds(targetUserId, allActiveUsers);

      // Leaf user check: if target user has no subordinates, return 403
      if (descendantIds.length === 0) {
        return next(AppError.forbidden('You do not have access to team workload data. Leaf employees do not have subordinates.'));
      }

      // SECURITY: Subordinate verification
      // Verify that for non-admin requesters, any returned user is strictly in requester's subordinate list
      // and has a hierarchy_level strictly lower (numerically greater) than requester's level.
      const requesterSubordinateSet = isReqAdmin
        ? new Set(allActiveUsers.map((u) => u.id))
        : new Set(getSubordinateIds(requester.id, allActiveUsers));

      const depthParam = req.query.depth === '1' ? '1' : 'all';

      // 2. Helper to compute stats for a single user
      const computeUserStats = (u: any) => {
        const assigned = allTasks.filter((t) => t.assigned_to_id === u.id);
        const openTasks = assigned.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
        const overdueTasks = assigned.filter(
          (t) =>
            t.status === 'OVERDUE' ||
            (t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.due_date && new Date(t.due_date) < new Date())
        );

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const completedThisWeek = assigned.filter((t) => {
          if (t.status !== 'COMPLETED') return false;
          const compDate = t.completed_at ? new Date(t.completed_at) : t.updated_at ? new Date(t.updated_at) : null;
          return compDate && new Date(compDate) >= sevenDaysAgo;
        });

        return {
          open_tasks: openTasks.length,
          overdue_tasks: overdueTasks.length,
          completed_this_week: completedThisWeek.length,
        };
      };

      // 3. Helper to recursively build tree nodes
      const buildUserNode = (u: any): any => {
        // Direct reports of u
        let directReports = allActiveUsers.filter((report) => report.manager_id === u.id);

        // Security filter: must be in requesterSubordinateSet AND hierarchy_level > requester.hierarchy_level (if not admin)
        directReports = directReports.filter((report) => {
          if (!isReqAdmin) {
            if (!requesterSubordinateSet.has(report.id)) return false;
            if (report.hierarchy_level <= requester.hierarchy_level) return false;
          }
          return true;
        });

        let directReportNodes: any[] = [];
        if (depthParam === 'all') {
          directReportNodes = directReports.map((dr) => buildUserNode(dr));
        }

        return {
          user: {
            id: u.id,
            name: u.name,
            avatar_url: u.avatar_url || null,
            designation: u.designation || '',
            hierarchy_level: u.hierarchy_level,
          },
          stats: computeUserStats(u),
          direct_reports: directReportNodes,
        };
      };

      // Direct reports of targetUserId
      let directReportsOfTarget = allActiveUsers.filter((u) => u.manager_id === targetUserId);

      // Apply security filter
      directReportsOfTarget = directReportsOfTarget.filter((u) => {
        if (!isReqAdmin) {
          if (!requesterSubordinateSet.has(u.id)) return false;
          if (u.hierarchy_level <= requester.hierarchy_level) return false;
        }
        return true;
      });

      const responseTree = directReportsOfTarget.map((u) => buildUserNode(u));

      res.json(sendSuccess(responseTree));
    } catch (err) {
      next(err);
    }
  });

  // GET OPEN TASKS FOR A SPECIFIC SUBORDINATE
  apiRouter.get('/reports/team-load/user/:userId/tasks', (req, res, next) => {
    try {
      const requester = req.user!;
      const targetUserId = req.params.userId;
      const allActiveUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active);

      const targetUser = dbStore.users.get(targetUserId);
      if (!targetUser) {
        return next(AppError.notFound('User not found'));
      }

      // Authorization: :userId must be in requester's subordinate tree (or requester is ADMIN)
      if (requester.role !== 'ADMIN') {
        const subordinateIds = getSubordinateIds(requester.id, allActiveUsers);
        if (!subordinateIds.includes(targetUserId)) {
          return next(AppError.forbidden('Access denied: Specified user is not in your subordinate hierarchy tree.'));
        }
      }

      const assignedTasks = Array.from(tasksStore.tasks.values()).filter(
        (t) => !t.is_deleted && t.assigned_to_id === targetUserId
      );
      const openTasks = assignedTasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
      const enrichedOpenTasks = openTasks.map((t) => enrichTaskWithProgressAndChecklist(t));

      res.json(sendSuccess(enrichedOpenTasks));
    } catch (err) {
      next(err);
    }
  });

  // ACTIVITY FEED
  apiRouter.get('/activity', (req, res) => {
    const allUsers = Array.from(dbStore.users.values());
    const currentUser = req.fullUser || {
      id: req.user?.id || '',
      role: req.user?.role || 'EXECUTIVE',
      hierarchy_level: req.user?.hierarchy_level ?? 3,
    } as any;

    if (currentUser.role === 'ADMIN') {
      return res.json(sendSuccess(tasksStore.activityLogs));
    }

    const filtered = tasksStore.activityLogs.filter((log) => {
      const task = tasksStore.tasks.get(log.task_id);
      if (!task || task.is_deleted) return false;
      return canViewTask(currentUser, task, { allUsers, getTask });
    });
    res.json(sendSuccess(filtered));
  });

  // REMINDERS
  apiRouter.get('/reminders', (req, res) => {
    const userId = req.user?.id || '';
    const myReminders = tasksStore.reminders.filter((r) => r.user_id === userId || req.user?.role === 'ADMIN');
    res.json(sendSuccess(myReminders));
  });

  // Notifications
  apiRouter.get('/notifications', (req, res) => {
    const userId = req.user?.id || '';
    if (tasksStore.notifications.length === 0) {
      tasksStore.notifications.push(
        {
          id: 'notif-seed-1',
          user_id: 'ALL',
          title: 'Welcome to BrickFour Task Platform',
          message: 'Real-time task delegation and notification engine active.',
          type: 'TASK_ASSIGNED',
          is_read: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 'notif-seed-2',
          user_id: 'usr-admin-001',
          title: 'New Task Assignment',
          message: 'You have pending tasks requiring review and approval.',
          type: 'STATUS_CHANGED',
          task_id: 'tsk-001',
          is_read: false,
          created_at: new Date(Date.now() - 1800000).toISOString(),
        }
      );
    }
    const userNotifs = tasksStore.notifications.filter(
      (n) => n.user_id === userId || n.user_id === 'ALL' || req.user?.role === 'ADMIN'
    );
    res.json(sendSuccess(userNotifs));
  });
  apiRouter.patch('/notifications/read-all', (req, res) => {
    const userId = req.user?.id || '';
    tasksStore.notifications.forEach((n) => {
      if (n.user_id === userId || n.user_id === 'ALL' || req.user?.role === 'ADMIN') {
        n.is_read = true;
      }
    });
    res.json(sendSuccess({ message: 'All notifications marked as read' }));
  });
  apiRouter.patch('/notifications/:id/read', (req, res) => {
    const notif = tasksStore.notifications.find((n) => n.id === req.params.id);
    if (notif) {
      notif.is_read = true;
    }
    res.json(sendSuccess({ id: req.params.id, is_read: true }));
  });

  // Conversations & Messages Stateful Store
  interface ConversationParticipantData {
    id: string;
    name: string;
    designation: string;
    department: string;
    role: string;
  }

  interface ConversationData {
    id: string;
    // DIRECT: one-to-one, GROUP: user-created group, HEADS: auto-managed department heads channel
    kind?: 'DIRECT' | 'GROUP' | 'HEADS';
    name?: string | null;
    created_by_id?: string;
    participantIds: string[];
    participants: ConversationParticipantData[];
    lastMessage: {
      text: string;
      senderId: string;
      created_at: string;
    } | null;
    unreadCounts: Record<string, number>;
    updated_at: string;
  }

  interface MessageData {
    id: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderDesignation: string;
    content: string;
    created_at: string;
  }

  const conversationsList: ConversationData[] = [];
  const messagesMap = new Map<string, MessageData[]>();
  const HEADS_CHANNEL_ID = 'conv-dept-heads';
  const LEGACY_ADMIN_ALIAS_ID = 'usr-admin-001';

  const toParticipant = (u: User): ConversationParticipantData => ({
    id: u.id,
    name: u.name,
    designation: u.designation,
    department: u.department,
    role: u.role,
  });

  // Keeps the Department Heads channel in sync with the current active heads (plus admins)
  function syncHeadsChannel(): ConversationData {
    const members = Array.from(dbStore.users.values()).filter(
      (u) => u.is_active && u.id !== LEGACY_ADMIN_ALIAS_ID && (u.role === 'DEPT_HEAD' || u.role === 'ADMIN')
    );
    let channel = conversationsList.find((c) => c.id === HEADS_CHANNEL_ID);
    if (!channel) {
      channel = {
        id: HEADS_CHANNEL_ID,
        kind: 'HEADS',
        name: 'Department Heads',
        participantIds: [],
        participants: [],
        lastMessage: null,
        unreadCounts: {},
        updated_at: new Date().toISOString(),
      };
      conversationsList.push(channel);
      messagesMap.set(channel.id, []);
    }

    const memberIds = members.map((m) => m.id).sort();
    const changed = memberIds.join(',') !== [...channel.participantIds].sort().join(',');
    if (changed) {
      channel.participantIds = memberIds;
      channel.participants = members.map(toParticipant);
      memberIds.forEach((id) => {
        if (channel!.unreadCounts[id] === undefined) channel!.unreadCounts[id] = 0;
      });
      persistConversation(channel);
    }
    return channel;
  }

  function serializeConversation(c: ConversationData, currentUserId: string) {
    const enrichedParticipants = c.participantIds.map((pid) => {
      const dbUser = dbStore.users.get(pid);
      if (dbUser) return toParticipant(dbUser);
      return c.participants.find((p) => p.id === pid) || { id: pid, name: 'Former member', designation: '', department: '', role: '' };
    });

    const kind = c.kind || 'DIRECT';
    const otherParticipant = enrichedParticipants.find((p) => p.id !== currentUserId) || enrichedParticipants[0];
    return {
      id: c.id,
      kind,
      isGroup: kind !== 'DIRECT',
      name: kind === 'DIRECT' ? otherParticipant?.name : c.name || 'Group',
      participant: otherParticipant,
      participants: enrichedParticipants,
      lastMessage: c.lastMessage,
      unreadCount: c.unreadCounts[currentUserId] || 0,
      updated_at: c.updated_at,
    };
  }

  // Hydrate conversations from MongoDB Atlas if available
  loadConversationsFromMongo().then(async (loadedConvs) => {
    if (loadedConvs && loadedConvs.length > 0) {
      for (const conv of loadedConvs) {
        const existingIdx = conversationsList.findIndex((c) => c.id === conv.id);
        if (existingIdx >= 0) conversationsList.splice(existingIdx, 1);
        conversationsList.push(conv);
        const msgs = await loadMessagesFromMongo(conv.id);
        messagesMap.set(conv.id, msgs);
      }
      console.log(`[MongoDB] Loaded ${loadedConvs.length} chat conversations from MongoDB.`);
    }
  }).catch((err) => console.error('[MongoDB] Error loading conversations:', err));

  // GET /conversations
  apiRouter.get('/conversations', (req, res) => {
    const currentUserId = req.user?.id || '';
    syncHeadsChannel();

    const userConversations = conversationsList
      .filter((c) => c.participantIds.includes(currentUserId))
      .map((c) => serializeConversation(c, currentUserId))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    res.json(sendSuccess(userConversations));
  });

  // POST /conversations
  // - { recipient_id }                 -> create or get the 1:1 conversation
  // - { participant_ids[], name }      -> create a group conversation (anyone can chat with anyone)
  apiRouter.post('/conversations', (req, res, next) => {
    const currentUserId = req.user?.id || '';
    const currentUserObj = dbStore.users.get(currentUserId);
    if (!currentUserObj) {
      return next(AppError.unauthorized('Current user not found'));
    }

    const { recipient_id, participant_ids, name } = req.body;

    if (Array.isArray(participant_ids)) {
      const groupName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
      if (!groupName) {
        return next(AppError.badRequest('Group name is required'));
      }

      const memberIds = Array.from(new Set<string>([currentUserId, ...participant_ids.map(String)]));
      const members = memberIds
        .map((id) => dbStore.users.get(id))
        .filter((u): u is User => Boolean(u && u.is_active));
      if (members.length !== memberIds.length) {
        return next(AppError.badRequest('One or more selected members were not found'));
      }
      if (members.length < 3) {
        return next(AppError.badRequest('A group needs at least two other members'));
      }

      const group: ConversationData = {
        id: 'conv-grp-' + Date.now(),
        kind: 'GROUP',
        name: sanitizeRichText(groupName),
        created_by_id: currentUserId,
        participantIds: members.map((m) => m.id),
        participants: members.map(toParticipant),
        lastMessage: null,
        unreadCounts: Object.fromEntries(members.map((m) => [m.id, 0])),
        updated_at: new Date().toISOString(),
      };
      conversationsList.unshift(group);
      messagesMap.set(group.id, []);
      persistConversation(group);

      return res.status(201).json(sendSuccess(serializeConversation(group, currentUserId)));
    }

    if (!recipient_id) {
      return next(AppError.badRequest('Recipient ID is required'));
    }

    if (recipient_id === currentUserId) {
      return next(AppError.badRequest('Cannot start a conversation with yourself'));
    }

    const recipient = dbStore.users.get(recipient_id);
    if (!recipient) {
      return next(AppError.notFound('Recipient user not found'));
    }

    // Check if a 1:1 conversation already exists (ignore groups that happen to contain both users)
    let existing = conversationsList.find(
      (c) =>
        (c.kind || 'DIRECT') === 'DIRECT' &&
        c.participantIds.length === 2 &&
        c.participantIds.includes(currentUserId) &&
        c.participantIds.includes(recipient_id)
    );

    if (!existing) {
      existing = {
        id: 'conv-' + Date.now(),
        kind: 'DIRECT',
        participantIds: [currentUserId, recipient_id],
        participants: [toParticipant(currentUserObj), toParticipant(recipient)],
        lastMessage: null,
        unreadCounts: { [currentUserId]: 0, [recipient_id]: 0 },
        updated_at: new Date().toISOString(),
      };
      conversationsList.unshift(existing);
      messagesMap.set(existing.id, []);
      persistConversation(existing);
    }

    res.status(201).json(sendSuccess(serializeConversation(existing, currentUserId)));
  });

  // Look up a conversation and make sure the requester is a participant
  function getParticipantConversation(req: express.Request): ConversationData | AppError {
    const currentUserId = req.user?.id || '';
    if (req.params.id === HEADS_CHANNEL_ID) syncHeadsChannel();
    const conversation = conversationsList.find((c) => c.id === req.params.id);
    if (!conversation) {
      return AppError.notFound('Conversation not found');
    }
    if (!conversation.participantIds.includes(currentUserId)) {
      return AppError.forbidden('You are not a participant in this conversation');
    }
    return conversation;
  }

  // GET /conversations/:id/messages
  apiRouter.get('/conversations/:id/messages', (req, res, next) => {
    const currentUserId = req.user?.id || '';
    const conversation = getParticipantConversation(req);
    if (conversation instanceof AppError) {
      return next(conversation);
    }

    // Reset unread count for current user
    conversation.unreadCounts[currentUserId] = 0;

    const msgs = messagesMap.get(req.params.id) || [];
    const enrichedMsgs = msgs.map((m) => {
      const dbUser = dbStore.users.get(m.senderId);
      return {
        ...m,
        senderName: dbUser ? dbUser.name : m.senderName,
        senderDesignation: dbUser ? dbUser.designation : m.senderDesignation,
      };
    });
    res.json(sendSuccess(enrichedMsgs));
  });

  // POST /conversations/:id/messages
  apiRouter.post('/conversations/:id/messages', (req, res, next) => {
    const currentUserId = req.user?.id || '';
    const currentUserObj = dbStore.users.get(currentUserId);

    const { content } = req.body;
    if (!content || !content.trim()) {
      return next(AppError.badRequest('Message content cannot be empty'));
    }

    const conversation = getParticipantConversation(req);
    if (conversation instanceof AppError) {
      return next(conversation);
    }

    const cleanContent = sanitizeRichText(content.trim());
    const newMsg: MessageData = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      conversationId: conversation.id,
      senderId: currentUserId,
      senderName: currentUserObj?.name || 'User',
      senderDesignation: currentUserObj?.designation || 'Team Member',
      content: cleanContent,
      created_at: new Date().toISOString(),
    };

    const msgs = messagesMap.get(conversation.id) || [];
    msgs.push(newMsg);
    messagesMap.set(conversation.id, msgs);

    // Update conversation meta
    conversation.lastMessage = {
      text: cleanContent,
      senderId: currentUserId,
      created_at: newMsg.created_at,
    };
    conversation.updated_at = newMsg.created_at;

    // Increment unread count for other participants
    conversation.participantIds.forEach((pid) => {
      if (pid !== currentUserId) {
        conversation.unreadCounts[pid] = (conversation.unreadCounts[pid] || 0) + 1;
      }
    });

    // Persist to MongoDB
    persistMessage(newMsg);
    persistConversation(conversation);

    // Real-time delivery only to this conversation's participants
    try {
      const io = getIO();
      if (io) {
        conversation.participantIds.forEach((pid) => {
          io.to(`user:${pid}`).emit('conversation:message', {
            conversationId: conversation.id,
            message: newMsg,
          });
        });
      }
    } catch (e) {
      console.error('Failed to emit socket message event:', e);
    }

    res.status(201).json(sendSuccess(newMsg));
  });

  app.use('/api/v1', apiRouter);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

  // Create HTTP server for Socket.IO
  const httpServer = http.createServer(app);
  initializeSockets(httpServer);
  initializeCronJobs();

  // Vite Middleware in Dev Mode with fallback
  const distPath = path.join(process.cwd(), 'dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // SPA fallback: transform and serve index.html for client-side routing
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const indexPath = path.resolve(process.cwd(), 'index.html');
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } else {
          next();
        }
      } catch (e) {
        next(e);
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  // Connect to MongoDB Atlas in background without delaying port 3000 readiness
  initMongoDB().catch((err) => {
    console.warn('[MongoDB] Background connection error:', err?.message || err);
  });
}

// On Vercel the app is served by api/index.ts instead of a long-running server
if (!process.env.VERCEL) {
  startServer();
}
