import { Task, TaskStatus, TaskPriority, TaskChecklistItem } from '../types';
import {
  persistTask,
  persistDeleteTask,
  persistChecklistItem,
  persistDeleteChecklistItem,
  persistActivityLog,
  persistNotification,
} from './mongodb';

export interface ActivityLogItem {
  id: string;
  task_id: string;
  task_title: string;
  user_id: string;
  user_name: string;
  action: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  task_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface ReminderItem {
  id: string;
  task_id: string;
  task_title?: string;
  user_id: string;
  remind_at?: string;
  channel?: 'IN_APP' | 'EMAIL' | 'BOTH';
  is_sent: boolean;
  message?: string;
  type?: string;
  relative_minutes_before?: number;
  scheduled_at?: string;
}

class PersistedMap<K extends string, V> extends Map<K, V> {
  private onSet?: (val: V) => void;
  private onDelete?: (key: K) => void;

  constructor(onSet?: (val: V) => void, onDelete?: (key: K) => void) {
    super();
    this.onSet = onSet;
    this.onDelete = onDelete;
  }

  set(key: K, value: V): this {
    super.set(key, value);
    if (this.onSet) {
      try {
        this.onSet(value);
      } catch (e) {
        console.error('Failed to trigger onSet persistence:', e);
      }
    }
    return this;
  }

  delete(key: K): boolean {
    const res = super.delete(key);
    if (this.onDelete) {
      try {
        this.onDelete(key);
      } catch (e) {
        console.error('Failed to trigger onDelete persistence:', e);
      }
    }
    return res;
  }
}

class PersistedArray<T> extends Array<T> {
  private onAdd?: (item: T) => void;

  constructor(onAdd?: (item: T) => void) {
    super();
    this.onAdd = onAdd;
  }

  push(...items: T[]): number {
    const res = super.push(...items);
    if (this.onAdd) {
      items.forEach((i) => this.onAdd!(i));
    }
    return res;
  }

  unshift(...items: T[]): number {
    const res = super.unshift(...items);
    if (this.onAdd) {
      items.forEach((i) => this.onAdd!(i));
    }
    return res;
  }
}

class TasksStore {
  public tasks: Map<string, Task> = new PersistedMap<string, Task>(
    (task) => persistTask(task),
    (id) => persistDeleteTask(id)
  );
  public activityLogs: ActivityLogItem[] = new PersistedArray<ActivityLogItem>((log) =>
    persistActivityLog(log)
  );
  public reminders: ReminderItem[] = [];
  public notifications: NotificationItem[] = new PersistedArray<NotificationItem>((notif) =>
    persistNotification(notif)
  );
  public checklistItems: Map<string, TaskChecklistItem> = new PersistedMap<string, TaskChecklistItem>(
    (item) => persistChecklistItem(item),
    (id) => persistDeleteChecklistItem(id)
  );

  constructor() {
    this.seedInitialTasks();
  }

  private seedInitialTasks() {
    this.tasks.clear();
    this.activityLogs = new PersistedArray<ActivityLogItem>((log) => persistActivityLog(log));
    this.reminders = [];
    this.notifications = new PersistedArray<NotificationItem>((notif) => persistNotification(notif));
    this.checklistItems.clear();
  }
}

export const tasksStore = new TasksStore();
