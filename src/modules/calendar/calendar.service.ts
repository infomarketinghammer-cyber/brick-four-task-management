import { calendarStore } from '../../db/calendarStore';
import { dbStore } from '../../db/prisma';
import { tasksStore } from '../../db/tasksStore';
import { canViewTask, getSubordinateIds } from '../../permissions';
import {
  CalendarEventModel,
  EventInviteeInfo,
  EventType,
  InviteStatus,
  UnifiedCalendarEvent,
  User,
} from '../../types';
import { AppError } from '../../utils/errors';
import { getCategoryColor } from '../../utils/calendarConfig';
import { persistCalendarEvent, persistDeleteCalendarEvent } from '../../db/mongodb';

export class CalendarService {
  /**
   * Get unified calendar events for a user in a date range.
   */
  static async getCalendarEvents(
    requester: User,
    options: { start?: string; end?: string; user_id?: string }
  ): Promise<UnifiedCalendarEvent[]> {
    const allUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active);
    let targetUserId = requester.id;
    let isViewingOther = false;

    if (options.user_id && options.user_id !== requester.id) {
      const isReqAdmin = requester.role === 'ADMIN';

      if (!isReqAdmin) {
        throw AppError.forbidden('Access denied: You can only view your own calendar.');
      }
      targetUserId = options.user_id;
      isViewingOther = true;
    }

    const targetUser = dbStore.users.get(targetUserId);
    if (!targetUser) {
      throw AppError.notFound('Target user not found');
    }

    const unifiedEvents: UnifiedCalendarEvent[] = [];
    const allTasks = Array.from(tasksStore.tasks.values()).filter((t) => !t.is_deleted);

    // Helper to format date
    const toIso = (val?: string | Date | null) =>
      val ? new Date(val).toISOString() : new Date().toISOString();

    // 1. Tasks assigned TO the target user
    const tasksAssignedToUser = allTasks.filter((t) => t.assigned_to_id === targetUserId);
    for (const task of tasksAssignedToUser) {
      const startAt = toIso(task.start_date || task.created_at || task.due_date);
      const endAt = toIso(task.due_date || task.start_date || task.created_at);
      const isAllDay = !task.start_date && !task.due_date ? true : false;

      unifiedEvents.push({
        id: task.id,
        title: task.title,
        description: task.description || null,
        start_at: startAt,
        end_at: endAt,
        is_all_day: isAllDay,
        color: '#8b5cf6', // Assigned task in purple
        type: 'TASK',
        source_id: task.id,
        priority: task.priority,
        status: task.status,
        assigned_to_id: task.assigned_to_id,
        created_by_id: task.created_by_id,
        assigned_by_me: false,
        invitees: [],
        can_edit:
          !isViewingOther &&
          (task.created_by_id === requester.id ||
            task.assigned_to_id === requester.id ||
            requester.role === 'ADMIN'),
      });
    }

    // 2. Tasks assigned BY the target user to others
    const tasksAssignedByUser = allTasks.filter(
      (t) => t.created_by_id === targetUserId && t.assigned_to_id !== targetUserId
    );
    for (const task of tasksAssignedByUser) {
      const startAt = toIso(task.start_date || task.created_at || task.due_date);
      const endAt = toIso(task.due_date || task.start_date || task.created_at);
      const isAllDay = !task.start_date && !task.due_date ? true : false;

      unifiedEvents.push({
        id: `task-by-${task.id}`,
        title: task.title,
        description: task.description || null,
        start_at: startAt,
        end_at: endAt,
        is_all_day: isAllDay,
        color: '#8b5cf6', // Assigned task in purple
        type: 'TASK',
        source_id: task.id,
        priority: task.priority,
        status: task.status,
        assigned_to_id: task.assigned_to_id,
        created_by_id: task.created_by_id,
        assigned_by_me: true,
        invitees: [],
        can_edit:
          !isViewingOther && (task.created_by_id === requester.id || requester.role === 'ADMIN'),
      });
    }

