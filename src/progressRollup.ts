/**
 * Three-Tier Progress Rollup Engine
 *
 * TIER 1 — Leaf task with checklist items:
 *   progress = (completed_checklist_items / total_checklist_items) * 100
 *   This is the preferred, most objective basis.
 *
 * TIER 2 — Leaf task with no checklist:
 *   progress is derived from status, auto-set on every status change:
 *     DRAFT / ASSIGNED / TODO / BACKLOG → 0%
 *     IN_PROGRESS                     → 25% (assignee may override 1-99% manually)
 *     BLOCKED                         → freeze at last value
 *     SUBMITTED                       → 90%
 *     UNDER_REVIEW                    → 95%
 *     COMPLETED                       → 100%
 *     REOPENED                        → 50%
 *     CANCELLED                       → progress becomes irrelevant
 *
 * TIER 3 — Parent task with delegated children:
 *   progress = equal-weight average of non-cancelled children's progress values:
 *     parentProgress = sum(child.progress_percent) / childCount
 *   Rounded to the nearest integer.
 *   Parent slider becomes read-only with tooltip: "Calculated from N subtasks".
 *   A parent cannot be set COMPLETED while any child is not COMPLETED or CANCELLED.
 *
 * PROPAGATION:
 *   Any progress change recomputes upward via parent chain until the root is reached.
 */

import { Task, TaskChecklistItem, TaskProgressInfo, TaskStatus } from './types';

/**
 * Returns default progress percentage derived from status for Tier 2 leaf tasks.
 */
export function getDefaultStatusProgress(status: TaskStatus, currentProgress: number = 0): number {
  switch (status) {
    case 'DRAFT':
    case 'ASSIGNED':
    case 'TODO':
    case 'BACKLOG':
      return 0;
    case 'IN_PROGRESS':
      return 25;
    case 'BLOCKED':
      return Math.min(100, Math.max(0, currentProgress));
    case 'SUBMITTED':
      return 90;
    case 'UNDER_REVIEW':
      return 95;
    case 'COMPLETED':
      return 100;
    case 'REOPENED':
      return 50;
    case 'CANCELLED':
      return Math.min(100, Math.max(0, currentProgress));
    case 'OVERDUE':
      return Math.min(100, Math.max(0, currentProgress));
    default:
      return 0;
  }
}

export interface ComputedTaskResult {
  progress: number;
  info: TaskProgressInfo;
}

/**
 * Computes the 3-Tier progress for a single task given the list of all tasks and checklist items.
 */
export function computeTaskProgressAndInfo(
  task: Task,
  allTasks: Task[],
  checklistItems: TaskChecklistItem[] = []
): ComputedTaskResult {
  // Find active immediate children
  const children = allTasks.filter(
    (t) => t.parent_task_id === task.id && !t.is_deleted
  );

  // TIER 3: Parent Task with delegated children
  if (children.length > 0) {
    const activeNonCancelled = children.filter((c) => c.status !== 'CANCELLED');
    if (activeNonCancelled.length === 0) {
      const isAllCompleted = children.every((c) => c.status === 'COMPLETED' || c.status === 'CANCELLED');
      const progress = isAllCompleted ? 100 : 0;
      return {
        progress,
        info: {
          tier: 3,
          source_text: `from ${children.length} subtask${children.length > 1 ? 's' : ''}`,
          subtasks_count: children.length,
          can_edit_slider: false,
          slider_tooltip: `Calculated from ${children.length} subtasks`,
        },
      };
    }

    // Equal weighting average of all active non-cancelled subtasks
    const totalProgressSum = activeNonCancelled.reduce(
      (sum, child) => sum + Math.min(100, Math.max(0, child.progress_percent || 0)),
      0
    );
    let calculatedProgress = Math.round(totalProgressSum / activeNonCancelled.length);
    calculatedProgress = Math.min(100, Math.max(0, calculatedProgress));

    return {
      progress: calculatedProgress,
      info: {
        tier: 3,
        source_text: `from ${activeNonCancelled.length} subtask${activeNonCancelled.length > 1 ? 's' : ''}`,
        subtasks_count: activeNonCancelled.length,
        can_edit_slider: false,
        slider_tooltip: `Calculated from ${activeNonCancelled.length} subtasks`,
      },
    };
  }

  // TIER 1: Leaf Task with Checklist Items
  const taskChecklist = checklistItems.filter((i) => i.task_id === task.id);
  if (taskChecklist.length > 0) {
    const completedCount = taskChecklist.filter((i) => i.is_done).length;
    const totalCount = taskChecklist.length;
    const progress = Math.min(100, Math.max(0, Math.round((completedCount / totalCount) * 100)));

    return {
      progress,
      info: {
        tier: 1,
        source_text: `${completedCount} of ${totalCount} checklist items`,
        completed_checklist_count: completedCount,
        total_checklist_count: totalCount,
        can_edit_slider: false,
        slider_tooltip: 'Calculated from checklist items',
      },
    };
  }

  // TIER 2: Leaf Task with No Checklist
  const isManual = Boolean(task.is_manual_progress && task.status === 'IN_PROGRESS');
  let progress = task.progress_percent ?? 0;

  if (!isManual) {
    progress = getDefaultStatusProgress(task.status, task.progress_percent ?? 0);
  } else {
    // Constrain manual override between 1 and 99
    progress = Math.min(99, Math.max(1, progress));
  }

  const canEditSlider = task.status === 'IN_PROGRESS';
  const sliderTooltip = canEditSlider
    ? 'Manual progress (1-99% while IN_PROGRESS)'
    : 'Status derived progress';

  return {
    progress,
    info: {
      tier: 2,
      source_text: isManual ? 'manual' : 'status derived',
      is_manual: isManual,
      can_edit_slider: canEditSlider,
      slider_tooltip: sliderTooltip,
    },
  };
}

