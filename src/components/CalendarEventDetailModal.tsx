import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  AlignLeft,
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Trash2,
  Edit3,
  ExternalLink,
  Check,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { showToast } from '../store/toastStore';
import { UnifiedCalendarEvent, InviteStatus } from '../types';
import { useAuthStore } from '../store/authStore';
import { EVENT_CATEGORIES, getCategoryColor, getCategoryTextColor } from '../utils/calendarConfig';

interface CalendarEventDetailModalProps {
  event: UnifiedCalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CalendarEventDetailModal: React.FC<CalendarEventDetailModalProps> = ({
  event,
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (event) {
      setTitle(event.title || '');
      setLocation(event.location || '');
      setDescription(event.description || '');
      setIsEditing(false);
    }
  }, [event]);

  const respondMutation = useMutation({
    mutationFn: async (status: InviteStatus) => {
      if (!event) return;
      const res: any = await apiClient.patch(`/calendar/events/${event.source_id}/respond`, { status });
      return res.data;
    },
    onSuccess: (_, status) => {
      showToast({
        type: 'success',
        title: 'RSVP Updated',
        message: `You marked your status as ${status.toLowerCase()}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'RSVP Failed',
        message: err.response?.data?.error?.message || 'Failed to update response.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!event) return;
      const res: any = await apiClient.delete(`/calendar/events/${event.source_id}`);
      return res.data;
    },
    onSuccess: () => {
      showToast({ type: 'success', title: 'Event Deleted', message: 'Calendar event removed.' });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      onClose();
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Delete Failed',
        message: err.response?.data?.error?.message || 'Failed to delete event.',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!event) return;
      const res: any = await apiClient.patch(`/calendar/events/${event.source_id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      showToast({ type: 'success', title: 'Event Updated', message: 'Calendar event changes saved.' });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setIsEditing(false);
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: err.response?.data?.error?.message || 'Failed to update event.',
      });
    },
  });

  if (!isOpen || !event) return null;

  const isTask = event.type === 'TASK';
  const myInviteeRecord = event.invitees?.find((i) => i.user_id === currentUser?.id);

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      title,
      location,
      description,
    });
  };

  const formatDateRange = (startStr: string, endStr: string, isAllDay: boolean) => {
    const s = new Date(startStr);
    const e = new Date(endStr);

    if (isAllDay) {
      return s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }

    const dateFormatted = s.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const startTime = s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `${dateFormatted} · ${startTime} – ${endTime}`;
  };

  const getStatusBadge = (status: InviteStatus) => {
    switch (status) {
      case 'ACCEPTED':
        return <span className="text-emerald-600 flex items-center gap-1 text-[11px] font-medium"><CheckCircle2 size={12} /> Accepted</span>;
      case 'DECLINED':
        return <span className="text-rose-600 flex items-center gap-1 text-[11px] font-medium"><XCircle size={12} /> Declined</span>;
      case 'TENTATIVE':
        return <span className="text-amber-600 flex items-center gap-1 text-[11px] font-medium"><HelpCircle size={12} /> Maybe</span>;
      default:
        return <span className="text-slate-400 text-[11px] font-medium">Awaiting response</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header Bar with Category Color Accent */}
        <div
          className="h-3 w-full"
          style={{ backgroundColor: event.color || (isTask ? EVENT_CATEGORIES.TASK.color : getCategoryColor(event.event_type)) }}
        />

        <div className="p-6 space-y-5">
          {/* Top Title & Close */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-xs"
                  style={{
                    backgroundColor: event.color || (isTask ? EVENT_CATEGORIES.TASK.color : getCategoryColor(event.event_type)),
                    color: getCategoryTextColor(event.color || (isTask ? EVENT_CATEGORIES.TASK.color : getCategoryColor(event.event_type)), isTask ? 'TASK' : event.event_type),
                  }}
                >
                  {isTask
                    ? `Assigned Task (${event.priority || 'MEDIUM'})`
                    : (event.event_type && EVENT_CATEGORIES[event.event_type]?.label) || event.event_type || 'Event'}
                </span>
                {event.status && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 uppercase">
                    {event.status}
                  </span>
                )}
              </div>

              {!isEditing ? (
                <h3 className="font-semibold text-xl text-slate-900 leading-tight break-words">
                  {event.title}
                </h3>
              ) : (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-lg font-semibold px-2.5 py-1 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          {/* Time & Date */}
          <div className="flex items-center gap-3 text-sm font-medium text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <Clock size={18} className="text-slate-400 shrink-0" />
            <span>{formatDateRange(event.start_at, event.end_at, event.is_all_day)}</span>
          </div>

          {/* Location */}
          {(event.location || isEditing) && !isTask && (
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <MapPin size={18} className="text-slate-400 shrink-0" />
              {!isEditing ? (
                <span className="font-medium text-slate-800 break-all">{event.location}</span>
              ) : (
                <input
                  type="text"
                  value={location}
                  placeholder="Location or meeting link"
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          )}

          {/* Description */}
          {(event.description || isEditing) && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <AlignLeft size={14} />
                <span>Description</span>
              </div>
              {!isEditing ? (
                <p className="text-sm text-slate-700 leading-relaxed bg-slate-50/50 p-3 rounded-xl border border-slate-100 whitespace-pre-line">
                  {event.description}
                </p>
              ) : (
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          )}

          {/* Linked Task Link */}
          {(event.linked_task_id || isTask) && (
            <div className="pt-1">
              <Link
                to={`/tasks/${event.linked_task_id || event.source_id}`}
                className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-3 py-2 rounded-xl transition-colors border border-indigo-200/60"
              >
                <ExternalLink size={14} />
                <span>Open Linked Task Detail</span>
              </Link>
            </div>
          )}

          {/* Invitees List */}
          {event.invitees && event.invitees.length > 0 && !isTask && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Users size={14} />
                <span>Attendees ({event.invitees.length})</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {event.invitees.map((inv) => (
                  <div
                    key={inv.user_id}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center font-medium text-[10px]">
                        {inv.name?.charAt(0) || 'U'}
                      </div>
                      <span className="font-medium text-slate-800">{inv.name}</span>
                    </div>
                    {getStatusBadge(inv.status)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invitee RSVP Bar */}
          {!isTask && myInviteeRecord && !isEditing && (
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-600">Going?</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => respondMutation.mutate('ACCEPTED')}
                  disabled={respondMutation.isPending}
                  className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all border ${
                    myInviteeRecord.status === 'ACCEPTED'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  Yes
                </button>
                <button
                  onClick={() => respondMutation.mutate('TENTATIVE')}
                  disabled={respondMutation.isPending}
                  className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all border ${
                    myInviteeRecord.status === 'TENTATIVE'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50 hover:text-amber-700'
                  }`}
                >
                  Maybe
                </button>
                <button
                  onClick={() => respondMutation.mutate('DECLINED')}
                  disabled={respondMutation.isPending}
                  className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all border ${
                    myInviteeRecord.status === 'DECLINED'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-700'
                  }`}
                >
                  No
                </button>
              </div>
            </div>
          )}

          {/* Edit / Delete Bar for Creator/Admin */}
          {event.can_edit && !isTask && (
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              {!isEditing ? (
                <>
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 size={14} />
                    Delete Event
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
                  >
                    <Edit3 size={14} />
                    Edit Event
                  </button>
                </>
              ) : (
                <div className="flex items-center justify-end gap-2 w-full">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={updateMutation.isPending}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"
                  >
                    <Check size={14} />
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
