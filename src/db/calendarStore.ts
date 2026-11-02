import { CalendarEventModel, EventInviteeInfo, EventType, InviteStatus, Task } from '../types';
import { tasksStore } from './tasksStore';
import { persistCalendarEvent, persistDeleteCalendarEvent, persistCalendarInvitee } from './mongodb';

export interface EventInviteeRecord {
  id: string;
  event_id: string;
  user_id: string;
  status: InviteStatus;
  responded_at?: string | null;
}

class CalendarStore {
  public events: Map<string, CalendarEventModel> = new Map();
  public invitees: Map<string, EventInviteeRecord> = new Map();

  constructor() {
    this.seedInitialEvents();
  }

  private seedInitialEvents() {
    this.events.clear();
    this.invitees.clear();
  }

  public addInvitee(eventId: string, userId: string, status: InviteStatus = 'PENDING') {
    const invId = `inv-${eventId}-${userId}`;
    const invRecord = {
      id: invId,
      event_id: eventId,
      user_id: userId,
      status,
      responded_at: status !== 'PENDING' ? new Date().toISOString() : null,
    };
    this.invitees.set(invId, invRecord);
    persistCalendarInvitee(invRecord);
  }

  public getInviteesForEvent(eventId: string): EventInviteeRecord[] {
    const result: EventInviteeRecord[] = [];
    for (const inv of this.invitees.values()) {
      if (inv.event_id === eventId) {
        result.push(inv);
      }
    }
    return result;
  }

  public syncTaskDeadlineEvent(task: Task) {
    // Find existing deadline event for this task
    let deadlineEvt: CalendarEventModel | undefined;
    for (const evt of this.events.values()) {
      if (evt.linked_task_id === task.id && evt.event_type === 'DEADLINE') {
        deadlineEvt = evt;
        break;
      }
    }

    const isCompletedOrCancelled = task.status === 'COMPLETED' || task.status === 'CANCELLED' || task.is_deleted;

    if (isCompletedOrCancelled || !task.due_date) {
      if (deadlineEvt) {
        this.events.delete(deadlineEvt.id);
        // remove invitees
        for (const [id, inv] of this.invitees.entries()) {
          if (inv.event_id === deadlineEvt.id) {
            this.invitees.delete(id);
          }
        }
      }
      return;
    }

    const dueDateObj = new Date(task.due_date);
    const startAt = dueDateObj.toISOString();
    const endAt = dueDateObj.toISOString();

    if (deadlineEvt) {
      deadlineEvt.title = `Deadline: ${task.title}`;
      deadlineEvt.start_at = startAt;
      deadlineEvt.end_at = endAt;
      deadlineEvt.updated_at = new Date().toISOString();
    } else {
      const newEvt: CalendarEventModel = {
        id: `evt-dl-${task.id}`,
        title: `Deadline: ${task.title}`,
        description: `Task Due Date: ${task.title}`,
        event_type: 'DEADLINE',
        created_by_id: task.created_by_id,
        start_at: startAt,
        end_at: endAt,
        is_all_day: true,
        location: null,
        color: '#ef4444', // Task Deadline red
        linked_task_id: task.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.events.set(newEvt.id, newEvt);
    }
  }

  public syncInitialTaskDeadlines() {
    if (!tasksStore || !tasksStore.tasks) return;
    for (const task of tasksStore.tasks.values()) {
      this.syncTaskDeadlineEvent(task);
    }
  }
}

export const calendarStore = new CalendarStore();
