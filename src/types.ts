/**
 * Core type definitions for the Hierarchical Task Management System.
 * Aligned with the Prisma Schema models.
 */

export type Role = 'ADMIN' | 'DEPT_HEAD' | 'TEAM_LEAD' | 'EXECUTIVE';

export type TaskStatus =
  | 'DRAFT'
  | 'TODO'
  | 'BACKLOG'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'COMPLETED'
  | 'REOPENED'
  | 'CANCELLED'
  | 'OVERDUE';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'BOTH';

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_DELEGATED'
  | 'STATUS_CHANGED'
  | 'COMMENT_ADDED'
  | 'MENTIONED'
  | 'DUE_SOON'
  | 'OVERDUE'
  | 'APPROVAL_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REMINDER'
  | 'MESSAGE_RECEIVED';

export type ConversationType = 'DIRECT' | 'GROUP' | 'TASK_THREAD';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  password_hash: string;
  avatar_url?: string | null;
  role: Role;
  manager_id?: string | null;
  department: string;
  designation: string;
  hierarchy_level: number; // 0: ADMIN, 1: DEPT_HEAD, 2: TEAM_LEAD, 3: EXECUTIVE
  employee_no?: string | null;
  location?: string | null;
  date_of_joining?: string | null;
  is_active: boolean;
  last_login_at?: Date | string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskProgressInfo {
  tier: 1 | 2 | 3;
  source_text: string;
  is_manual?: boolean;
  completed_checklist_count?: number;
  total_checklist_count?: number;
  subtasks_count?: number;
  can_edit_slider: boolean;
  slider_tooltip?: string;
}

export interface TaskWatcher {
  task_id: string;
  user_id: string;
  added_at?: Date | string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  created_by_id: string;
  assigned_to_id: string;
  created_by_name?: string;
  assigned_to_name?: string;
  parent_task_id?: string | null;
  root_task_id?: string | null;
  depth: number;
  status: TaskStatus;
  priority: TaskPriority;
  start_date?: Date | string | null;
  due_date?: Date | string | null;
  completed_at?: Date | string | null;
  progress_percent?: number;
  is_manual_progress?: boolean;
  is_recurring: boolean;
  recurrence_id?: string | null;
  submission_count: number;
  last_submitted_at: string | null;
  first_submitted_at: string | null;
  is_overdue: boolean;
  overdue_since: string | null;
  completed_on_time: boolean | null;
  attachment_count?: number;
  submitted_attachment_count?: number;
  is_deleted: boolean;
  deleted_at?: Date | string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
  watchers?: TaskWatcher[];
  progress_info?: TaskProgressInfo;
  checklist?: TaskChecklistItem[];
  assigned_to_department?: string | null;
  delegated_to?: TaskDelegationEntry[];
}

/** One downstream hand-off of a task (any depth), used to show who is actually working on it. */
export interface TaskDelegationEntry {
  task_id: string;
  task_title: string;
  user_id: string;
  user_name: string;
  department: string;
  delegated_by_name: string;
  status: TaskStatus | string;
  depth: number;
}

export interface AttachmentRecord {
  id: string;
  task_id: string;
  uploaded_by_id: string;
  uploaded_by_name: string;
  file_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  context: 'SUBMISSION' | 'REFERENCE';
  submission_round: number;
  created_at: string;
}

export interface RecurrenceRule {
  id: string;
  frequency: RecurrenceFrequency;
  interval: number;
  days_of_week?: number[]; // e.g. [1, 3, 5] (1 = Mon, 7 = Sun or 0 = Sun depending on convention)
  day_of_month?: number | null;
  custom_dates?: Array<Date | string>;
  starts_on: Date | string;
  ends_on?: Date | string | null;
  max_occurrences?: number | null;
  occurrences_count?: number;
  next_run_at?: Date | string | null;
  is_active: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface TodoStep {
  id: string;
  todo_id: string;
  title: string;
  is_done: boolean;
  position: number;
}

export interface TodoList {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  position: number;
}

export interface TodoItem {
  id: string;
  owner_id: string;
  title: string;
  notes?: string | null;
  is_completed: boolean;
  completed_at?: Date | string | null;
  is_important: boolean;
  due_date?: Date | string | null;
  added_to_my_day_on?: Date | string | null;
  linked_task_id?: string | null;
  list_id?: string | null;
  position: number;
  created_at?: Date | string;
  steps?: TodoStep[];
  completed_steps_count?: number;
  total_steps_count?: number;
}

export interface TodoSummary {
  userId: string;
  userName: string;
  department: string;
  designation: string;
  total_open: number;
  completed_today: number;
  overdue: number;
}

export type EventType = 'TASK' | 'MEETING' | 'CLIENT_MEETING' | 'DEADLINE' | 'REMINDER' | 'HOLIDAY' | 'OTHER';

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';

export interface EventInviteeInfo {
  id?: string;
  user_id: string;
  name?: string;
  avatar_url?: string | null;
  status: InviteStatus;
  responded_at?: string | null;
}

export interface CalendarEventModel {
  id: string;
  title: string;
  description?: string | null;
  event_type: EventType;
  created_by_id: string;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  location?: string | null;
  color?: string | null;
  linked_task_id?: string | null;
  recurrence_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UnifiedCalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  location?: string | null;
  color?: string | null;
  type: 'TASK' | 'EVENT';
  source_id: string; // task id or event id
  priority?: TaskPriority;
  status?: TaskStatus;
  event_type?: EventType;
  linked_task_id?: string | null;
  created_by_id?: string;
  assigned_to_id?: string;
  assigned_by_me?: boolean;
  invitees: EventInviteeInfo[];
  can_edit: boolean;
  recurrence_rule?: RecurrenceRule | null;
}
