/**
 * MongoDB Atlas Database Integration for BrickFour Task Management System
 * Connection URI: MONGODB_URI="mongodb+srv://adityasuryawanshisyncai_db_user:2fTW71yhC4N1Topv@cluster0.l5gdk5v.mongodb.net/?retryWrites=true&w=majority"
 * Database: brickfour_task_management
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { dbStore, RefreshTokenRecord } from './prisma';
import { tasksStore, ActivityLogItem, NotificationItem, ReminderItem } from './tasksStore';
import { todosStore } from './todosStore';
import { calendarStore, EventInviteeRecord } from './calendarStore';
import { Task, TaskChecklistItem, User, TodoItem, TodoList, TodoStep, CalendarEventModel } from '../types';

export const MONGODB_DEFAULT_URI =
  'mongodb+srv://adityasuryawanshisyncai_db_user:2fTW71yhC4N1Topv@cluster0.l5gdk5v.mongodb.net/?retryWrites=true&w=majority';

export const DB_NAME = 'brickfour_task_management';

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;

// Collections
export let usersCol: Collection<User> | null = null;
export let tasksCol: Collection<Task> | null = null;
export let checklistCol: Collection<TaskChecklistItem> | null = null;
export let activityLogsCol: Collection<ActivityLogItem> | null = null;
export let notificationsCol: Collection<NotificationItem> | null = null;
export let remindersCol: Collection<ReminderItem> | null = null;
export let todosCol: Collection<TodoItem> | null = null;
export let todoListsCol: Collection<TodoList> | null = null;
export let todoStepsCol: Collection<TodoStep> | null = null;
export let eventsCol: Collection<CalendarEventModel> | null = null;
export let inviteesCol: Collection<EventInviteeRecord> | null = null;
export let conversationsCol: Collection<any> | null = null;
export let messagesCol: Collection<any> | null = null;
export let refreshTokensCol: Collection<RefreshTokenRecord> | null = null;
export let commentsCol: Collection<any> | null = null;

export function getMongoDb(): Db | null {
  return db;
}

export function isMongoConnected(): boolean {
  return isConnected;
}

/**
 * Initialize MongoDB connection, ensure collections, create indexes, and synchronize data
 */
export async function initMongoDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || MONGODB_DEFAULT_URI;
  console.log(`[MongoDB] Connecting to MongoDB Atlas cluster at: ${uri.replace(/:[^:@]+@/, ':****@')}`);

  try {
    client = new MongoClient(uri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      maxPoolSize: 10,
    });

    await client.connect();
    db = client.db(DB_NAME);
    isConnected = true;
    console.log(`[MongoDB] Connected successfully to database: '${DB_NAME}'`);

    // Assign collections
    usersCol = db.collection<User>('users');
    tasksCol = db.collection<Task>('tasks');
    checklistCol = db.collection<TaskChecklistItem>('checklist_items');
    activityLogsCol = db.collection<ActivityLogItem>('activity_logs');
    notificationsCol = db.collection<NotificationItem>('notifications');
    remindersCol = db.collection<ReminderItem>('reminders');
    todosCol = db.collection<TodoItem>('todos');
    todoListsCol = db.collection<TodoList>('todo_lists');
    todoStepsCol = db.collection<TodoStep>('todo_steps');
    eventsCol = db.collection<CalendarEventModel>('calendar_events');
    inviteesCol = db.collection<EventInviteeRecord>('calendar_invitees');
    conversationsCol = db.collection<any>('conversations');
    messagesCol = db.collection<any>('messages');
    refreshTokensCol = db.collection<RefreshTokenRecord>('refresh_tokens');
    commentsCol = db.collection<any>('task_comments');

    // Create Indexes for high performance
    await createCollectionIndexes();

    // Sync seed and existing data between MongoDB and Stores
    await syncInitialData();

    console.log(`[MongoDB] All collections initialized and synchronized with MongoDB Atlas.`);
  } catch (error) {
    console.error('[MongoDB] Connection or initialization error:', error);
    console.warn('[MongoDB] Falling back to in-memory store while maintaining operational state.');
    isConnected = false;
  }
}

/**
 * Create indexes on collections
 */