    // 3. Calendar Events where target user is creator or invitee
    for (const evt of calendarStore.events.values()) {
      if (evt.event_type === 'DEADLINE') {
        // Skip synthetic DEADLINE events because tasks are already directly loaded and formatted above
        continue;
      }
      const inviteesForEvt = calendarStore.getInviteesForEvent(evt.id);
      const isCreator = evt.created_by_id === targetUserId;
      const isInvitee = inviteesForEvt.some((i) => i.user_id === targetUserId);

      if (isCreator || isInvitee) {
        // Enriched invitees
        const enrichedInvitees: EventInviteeInfo[] = inviteesForEvt.map((inv) => {
          const invUser = dbStore.users.get(inv.user_id);
          return {
            id: inv.id,
            user_id: inv.user_id,
            name: invUser?.name || 'User',
            avatar_url: invUser?.avatar_url || null,
            status: inv.status,
            responded_at: inv.responded_at,
          };
        });

        // Exact palette color mapping
        const defaultColor = getCategoryColor(evt.event_type);

        const canEdit =
          !isViewingOther && (evt.created_by_id === requester.id || requester.role === 'ADMIN');

        unifiedEvents.push({
          id: evt.id,
          title: evt.title,
          description: evt.description || null,
          start_at: evt.start_at,
          end_at: evt.end_at,
          is_all_day: evt.is_all_day,
          location: evt.location || null,
          color: evt.color || defaultColor,
          type: 'EVENT',
          source_id: evt.id,
          event_type: evt.event_type,
          linked_task_id: evt.linked_task_id || null,
          created_by_id: evt.created_by_id,
          invitees: enrichedInvitees,
          can_edit: canEdit,
        });
      }
    }

    // Date range filtering
    if (options.start && options.end) {
      const rangeStart = new Date(options.start).getTime();
      const rangeEnd = new Date(options.end).getTime();

      return unifiedEvents.filter((evt) => {
        const evtStart = new Date(evt.start_at).getTime();
        const evtEnd = new Date(evt.end_at).getTime();
        return evtStart <= rangeEnd && evtEnd >= rangeStart;
      });
    }

