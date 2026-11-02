import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Calendar, Clock, MapPin, AlignLeft, Users, Check, Tag, Link2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { showToast } from '../store/toastStore';
import { EventType, User, Task } from '../types';
import { COLOR_SWATCHES, EVENT_CATEGORIES, getCategoryColor } from '../utils/calendarConfig';

interface CreateCalendarEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStart?: string;
  defaultEnd?: string;
}

export const CreateCalendarEventModal: React.FC<CreateCalendarEventModalProps> = ({
  isOpen,
  onClose,
  defaultStart,
  defaultEnd,
}) => {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('MEETING');
  const [isAllDay, setIsAllDay] = useState(false);

  const formatDefaultDateTime = (isoStr?: string, offsetHours = 0) => {
    const d = isoStr ? new Date(isoStr) : new Date();
    if (offsetHours !== 0) {
      d.setHours(d.getHours() + offsetHours);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const [startAt, setStartAt] = useState(() => formatDefaultDateTime(defaultStart, 0));
  const [endAt, setEndAt] = useState(() => formatDefaultDateTime(defaultEnd || defaultStart, 1));
  const [location, setLocation] = useState('');
  const [color, setColor] = useState(() => getCategoryColor('MEETING'));
  const [selectedInviteeIds, setSelectedInviteeIds] = useState<string[]>([]);
  const [linkedTaskId, setLinkedTaskId] = useState<string>('');
  const [inviteeSearch, setInviteeSearch] = useState('');

  // Auto update color whenever eventType changes
  const handleCategoryChange = (newType: EventType) => {
    setEventType(newType);
    const autoColor = getCategoryColor(newType);
    setColor(autoColor);
  };

  // Query users for invitees
  const { data: usersData = [] } = useQuery<User[]>({
    queryKey: ['users-list'],
    queryFn: async () => {
      const res: any = await apiClient.get('/users?scope=all');
      const list = res.data?.users || res.users || res.data || res;
      return Array.isArray(list) ? list : [];
    },
    enabled: isOpen,
  });

  // Query user tasks for linked task
  const { data: tasksData = [] } = useQuery<Task[]>({
    queryKey: ['my-tasks-list'],
    queryFn: async () => {
      const res: any = await apiClient.get('/tasks');
      const list = res.data?.tasks || res.tasks || res.data || res;
      return Array.isArray(list) ? list : [];
    },
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res: any = await apiClient.post('/calendar/events', payload);
      return res.data;
    },
    onSuccess: () => {
      showToast({ type: 'success', title: 'Event Created', message: 'Calendar event created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      resetForm();
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to create event';
      showToast({ type: 'error', title: 'Error', message: msg });
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEventType('MEETING');
    setIsAllDay(false);
    setLocation('');
    setColor(getCategoryColor('MEETING'));
    setSelectedInviteeIds([]);
    setLinkedTaskId('');
  };

  if (!isOpen) return null;

  const safeUsersData = Array.isArray(usersData) ? usersData : [];
  const safeTasksData = Array.isArray(tasksData) ? tasksData : [];

  const filteredUsers = safeUsersData.filter(
    (u) =>
      (u.name || '').toLowerCase().includes(inviteeSearch.toLowerCase()) ||
      (u.designation || '').toLowerCase().includes(inviteeSearch.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast({ type: 'error', message: 'Event title is required' });
      return;
    }

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      event_type: eventType,
      is_all_day: isAllDay,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      location: location.trim() || undefined,
      color,
      invitee_ids: selectedInviteeIds,
      linked_task_id: linkedTaskId || undefined,
    });
  };

  const toggleInvitee = (userId: string) => {
    setSelectedInviteeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <Calendar size={18} />
            </div>
            <h2 className="font-semibold text-lg">Schedule New Event</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Event Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Architecture Strategy Sync"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Event Type & All Day */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Event Category
              </label>
              <select
                value={eventType}
                onChange={(e) => handleCategoryChange(e.target.value as EventType)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium text-slate-800 bg-white"
              >
                <option value="MEETING">Team Meeting (Blue)</option>
                <option value="CLIENT_MEETING">Client Meeting (Green)</option>
                <option value="REMINDER">Reminder (Yellow)</option>
                <option value="HOLIDAY">Holiday / Rest (Grey)</option>
                <option value="DEADLINE">Task Deadline (Red)</option>
                <option value="OTHER">Other Event</option>
              </select>
            </div>

            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-700">All Day Event</span>
              </label>
            </div>
          </div>

          {/* Date & Times */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Start Date & Time
              </label>
              <div className="relative">
                <input
                  type={isAllDay ? 'date' : 'datetime-local'}
                  value={isAllDay ? startAt.split('T')[0] : startAt}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStartAt(isAllDay ? `${val}T09:00` : val);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                End Date & Time
              </label>
              <div className="relative">
                <input
                  type={isAllDay ? 'date' : 'datetime-local'}
                  value={isAllDay ? endAt.split('T')[0] : endAt}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEndAt(isAllDay ? `${val}T17:00` : val);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Location / Video Link
            </label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Boardroom B or meet.google.com/xyz"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-slate-800"
              />
            </div>
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Color Marker
            </label>
            <div className="flex items-center gap-3">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  type="button"
                  key={swatch.value}
                  onClick={() => setColor(swatch.value)}
                  className={`w-7 h-7 rounded-full ${swatch.bg} transition-all flex items-center justify-center text-white ${
                    color === swatch.value ? 'ring-2 ring-offset-2 ring-indigo-600 scale-110' : 'opacity-80 hover:opacity-100'
                  }`}
                  title={swatch.label}
                >
                  {color === swatch.value && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>

          {/* Invitees */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Invite Attendees
            </label>
            <input
              type="text"
              placeholder="Search team members..."
              value={inviteeSearch}
              onChange={(e) => setInviteeSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 mb-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-slate-400 p-2 text-center">No team members found</p>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedInviteeIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleInvitee(u.id)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                        isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center font-medium text-[10px]">
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{u.name}</p>
                          <p className="text-[10px] text-slate-500">{u.designation}</p>
                        </div>
                      </div>
                      {isSelected && <Check size={14} className="text-indigo-600" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Linked Task */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Link to Task (Optional)
            </label>
            <select
              value={linkedTaskId}
              onChange={(e) => setLinkedTaskId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-slate-800 bg-white"
            >
              <option value="">-- No linked task --</option>
              {safeTasksData.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.status}] {t.title}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Description / Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add agenda, meeting link notes, or objectives..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-slate-800 placeholder:text-slate-400"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {createMutation.isPending ? 'Scheduling...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