async function createCollectionIndexes() {
  if (!db) return;
  try {
    await usersCol?.createIndex({ id: 1 }, { unique: true });
    await usersCol?.createIndex({ email: 1 }, { unique: true });
    await usersCol?.createIndex({ department: 1 });
    await usersCol?.createIndex({ manager_id: 1 });

    await tasksCol?.createIndex({ id: 1 }, { unique: true });
    await tasksCol?.createIndex({ assigned_to_id: 1 });
    await tasksCol?.createIndex({ created_by_id: 1 });
    await tasksCol?.createIndex({ status: 1 });
    await tasksCol?.createIndex({ parent_task_id: 1 });

    await checklistCol?.createIndex({ id: 1 }, { unique: true });
    await checklistCol?.createIndex({ task_id: 1 });

    await activityLogsCol?.createIndex({ id: 1 }, { unique: true });
    await activityLogsCol?.createIndex({ task_id: 1 });
    await activityLogsCol?.createIndex({ created_at: -1 });

    await notificationsCol?.createIndex({ id: 1 }, { unique: true });
    await notificationsCol?.createIndex({ user_id: 1, is_read: 1 });

    await todosCol?.createIndex({ id: 1 }, { unique: true });
    await todosCol?.createIndex({ owner_id: 1 });

    await todoStepsCol?.createIndex({ id: 1 }, { unique: true });
    await todoStepsCol?.createIndex({ todo_id: 1 });

    await eventsCol?.createIndex({ id: 1 }, { unique: true });
    await eventsCol?.createIndex({ created_by: 1 });

    await inviteesCol?.createIndex({ id: 1 }, { unique: true });
    await inviteesCol?.createIndex({ event_id: 1 });

    await conversationsCol?.createIndex({ id: 1 }, { unique: true });
    await messagesCol?.createIndex({ id: 1 }, { unique: true });
    await messagesCol?.createIndex({ conversationId: 1, created_at: 1 });

    await refreshTokensCol?.createIndex({ token: 1 }, { unique: true });

    await commentsCol?.createIndex({ id: 1 }, { unique: true });
    await commentsCol?.createIndex({ task_id: 1 });
  } catch (err) {
    console.warn('[MongoDB] Index creation notice:', err);
  }
}

/**
 * Loads tasks/checklist/activity/notifications/todos/calendar from MongoDB into the
 * in-memory stores. Used both at cold start and periodically (see resyncIfStale below) to
 * pull in data written by OTHER warm serverless instances — each Vercel lambda instance
 * hydrates its own in-memory copy once at cold start and otherwise never sees writes made
 * by a sibling instance, which is what caused tasks/notifications/calendar events created
 * on one instance to be invisible on requests routed to another.
 *
 * Uses the base Map/Array methods (bypassing the PersistedMap/PersistedArray write-through
 * hooks) since this data was just read from Mongo and re-persisting it would be a redundant
 * write; the array instances are mutated in place (not reassigned) so their persistence
 * hooks stay intact for later live writes from this same instance.
 */
async function loadVolatileCollectionsFromMongo() {
  // USERS — an edit (department, reporting manager, role, deactivation, subordinate
  // reassignment) made on one serverless instance must be visible to every other instance,
  // not just the one that handled the request; previously users were only ever loaded once
  // at cold start.
  if (usersCol) {
    const userCount = await usersCol.countDocuments();
    if (userCount > 0) {
      const mongoUsers = await usersCol.find({}).toArray();
      for (const u of mongoUsers) {
        const { _id, ...cleanUser } = u as any;
        dbStore.users.set(cleanUser.id, cleanUser);
      }
    }
  }

  // TASKS
  if (tasksCol) {
    const taskCount = await tasksCol.countDocuments();
    if (taskCount > 0) {
      const mongoTasks = await tasksCol.find({}).toArray();
      for (const t of mongoTasks) {
        const { _id, ...cleanTask } = t as any;
        Map.prototype.set.call(tasksStore.tasks, cleanTask.id, cleanTask);
      }
    }
  }

  // CHECKLIST ITEMS
  if (checklistCol) {
    const count = await checklistCol.countDocuments();
    if (count > 0) {
      const items = await checklistCol.find({}).toArray();
      for (const item of items) {
        const { _id, ...cleanItem } = item as any;
        Map.prototype.set.call(tasksStore.checklistItems, cleanItem.id, cleanItem);
      }
    }
  }

  // ACTIVITY LOGS
  if (activityLogsCol) {
    const count = await activityLogsCol.countDocuments();
    if (count > 0) {
      const logs = await activityLogsCol.find({}).sort({ created_at: -1 }).limit(500).toArray();
      const clean = logs.map((l: any) => {
        const { _id, ...rest } = l;
        return rest;
      });
      tasksStore.activityLogs.length = 0;
      Array.prototype.push.apply(tasksStore.activityLogs, clean);
    }
  }

  // NOTIFICATIONS
  if (notificationsCol) {
    const count = await notificationsCol.countDocuments();
    if (count > 0) {
      const notifs = await notificationsCol.find({}).sort({ created_at: -1 }).limit(200).toArray();
      const clean = notifs.map((n: any) => {
        const { _id, ...rest } = n;
        return rest;
      });
      tasksStore.notifications.length = 0;
      Array.prototype.push.apply(tasksStore.notifications, clean);
    }
  }

  // REMINDERS
  if (remindersCol) {
    const count = await remindersCol.countDocuments();
    if (count > 0) {
      const rems = await remindersCol.find({}).toArray();
      const clean = rems.map((r: any) => {
        const { _id, ...rest } = r;
        return rest;
      });
      tasksStore.reminders.length = 0;
      Array.prototype.push.apply(tasksStore.reminders, clean);
    }
  }

  // TODOS
  if (todosCol) {
    const count = await todosCol.countDocuments();
    if (count > 0) {
      const todos = await todosCol.find({}).toArray();
      for (const todo of todos) {
        const { _id, ...clean } = todo as any;
        todosStore.todos.set(clean.id, clean);
      }
    }
  }

  // TODO LISTS & STEPS
  if (todoListsCol) {
    const lists = await todoListsCol.find({}).toArray();
    for (const l of lists) {
      const { _id, ...clean } = l as any;
      todosStore.todoLists.set(clean.id, clean);
    }
  }
  if (todoStepsCol) {
    const steps = await todoStepsCol.find({}).toArray();
    for (const s of steps) {
      const { _id, ...clean } = s as any;
      todosStore.todoSteps.set(clean.id, clean);
    }
  }

  // CALENDAR EVENTS & INVITEES
  if (eventsCol) {
    const count = await eventsCol.countDocuments();
    if (count > 0) {
      const evts = await eventsCol.find({}).toArray();
      for (const evt of evts) {
        const { _id, ...clean } = evt as any;
        calendarStore.events.set(clean.id, clean);
      }
    }
  }
  if (inviteesCol) {
    const invs = await inviteesCol.find({}).toArray();
    for (const inv of invs) {
      const { _id, ...clean } = inv as any;
      calendarStore.invitees.set(clean.id, clean);
    }
  }
}