/**
 * Returns blocking active children that prevent a parent task from being marked COMPLETED.
 */
export function getBlockingChildren(task: Task, allTasks: Task[]): Task[] {
  const children = allTasks.filter(
    (t) => t.parent_task_id === task.id && !t.is_deleted
  );
  return children.filter(
    (child) => child.status !== 'COMPLETED' && child.status !== 'CANCELLED'
  );
}

/**
 * Checks if a task can be marked COMPLETED.
 */
export function canMarkCompleted(task: Task, allTasks: Task[]): boolean {
  return getBlockingChildren(task, allTasks).length === 0;
}

/**
 * Recomputes task progress bottom-up along the parent delegation chain starting at startTaskId.
 * Updates task objects directly in the map/array provided.
 */
export function propagateProgressUpward(
  startTaskId: string,
  allTasks: Task[],
  checklistItems: TaskChecklistItem[] = []
): Map<string, ComputedTaskResult> {
  const updatedResults = new Map<string, ComputedTaskResult>();
  const taskById = new Map<string, Task>(allTasks.map((t) => [t.id, t]));

  let currentTask = taskById.get(startTaskId);
  if (!currentTask) return updatedResults;

  // Function to calculate progress using the latest updated progress values of children
  function computeTaskWithLatestState(t: Task): ComputedTaskResult {
    // Create a temporary copy of allTasks with latest progress_percent
    const tasksWithLatest = allTasks.map((item) => {
      if (updatedResults.has(item.id)) {
        return {
          ...item,
          progress_percent: updatedResults.get(item.id)!.progress,
        };
      }
      return item;
    });

    return computeTaskProgressAndInfo(t, tasksWithLatest, checklistItems);
  }

  // Calculate for starting task
  const startResult = computeTaskWithLatestState(currentTask);
  currentTask.progress_percent = startResult.progress;
  currentTask.progress_info = startResult.info;
  updatedResults.set(currentTask.id, startResult);

  // Propagate upward recursively to root
  while (currentTask && currentTask.parent_task_id) {
    const parent = taskById.get(currentTask.parent_task_id);
    if (!parent) break;

    const parentResult = computeTaskWithLatestState(parent);
    parent.progress_percent = parentResult.progress;
    parent.progress_info = parentResult.info;
    updatedResults.set(parent.id, parentResult);

    currentTask = parent;
  }

  return updatedResults;
}

/**
 * Backfills / recalculates progress across ALL tasks in the system.
 */
export function backfillAllTasksProgress(
  allTasks: Task[],
  checklistItems: TaskChecklistItem[] = []
): void {
  // Sort tasks by depth descending so leaf tasks are calculated first
  const sortedTasks = [...allTasks].sort((a, b) => (b.depth || 0) - (a.depth || 0));

  for (const t of sortedTasks) {
    const res = computeTaskProgressAndInfo(t, allTasks, checklistItems);
    t.progress_percent = res.progress;
    t.progress_info = res.info;
  }
}
