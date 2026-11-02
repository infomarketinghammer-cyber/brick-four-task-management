/**
 * Task State Machine
 *
 * NOTE ON FUTURE KRA / PERFORMANCE SCORING MODULE:
 * This task status workflow is deliberately shaped for a future Key Result Area (KRA)
 * and performance-scoring module. In that system, completing a task on time (status
 * transitioned to COMPLETED) will award performance points to the assignee, whereas
 * falling OVERDUE will deduct points.
 *
 * To maintain absolute integrity of scoring and prevent self-approval or manual tampering:
 * 1. COMPLETED must only ever be set by the task ASSIGNER (or an ADMIN).
 * 2. OVERDUE must only ever be set by the SYSTEM automatically based on due dates.
 *
 * (Scoring logic is not implemented at this stage.)
 */

import { TaskStatus } from './types';

export class InvalidTaskTransitionError extends Error {
  constructor(
    public readonly from: TaskStatus,
    public readonly to: TaskStatus,
    public readonly reason: string
  ) {
    super(`Invalid task status transition from '${from}' to '${to}': ${reason}`);
    this.name = 'InvalidTaskTransitionError';
  }
}

export type ActorRole = 'ASSIGNEE' | 'ASSIGNER' | 'SYSTEM';

export interface TransitionContext {
  completed_at?: Date | string | null;
  due_date?: Date | string | null;
  now?: Date;
  userRole?: string;
  isAdmin?: boolean;
}

/**
 * Allowed status transitions for ASSIGNEE and ASSIGNER roles.
 */
const ASSIGNEE_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: [],
  TODO: ['IN_PROGRESS'],
  BACKLOG: [],
  ASSIGNED: [],
  IN_PROGRESS: ['SUBMITTED', 'TODO'],
  BLOCKED: [],
  SUBMITTED: ['IN_PROGRESS'],
  UNDER_REVIEW: [],
  COMPLETED: [],
  REOPENED: [],
  CANCELLED: [],
  OVERDUE: [],
};

const ASSIGNER_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: [],
  TODO: ['IN_PROGRESS', 'CANCELLED'],
  BACKLOG: [],
  ASSIGNED: [],
  IN_PROGRESS: ['SUBMITTED', 'CANCELLED'],
  BLOCKED: [],
  SUBMITTED: ['COMPLETED', 'TODO', 'IN_PROGRESS', 'CANCELLED'],
  UNDER_REVIEW: [],
  COMPLETED: ['IN_PROGRESS'], // Reopen rule: ADMIN only, within 7 days
  REOPENED: [],
  CANCELLED: ['TODO'],
  OVERDUE: ['IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'CANCELLED'],
};

/**
 * Validates whether a task status transition is permitted for a given actor role.
 * Throws InvalidTaskTransitionError with a human-readable reason if invalid.
 */
export function validateTransition(
  from: TaskStatus,
  to: TaskStatus,
  actor: ActorRole,
  context: TransitionContext = {}
): boolean {
  if (from === to) {
    throw new InvalidTaskTransitionError(
      from,
      to,
      'Task is already in the target status.'
    );
  }

  // System-applied OVERDUE transition
  if (to === 'OVERDUE') {
    if (actor !== 'SYSTEM') {
      throw new InvalidTaskTransitionError(
        from,
        to,
        'Only system triggers can mark a task as OVERDUE.'
      );
    }
    if (from === 'COMPLETED' || from === 'CANCELLED') {
      throw new InvalidTaskTransitionError(
        from,
        to,
        `Tasks in '${from}' status cannot be transitioned to OVERDUE.`
      );
    }
    return true;
  }

  // Nobody (other than SYSTEM) can transition manually to OVERDUE
  if (actor === 'SYSTEM') {
    throw new InvalidTaskTransitionError(
      from,
      to,
      'System actor only applies OVERDUE status.'
    );
  }

  // Specific role transition rules
  if (actor === 'ASSIGNEE') {
    const allowed = ASSIGNEE_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      if (to === 'COMPLETED') {
        throw new InvalidTaskTransitionError(
          from,
          to,
          'Only the task assigner can mark a task as completed.'
        );
      }
      if (to === 'CANCELLED') {
        throw new InvalidTaskTransitionError(
          from,
          to,
          'Only the task assigner can cancel a task.'
        );
      }
      throw new InvalidTaskTransitionError(
        from,
        to,
        `Assignees cannot transition task from '${from}' to '${to}'.`
      );
    }
    return true;
  }

  if (actor === 'ASSIGNER') {
    const allowed = ASSIGNER_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new InvalidTaskTransitionError(
        from,
        to,
        `Assigners cannot transition task from '${from}' to '${to}'.`
      );
    }

    // Reopen rule: COMPLETED -> IN_PROGRESS requires ADMIN role & within 7 days of completed_at
    if (from === 'COMPLETED' && to === 'IN_PROGRESS') {
      const isAdmin = context.isAdmin || context.userRole === 'ADMIN';
      if (!isAdmin) {
        throw new InvalidTaskTransitionError(
          from,
          to,
          'Only an ADMIN can reopen a completed task.'
        );
      }

      if (context.completed_at) {
        const completedDate = new Date(context.completed_at);
        const currentDate = context.now || new Date();
        const diffInDays =
          (currentDate.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24);

        if (diffInDays > 7) {
          throw new InvalidTaskTransitionError(
            from,
            to,
            `Completed tasks can only be reopened within 7 days of completion (completed ${diffInDays.toFixed(1)} days ago).`
          );
        }
      }
    }

    return true;
  }

  throw new InvalidTaskTransitionError(
    from,
    to,
    'Unauthorized actor for status transition.'
  );
}

/**
 * Returns the list of next statuses allowed for a given actor and current status.
 * Never includes 'OVERDUE'.
 */
export function getAllowedNextStatuses(
  currentStatus: TaskStatus,
  actor: ActorRole
): TaskStatus[] {
  if (actor === 'ASSIGNEE') {
    return ASSIGNEE_TRANSITIONS[currentStatus] || [];
  }
  if (actor === 'ASSIGNER') {
    return ASSIGNER_TRANSITIONS[currentStatus] || [];
  }
  return [];
}

