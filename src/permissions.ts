/**
 * Permissions and Business Rules Layer
 * Pure functions defining authorization and organizational hierarchy constraints.
 */

import { Role, Task, TaskStatus, User } from './types';
import { TransitionContext, validateTransition } from './taskStateMachine';

/**
 * Returns all direct and indirect subordinate user IDs for a given user.
 * Implements a recursive traversal down the manager_id hierarchy chain.
 *
 * @param userId ID of the manager
 * @param users Full collection of system users
 * @returns Array of subordinate user IDs in the descendant subtree
 */
export function getSubordinateIds(userId: string, users: User[]): string[] {
  const subordinates: string[] = [];
  const userMap = new Map<string, User[]>();

  // Group users by manager_id for O(N) lookup efficiency
  for (const user of users) {
    if (user.manager_id) {
      const list = userMap.get(user.manager_id) || [];
      list.push(user);
      userMap.set(user.manager_id, list);
    }
  }

  function traverse(currentId: string) {
    const directReports = userMap.get(currentId) || [];
    for (const report of directReports) {
      subordinates.push(report.id);
      traverse(report.id);
    }
  }

  traverse(userId);
  return subordinates;
}

/**
 * Walks up the manager_id hierarchy chain to return all ancestor user IDs.
 *
 * @param userId ID of the starting user
 * @param users Full collection of system users
 * @returns Array of ancestor user IDs from immediate manager up to top-level Admin
 */
export function getAncestorIds(userId: string, users: User[]): string[] {
  const ancestors: string[] = [];
  const userById = new Map<string, User>(users.map((u) => [u.id, u]));

  let current = userById.get(userId);
  const visited = new Set<string>();

  while (current && current.manager_id && !visited.has(current.manager_id)) {
    visited.add(current.manager_id);
    const manager = userById.get(current.manager_id);
    if (!manager) break;
    ancestors.push(manager.id);
    current = manager;
  }

  return ancestors;
}

/**
 * True when both users are department heads (peer heads may assign work to each other).
 */
export function isPeerDeptHeadAssignment(assigner: User, assignee: User): boolean {
  return (
    assigner.id !== assignee.id &&
    assigner.role === 'DEPT_HEAD' &&
    assignee.role === 'DEPT_HEAD' &&
    assignee.is_active !== false
  );
}

/**
 * Determines if an assigner can assign or delegate a task to an assignee.
 *
 * Rule:
 * - ADMIN can assign tasks to anyone.
 * - A DEPT_HEAD can assign tasks to another DEPT_HEAD (cross-department requests).
 * - Otherwise, assigner.hierarchy_level < assignee.hierarchy_level AND assignee must be
 *   in the assigner's descendant subtree.
 *
 * @param assigner User creating or delegating the task
 * @param assignee Target assigned user
 * @param allUsers Full list of system users (required for non-admin subtree check)
 */
export function canAssignTask(
  assigner: User,
  assignee: User,
  allUsers: User[] = []
): boolean {
  // Self-assignment is always allowed
  if (assigner.id === assignee.id) {
    return true;
  }

  // Admin can assign tasks to anyone
  if (assigner.role === 'ADMIN' || assigner.hierarchy_level === 0) {
    return true;
  }

  // Department heads can hand work to peer department heads, who then delegate within their team
  if (isPeerDeptHeadAssignment(assigner, assignee)) {
    return true;
  }

  // An upper manager can assign tasks downwards to employees in their subordinate reporting tree
  // Assigner must have higher authority (lower hierarchy level number)
  if (assigner.hierarchy_level >= assignee.hierarchy_level) {
    return false;
  }

  // Assignee must be in assigner's descendant subordinate chain
  if (allUsers.length > 0) {
    const subordinateIds = getSubordinateIds(assigner.id, allUsers);
    return subordinateIds.includes(assignee.id);
  }

  return false;
}

/**
 * Determines if a user has permission to view a given task.
 *
 * Rules:
 * 1. Admin can view all tasks across the company.
 * 2. Non-admin users can view tasks where they are the ASSIGNEE or ASSIGNER.
 * 3. Users who assigned or own an ancestor task in the delegation chain can monitor every
 *    subtask delegated beneath it (e.g. Sales head sees who Legal head delegated their request to).
 * 4. Prevents lower employees or non-involved managers from seeing other employees' tasks.
 */