/**
 * Sync initial seed data to MongoDB, or hydrate in-memory stores from MongoDB
 */
async function syncInitialData() {
  if (!isConnected || !usersCol) return;

  try {
    // USERS COLLECTION
    const userCount = await usersCol.countDocuments();
    if (userCount === 0) {
      console.log(`[MongoDB] Seeding 27 BrickFour employee records to collection 'users'...`);
      const initialUsers = Array.from(dbStore.users.values());
      if (initialUsers.length > 0) {
        await usersCol.insertMany(initialUsers as any);
        console.log(`[MongoDB] Successfully seeded ${initialUsers.length} employees to MongoDB.`);
      }
    } else {
      console.log(`[MongoDB] Loading ${userCount} users from MongoDB Atlas into memory...`);
      const mongoUsers = await usersCol.find({}).toArray();
      for (const u of mongoUsers) {
        const { _id, ...cleanUser } = u as any;
        dbStore.users.set(cleanUser.id, cleanUser);
      }
    }

    await loadVolatileCollectionsFromMongo();
    if (tasksStore.tasks.size > 0) {
      console.log(`[MongoDB] Loaded ${tasksStore.tasks.size} tasks from MongoDB.`);
    }
  } catch (err) {
    console.error('[MongoDB] Error during initial data sync:', err);
  }
}

let lastResyncAt = Date.now();

/**
 * Re-pulls the volatile collections (tasks, notifications, activity, calendar, todos) from
 * MongoDB if it's been more than `thresholdMs` since the last resync on this warm instance.
 * Cheap no-op on most requests; call at the top of any read path whose data can be created
 * by a request that lands on a different instance (see loadVolatileCollectionsFromMongo).
 */
export async function resyncIfStale(thresholdMs = 8000): Promise<void> {
  if (!isConnected) return;
  const now = Date.now();
  if (now - lastResyncAt < thresholdMs) return;
  lastResyncAt = now;
  try {
    await loadVolatileCollectionsFromMongo();
  } catch (err) {
    console.error('[MongoDB] Error during periodic resync:', err);
  }
}

// ======================================================================
// PERSISTENCE HELPERS
// ======================================================================