    return unifiedEvents;
  }

  /**
   * Create a new calendar event (Managers only).
   */
  static async createCalendarEvent(
    requester: User,
    payload: {
      title: string;
      description?: string;
      event_type?: EventType;
      start_at: string;
      end_at?: string;
      is_all_day?: boolean;
      location?: string;
      color?: string;
      invitee_ids?: string[];
      linked_task_id?: string;
      recurrence_rule?: any;
    }
  ) {
    const allUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active);

    if (!payload.title || !payload.title.trim()) {
      throw AppError.badRequest('Event title is required');
    }
    if (!payload.start_at) {
      throw AppError.badRequest('Event start_at date/time is required');
    }

    const startObj = new Date(payload.start_at);
    let endObj = payload.end_at ? new Date(payload.end_at) : new Date(startObj.getTime() + 3600000);
    if (endObj <= startObj) {
      endObj = new Date(startObj.getTime() + 3600000);
    }

    // Any active employee can create calendar events and invite team members/colleagues
    const allowedInviteeIds = new Set<string>();
    allUsers.forEach((u) => allowedInviteeIds.add(u.id));

    const rawInvitees = Array.isArray(payload.invitee_ids) ? payload.invitee_ids : [];
    const validInviteeIds = rawInvitees.filter((id) => allowedInviteeIds.has(id));

    const newEvent: CalendarEventModel = {
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: payload.title.trim(),
      description: payload.description ? payload.description.trim() : null,
      event_type: payload.event_type || 'MEETING',
      created_by_id: requester.id,
      start_at: startObj.toISOString(),
      end_at: endObj.toISOString(),
      is_all_day: Boolean(payload.is_all_day),
      location: payload.location ? payload.location.trim() : null,
      color: payload.color || getCategoryColor(payload.event_type || 'MEETING'),
      linked_task_id: payload.linked_task_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    calendarStore.events.set(newEvent.id, newEvent);
    persistCalendarEvent(newEvent);

    // Add creator as ACCEPTED invitee
    calendarStore.addInvitee(newEvent.id, requester.id, 'ACCEPTED');

    // Add valid invitees as PENDING
    for (const invId of validInviteeIds) {
      if (invId !== requester.id) {
        calendarStore.addInvitee(newEvent.id, invId, 'PENDING');
      }
    }

    return this.getCalendarEventDetail(requester, newEvent.id);
  }

  /**
   * Get single event detail.
   */
  static async getCalendarEventDetail(requester: User, eventId: string) {
    const evt = calendarStore.events.get(eventId);
    if (!evt) {
      // Check if it's a task ID
      const task = tasksStore.tasks.get(eventId.replace('task-by-', ''));
      if (task && !task.is_deleted) {
        const allUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active);
        if (!canViewTask(requester, task, { allUsers, getTask: (tid) => tasksStore.tasks.get(tid) })) {
          throw AppError.forbidden('Access denied: You do not have permission to view this task.');
        }

        const startAt = task.start_date || task.created_at || task.due_date || new Date().toISOString();
        const endAt = task.due_date || task.start_date || task.created_at || new Date().toISOString();
        return {
          id: task.id,
          title: task.title,
          description: task.description || null,
          start_at: startAt,
          end_at: endAt,
          is_all_day: !task.start_date && !task.due_date,
          color: task.assigned_to_id === requester.id ? '#6366f1' : '#a855f7',
          type: 'TASK',
          source_id: task.id,
          priority: task.priority,
          status: task.status,
          assigned_to_id: task.assigned_to_id,
          created_by_id: task.created_by_id,
          invitees: [],
          can_edit: task.created_by_id === requester.id || requester.role === 'ADMIN',
        };
      }
      throw AppError.notFound('Event not found');
    }

    const inviteesForEvt = calendarStore.getInviteesForEvent(evt.id);
    const isCreator = evt.created_by_id === requester.id;
    const isInvitee = inviteesForEvt.some((i) => i.user_id === requester.id);
    const isAdmin = requester.role === 'ADMIN';

    if (!isCreator && !isInvitee && !isAdmin) {
      throw AppError.forbidden('Access denied: You are not a participant in this event.');
    }

    const enrichedInvitees: EventInviteeInfo[] = inviteesForEvt.map((inv) => {
      const invUser = dbStore.users.get(inv.user_id);
      return {
        id: inv.id,
        user_id: inv.user_id,
        name: invUser?.name || 'User',
        avatar_url: invUser?.avatar_url || null,
        status: inv.status,
        responded_at: inv.responded_at,
      };
    });

    const defaultColor = getCategoryColor(evt.event_type);

    return {
      id: evt.id,
      title: evt.title,
      description: evt.description || null,
      start_at: evt.start_at,
      end_at: evt.end_at,
      is_all_day: evt.is_all_day,
      location: evt.location || null,
      color: evt.color || defaultColor,
      type: 'EVENT',
      source_id: evt.id,
      event_type: evt.event_type,
      linked_task_id: evt.linked_task_id || null,
      created_by_id: evt.created_by_id,
      invitees: enrichedInvitees,
      can_edit: evt.created_by_id === requester.id || requester.role === 'ADMIN',
    };
  }

  /**
   * Update calendar event. Reschedules linked task if present.
   */
  static async updateCalendarEvent(requester: User, eventId: string, payload: any) {
    const evt = calendarStore.events.get(eventId);
    if (!evt) {
      throw AppError.notFound('Calendar event not found');
    }

    if (evt.created_by_id !== requester.id && requester.role !== 'ADMIN') {
      throw AppError.forbidden('Only the creator or admin can modify this event');
    }

    if (payload.title !== undefined) evt.title = String(payload.title).trim();
    if (payload.description !== undefined) evt.description = payload.description ? String(payload.description).trim() : null;
    if (payload.event_type !== undefined) evt.event_type = payload.event_type;
    if (payload.is_all_day !== undefined) evt.is_all_day = Boolean(payload.is_all_day);
    if (payload.location !== undefined) evt.location = payload.location ? String(payload.location).trim() : null;
    if (payload.color !== undefined) evt.color = payload.color || null;

    if (payload.start_at !== undefined) {
      evt.start_at = new Date(payload.start_at).toISOString();
    }
    if (payload.end_at !== undefined) {
      evt.end_at = new Date(payload.end_at).toISOString();
    }

    evt.updated_at = new Date().toISOString();
    calendarStore.events.set(evt.id, evt);
    persistCalendarEvent(evt);

    // Reschedule linked task if present
    if (evt.linked_task_id) {
      const task = tasksStore.tasks.get(evt.linked_task_id);
      if (task && !task.is_deleted) {
        task.start_date = evt.start_at;
        task.due_date = evt.end_at;
        task.updated_at = new Date().toISOString();
        tasksStore.tasks.set(task.id, task);
      }
    }

    // Update invitees if provided
    if (Array.isArray(payload.invitee_ids)) {
      // Retain creator as ACCEPTED
      const currentInvitees = calendarStore.getInviteesForEvent(evt.id);
      const newInviteeSet = new Set<string>(payload.invitee_ids as string[]);
      newInviteeSet.add(requester.id);

      for (const inv of currentInvitees) {
        if (!newInviteeSet.has(inv.user_id) && inv.user_id !== evt.created_by_id) {
          calendarStore.invitees.delete(inv.id);
        }
      }

      for (const invId of newInviteeSet) {
        const existing = currentInvitees.find((i) => i.user_id === invId);
        if (!existing) {
          calendarStore.addInvitee(
            evt.id,
            invId,
            invId === evt.created_by_id ? 'ACCEPTED' : 'PENDING'
          );
        }
      }
    }

    return this.getCalendarEventDetail(requester, evt.id);
  }

  /**
   * Delete calendar event.
   */
  static async deleteCalendarEvent(requester: User, eventId: string) {
    const evt = calendarStore.events.get(eventId);
    if (!evt) {
      throw AppError.notFound('Event not found');
    }

    if (evt.created_by_id !== requester.id && requester.role !== 'ADMIN') {
      throw AppError.forbidden('Only creator or admin can delete this event');
    }

    calendarStore.events.delete(eventId);
    persistDeleteCalendarEvent(eventId);
    for (const [invId, inv] of calendarStore.invitees.entries()) {
      if (inv.event_id === eventId) {
        calendarStore.invitees.delete(invId);
      }
    }

    return { message: 'Event deleted successfully' };
  }

  /**
   * Respond to event invite (ACCEPTED, DECLINED, TENTATIVE).
   */
  static async respondToCalendarEvent(
    requester: User,
    eventId: string,
    status: InviteStatus
  ) {
    const evt = calendarStore.events.get(eventId);
    if (!evt) {
      throw AppError.notFound('Event not found');
    }

    let invId = `inv-${eventId}-${requester.id}`;
    let invitee = calendarStore.invitees.get(invId);

    if (!invitee) {
      calendarStore.addInvitee(eventId, requester.id, status);
      invitee = calendarStore.invitees.get(invId)!;
    } else {
      invitee.status = status;
      invitee.responded_at = new Date().toISOString();
      calendarStore.invitees.set(invId, invitee);
    }

    return {
      id: invitee.id,
      event_id: eventId,
      user_id: requester.id,
      status: invitee.status,
      responded_at: invitee.responded_at,
    };
  }
}