export function canViewTask(
  user: User,
  task: Task,
  context: {
    allUsers?: User[];
    watcherUserIds?: string[];
    getTask?: (id: string) => Task | undefined;
  } = {}
): boolean {
  if (!user || !task) return false;

  // 1. Admin (Level 0) can view all tasks
  if (user.role === 'ADMIN' || user.hierarchy_level === 0) {
    return true;
  }

  // 2. Assigner / Creator can always view the task
  if (task.created_by_id && task.created_by_id === user.id) {
    return true;
  }

  // 3. Assignee can always view the task
  if (task.assigned_to_id && task.assigned_to_id === user.id) {
    return true;
  }

  // 4. Explicit Watcher check
  if (context?.watcherUserIds?.includes(user.id)) {
    return true;
  }
  if (task.watchers?.some((w) => w.user_id === user.id)) {
    return true;
  }

  // 5. Upstream delegation chain: assigner/owner of any ancestor task can monitor this subtask
  if (context.getTask && isInUpstreamChain(user.id, task, context.getTask)) {
    return true;
  }

  return false;
}

/**
 * Returns true if userId created or is assigned to any ancestor of the task.
 */
export function isInUpstreamChain(
  userId: string,
  task: Task,
  getTask: (id: string) => Task | undefined
): boolean {
  let parentId = task.parent_task_id;
  const visited = new Set<string>();

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = getTask(parentId);
    if (!parent || parent.is_deleted) break;
    if (parent.created_by_id === userId || parent.assigned_to_id === userId) {
      return true;
    }
    parentId = parent.parent_task_id;
  }

  return false;
}

/**
 * Determines if a user can edit task fields (title, description, due_date, etc.).
 *
 * Rule: Creator or ADMIN only, and only if status != COMPLETED and != CANCELLED.
 */
export function canEditTask(user: User, task: Task): boolean {
  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
    return false;
  }

  return user.role === 'ADMIN' || task.created_by_id === user.id;
}

/**
 * Resolves the actor role for a user relative to a task.
 * Returns 'ASSIGNER' if user is creator or ADMIN.
 * Returns 'ASSIGNEE' if user is assignee.
 * Otherwise 'OTHER'.
 * Assigner takes precedence when a user is both.
 */
export function getTaskActorRole(
  user: User,
  task: Task
): 'ASSIGNEE' | 'ASSIGNER' | 'OTHER' {
  if (user.role === 'ADMIN' || user.id === task.created_by_id) {
    return 'ASSIGNER';
  }
  if (user.id === task.assigned_to_id) {
    return 'ASSIGNEE';
  }
  return 'OTHER';
}

/**
 * Determines if a user can execute a specific status transition on a task.
 * Resolves the actor role, then defers to validateTransition.
 * Returns false for 'OTHER'. Always returns false for 'OVERDUE'.
 */
export function canChangeStatus(
  user: User,
  task: Task,
  newStatus: TaskStatus,
  context: TransitionContext = {}
): boolean {
  if (newStatus === 'OVERDUE') {
    return false;
  }

  const actorRole = getTaskActorRole(user, task);
  if (actorRole === 'OTHER') {
    return false;
  }

  try {
    validateTransition(
      task.status,
      newStatus,
      actorRole,
      context.completed_at ? context : { ...context, completed_at: task.completed_at, userRole: user.role, isAdmin: user.role === 'ADMIN' }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Determines if a user can edit a task's priority.
 * True only when getTaskActorRole returns 'ASSIGNER'.
 */
export function canEditPriority(user: User, task: Task): boolean {
  return getTaskActorRole(user, task) === 'ASSIGNER';
}

/**
 * Determines if a task can be deleted.
 *
 * Rule: Creator or ADMIN only, and only if no child tasks are currently in progress/review.
 *
 * @param user User initiating deletion
 * @param task Target task
 * @param childTasks Array of child/delegated tasks
 */
export function canDeleteTask(
  user: User,
  task: Task,
  childTasks: Task[] = []
): boolean {
  const isAuthorized = user.role === 'ADMIN' || task.created_by_id === user.id;
  if (!isAuthorized) {
    return false;
  }

  const activeStatuses: TaskStatus[] = ['IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW'];
  const hasChildInProgress = childTasks.some((child) =>
    activeStatuses.includes(child.status)
  );

  return !hasChildInProgress;
}

/**
 * Determines if a user can approve a submitted task or approval request.
 *
 * Rule: Must be the task's creator (the person who assigned it) or an ADMIN.
 */
export function canApprove(user: User, task: Task): boolean {
  return user.role === 'ADMIN' || task.created_by_id === user.id;
}