export async function persistUser(user: User): Promise<void> {
  if (!isConnected || !usersCol) return;
  try {
    await usersCol.updateOne({ id: user.id }, { $set: user as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist user:', err);
  }
}

export async function persistDeleteUser(userId: string): Promise<void> {
  if (!isConnected || !usersCol) return;
  try {
    await usersCol.deleteOne({ id: userId });
  } catch (err) {
    console.error('[MongoDB] Failed to delete user:', err);
  }
}

// Refresh tokens are rotated on every /auth/refresh call. Vercel runs several warm
// serverless instances behind the same URL, so a token rotated/issued on instance A was
// invisible to instance B — any user whose next refresh (or logout) landed on a different
// instance than the one that issued their current refresh token got "invalid or revoked"
// and was force-logged-out, essentially at random. Persisted + hydrated-on-miss below.
export async function persistRefreshToken(record: RefreshTokenRecord): Promise<void> {
  if (!isConnected || !refreshTokensCol) return;
  try {
    await refreshTokensCol.updateOne({ token: record.token }, { $set: record as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist refresh token:', err);
  }
}

export async function fetchRefreshTokenFromMongo(token: string): Promise<RefreshTokenRecord | null> {
  if (!isConnected || !refreshTokensCol) return null;
  try {
    const doc = await refreshTokensCol.findOne({ token });
    if (!doc) return null;
    const { _id, ...record } = doc as any;
    return record as RefreshTokenRecord;
  } catch (err) {
    console.error('[MongoDB] Failed to fetch refresh token:', err);
    return null;
  }
}

export async function persistDeleteRefreshToken(token: string): Promise<void> {
  if (!isConnected || !refreshTokensCol) return;
  try {
    await refreshTokensCol.deleteOne({ token });
  } catch (err) {
    console.error('[MongoDB] Failed to delete refresh token:', err);
  }
}

export async function persistRevokeAllUserRefreshTokens(userId: string): Promise<void> {
  if (!isConnected || !refreshTokensCol) return;
  try {
    await refreshTokensCol.updateMany({ userId }, { $set: { isRevoked: true } });
  } catch (err) {
    console.error('[MongoDB] Failed to revoke user refresh tokens:', err);
  }
}

export async function persistTask(task: Task): Promise<void> {
  if (!isConnected || !tasksCol) return;
  try {
    await tasksCol.updateOne({ id: task.id }, { $set: task as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist task:', err);
  }
}

export async function persistDeleteTask(taskId: string): Promise<void> {
  if (!isConnected || !tasksCol) return;
  try {
    await tasksCol.updateOne({ id: taskId }, { $set: { is_deleted: true, updated_at: new Date().toISOString() } });
  } catch (err) {
    console.error('[MongoDB] Failed to soft-delete task:', err);
  }
}

// On Vercel, concurrent requests can land on separate warm serverless instances whose
// in-memory tasksStore was hydrated at a different (earlier) cold start, so a task created
// on one instance can briefly 404 on another. Used to self-heal that in-memory cache on a miss.
export async function fetchTaskByIdFromMongo(taskId: string): Promise<Task | null> {
  if (!isConnected || !tasksCol) return null;
  try {
    const doc = await tasksCol.findOne({ id: taskId });
    if (!doc) return null;
    const { _id, ...task } = doc as any;
    return task as Task;
  } catch (err) {
    console.error('[MongoDB] Failed to fetch task by id:', err);
    return null;
  }
}

// Task comments previously lived only in an in-memory Map inside server.ts with zero
// MongoDB backing, so every comment was lost on a cold start and never visible to a
// sibling serverless instance. Read-through directly from Mongo (small per-task volume,
// no caching needed) instead of trusting any in-memory copy.
export async function persistComment(comment: any): Promise<void> {
  if (!isConnected || !commentsCol) return;
  try {
    await commentsCol.updateOne({ id: comment.id }, { $set: comment }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist comment:', err);
  }
}

export async function fetchCommentsForTaskFromMongo(taskId: string): Promise<any[] | null> {
  if (!isConnected || !commentsCol) return null;
  try {
    const docs = await commentsCol.find({ task_id: taskId }).sort({ created_at: 1 }).toArray();
    return docs.map((d: any) => {
      const { _id, ...rest } = d;
      return rest;
    });
  } catch (err) {
    console.error('[MongoDB] Failed to fetch comments for task:', err);
    return null;
  }
}

export async function persistChecklistItem(item: TaskChecklistItem): Promise<void> {
  if (!isConnected || !checklistCol) return;
  try {
    await checklistCol.updateOne({ id: item.id }, { $set: item as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist checklist item:', err);
  }
}

export async function persistDeleteChecklistItem(itemId: string): Promise<void> {
  if (!isConnected || !checklistCol) return;
  try {
    await checklistCol.deleteOne({ id: itemId });
  } catch (err) {
    console.error('[MongoDB] Failed to delete checklist item:', err);
  }
}

export async function persistActivityLog(log: ActivityLogItem): Promise<void> {
  if (!isConnected || !activityLogsCol) return;
  try {
    await activityLogsCol.insertOne(log as any);
  } catch (err) {
    console.error('[MongoDB] Failed to persist activity log:', err);
  }
}

export async function persistNotification(notif: NotificationItem): Promise<void> {
  if (!isConnected || !notificationsCol) return;
  try {
    await notificationsCol.updateOne({ id: notif.id }, { $set: notif as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist notification:', err);
  }
}

export async function persistReminder(reminder: ReminderItem): Promise<void> {
  if (!isConnected || !remindersCol) return;
  try {
    await remindersCol.updateOne({ id: reminder.id }, { $set: reminder as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist reminder:', err);
  }
}

export async function persistTodo(todo: TodoItem): Promise<void> {
  if (!isConnected || !todosCol) return;
  try {
    await todosCol.updateOne({ id: todo.id }, { $set: todo as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist todo:', err);
  }
}

export async function persistDeleteTodo(todoId: string): Promise<void> {
  if (!isConnected || !todosCol) return;
  try {
    await todosCol.deleteOne({ id: todoId });
    if (todoStepsCol) {
      await todoStepsCol.deleteMany({ todo_id: todoId });
    }
  } catch (err) {
    console.error('[MongoDB] Failed to delete todo:', err);
  }
}

export async function persistTodoList(list: TodoList): Promise<void> {
  if (!isConnected || !todoListsCol) return;
  try {
    await todoListsCol.updateOne({ id: list.id }, { $set: list as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist todo list:', err);
  }
}

export async function persistDeleteTodoList(listId: string): Promise<void> {
  if (!isConnected || !todoListsCol) return;
  try {
    await todoListsCol.deleteOne({ id: listId });
  } catch (err) {
    console.error('[MongoDB] Failed to delete todo list:', err);
  }
}

export async function persistTodoStep(step: TodoStep): Promise<void> {
  if (!isConnected || !todoStepsCol) return;
  try {
    await todoStepsCol.updateOne({ id: step.id }, { $set: step as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist todo step:', err);
  }
}

export async function persistDeleteTodoStep(stepId: string): Promise<void> {
  if (!isConnected || !todoStepsCol) return;
  try {
    await todoStepsCol.deleteOne({ id: stepId });
  } catch (err) {
    console.error('[MongoDB] Failed to delete todo step:', err);
  }
}

export async function persistCalendarEvent(event: CalendarEventModel): Promise<void> {
  if (!isConnected || !eventsCol) return;
  try {
    await eventsCol.updateOne({ id: event.id }, { $set: event as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist calendar event:', err);
  }
}

export async function persistDeleteCalendarEvent(eventId: string): Promise<void> {
  if (!isConnected || !eventsCol) return;
  try {
    await eventsCol.deleteOne({ id: eventId });
    if (inviteesCol) {
      await inviteesCol.deleteMany({ event_id: eventId });
    }
  } catch (err) {
    console.error('[MongoDB] Failed to delete calendar event:', err);
  }
}

export async function persistCalendarInvitee(invitee: EventInviteeRecord): Promise<void> {
  if (!isConnected || !inviteesCol) return;
  try {
    await inviteesCol.updateOne({ id: invitee.id }, { $set: invitee as any }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist invitee:', err);
  }
}

export async function persistConversation(conversation: any): Promise<void> {
  if (!isConnected || !conversationsCol) return;
  try {
    await conversationsCol.updateOne({ id: conversation.id }, { $set: conversation }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist conversation:', err);
  }
}

export async function persistMessage(message: any): Promise<void> {
  if (!isConnected || !messagesCol) return;
  try {
    await messagesCol.updateOne({ id: message.id }, { $set: message }, { upsert: true });
  } catch (err) {
    console.error('[MongoDB] Failed to persist message:', err);
  }
}

export async function loadConversationsFromMongo(): Promise<any[]> {
  if (!isConnected || !conversationsCol) return [];
  try {
    const list = await conversationsCol.find({}).sort({ updated_at: -1 }).toArray();
    return list.map((item: any) => {
      const { _id, ...clean } = item;
      return clean;
    });
  } catch (err) {
    console.error('[MongoDB] Failed to load conversations:', err);
    return [];
  }
}

export async function loadMessagesFromMongo(conversationId: string): Promise<any[]> {
  if (!isConnected || !messagesCol) return [];
  try {
    const list = await messagesCol.find({ conversationId }).sort({ created_at: 1 }).toArray();
    return list.map((item: any) => {
      const { _id, ...clean } = item;
      return clean;
    });
  } catch (err) {
    console.error('[MongoDB] Failed to load messages:', err);
    return [];
  }
}
