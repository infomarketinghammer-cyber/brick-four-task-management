import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckSquare,
  Lock,
} from 'lucide-react';

import { apiClient } from '../api/client';
import { showToast } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { UnifiedCalendarEvent } from '../types';
import { CreateCalendarEventModal } from '../components/CreateCalendarEventModal';
import { CalendarEventDetailModal } from '../components/CalendarEventDetailModal';
import { EVENT_CATEGORIES, getCategoryColor, getCategoryTextColor } from '../utils/calendarConfig';

export const CalendarPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const calendarRef = useRef<any>(null);

  const currentUser = useAuthStore((s) => s.user);

  const initialDate = searchParams.get('date') || undefined;
  const initialView = searchParams.get('view') || 'dayGridMonth';

  const [currentView, setCurrentView] = useState(initialView);
  const [titleHeader, setTitleHeader] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDefaultStart, setCreateDefaultStart] = useState<string | undefined>(undefined);
  const [createDefaultEnd, setCreateDefaultEnd] = useState<string | undefined>(undefined);

  const [selectedEvent, setSelectedEvent] = useState<UnifiedCalendarEvent | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Filters state
  const [categoryFilters, setCategoryFilters] = useState({
    MEETING: true,
    CLIENT_MEETING: true,
    TASK: true,
    DEADLINE: true,
    REMINDER: true,
    HOLIDAY: true,
  });

  const isManager =
    currentUser?.role === 'ADMIN' ||
    (currentUser?.hierarchy_level ?? 3) < 3;

  // Query Unified Calendar Events for Logged-in User
  const { data: events = [] } = useQuery<UnifiedCalendarEvent[]>({
    queryKey: ['calendar-events'],
    queryFn: async () => {
      const res: any = await apiClient.get('/calendar');
      const list = res.data || res;
      return Array.isArray(list) ? list : [];
    },
  });

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: async ({ eventId, start_at, end_at }: { eventId: string; start_at: string; end_at: string }) => {
      const res: any = await apiClient.patch(`/calendar/events/${eventId}`, {
        start_at,
        end_at,
      });
      return res.data;
    },
    onSuccess: () => {
      showToast({ type: 'success', title: 'Rescheduled', message: 'Event time updated successfully.' });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Reschedule Failed',
        message: err.response?.data?.error?.message || 'Failed to update event time.',
      });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
  });

  // Jump to query date if present
  useEffect(() => {
    if (initialDate && calendarRef.current) {
      calendarRef.current.getApi().gotoDate(initialDate);
    }
  }, [initialDate]);

  // Filter events based on active category checkboxes
  const safeEvents = Array.isArray(events) ? events : [];
  const filteredEvents = safeEvents.filter((evt) => {
    if (evt.type === 'TASK') return categoryFilters.TASK;
    if (evt.event_type && categoryFilters[evt.event_type as keyof typeof categoryFilters] !== undefined) {
      return categoryFilters[evt.event_type as keyof typeof categoryFilters];
    }
    return true;
  });

  // Format events for FullCalendar
  const fullCalendarEvents = filteredEvents.map((evt) => {
    const categoryKey = evt.type === 'TASK' ? 'TASK' : (evt.event_type || 'MEETING');
    const resolvedColor = evt.color || getCategoryColor(categoryKey);
    return {
      id: evt.id,
      title: evt.title,
      start: evt.start_at,
      end: evt.end_at,
      allDay: evt.is_all_day,
      backgroundColor: resolvedColor,
      borderColor: resolvedColor,
      editable: evt.type === 'EVENT' && evt.can_edit,
      extendedProps: { ...evt, color: resolvedColor },
    };
  });

  const handleEventClick = (info: any) => {
    const originalEvent = info.event.extendedProps as UnifiedCalendarEvent;
    setSelectedEvent(originalEvent);
    setIsDetailModalOpen(true);
  };

  const handleEventDropOrResize = (info: any) => {
    const originalEvent = info.event.extendedProps as UnifiedCalendarEvent;

    if (originalEvent.type === 'TASK') {
      info.revert();
      showToast({
        type: 'error',
        title: 'Task Locked',
        message: 'Tasks mirror task due dates. Please update due date on the task detail page.',
      });
      return;
    }

    if (!originalEvent.can_edit) {
      info.revert();
      showToast({ type: 'error', title: 'Permission Denied', message: 'You cannot edit this event.' });
      return;
    }

    const newStart = info.event.start?.toISOString();
    const newEnd = info.event.end?.toISOString() || info.event.start?.toISOString();

    if (newStart) {
      rescheduleMutation.mutate({
        eventId: originalEvent.source_id,
        start_at: newStart,
        end_at: newEnd,
      });
    }
  };

  const handleDateSelect = (selectInfo: any) => {
    if (!isManager) {
      showToast({
        type: 'error',
        title: 'Permission Required',
        message: 'Only managers can create team events.',
      });
      return;
    }

    setCreateDefaultStart(selectInfo.startStr);
    setCreateDefaultEnd(selectInfo.endStr);
    setIsCreateModalOpen(true);
  };

  // Calendar Controls
  const handlePrev = () => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.prev();
      setTitleHeader(api.view.title);
    }
  };

  const handleNext = () => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.next();
      setTitleHeader(api.view.title);
    }
  };

  const handleToday = () => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.today();
      setTitleHeader(api.view.title);
    }
  };

  const handleViewChange = (viewName: string) => {
    setCurrentView(viewName);
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.changeView(viewName);
      setTitleHeader(api.view.title);
    }
  };

  const renderEventContent = (eventInfo: any) => {
    const evt = eventInfo.event.extendedProps as UnifiedCalendarEvent;
    const isTask = evt.type === 'TASK';
    const categoryKey = isTask ? 'TASK' : (evt.event_type || 'MEETING');
    const bgColor = evt.color || getCategoryColor(categoryKey);
    const textColor = getCategoryTextColor(bgColor, categoryKey);

    return (
      <div
        className="w-full flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded-md text-[11px] font-bold leading-tight shadow-xs select-none overflow-hidden"
        style={{
          backgroundColor: bgColor,
          color: textColor,
        }}
      >
        {isTask ? (
          <CheckSquare size={11} className="shrink-0" style={{ color: textColor }} />
        ) : !evt.can_edit ? (
          <Lock size={11} className="shrink-0 opacity-80" style={{ color: textColor }} />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: textColor, opacity: 0.6 }} />
        )}
        <span className="truncate">{eventInfo.event.title}</span>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto font-sans">
      {/* Main Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/20 shrink-0">
            <CalendarIcon size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              My Schedule & Calendar
            </h1>
            <p className="text-xs text-slate-500">
              Interactive timeline for meetings, task deadlines, and milestones.
            </p>
          </div>
        </div>

        {/* Action Button */}
        {isManager && (
          <button
            onClick={() => {
              setCreateDefaultStart(undefined);
              setCreateDefaultEnd(undefined);
              setIsCreateModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20"
          >
            <Plus size={18} />
            <span>Schedule Event</span>
          </button>
        )}
      </div>

      {/* Calendar Layout Container */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Sidebar: Filters & Legend */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-6 lg:col-span-1">
          {/* Event Category Filters */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Filter size={14} />
              <span>Event Categories</span>
            </h3>

            <div className="space-y-2">
              {[
                EVENT_CATEGORIES.MEETING,
                EVENT_CATEGORIES.CLIENT_MEETING,
                EVENT_CATEGORIES.TASK,
                EVENT_CATEGORIES.DEADLINE,
                EVENT_CATEGORIES.REMINDER,
                EVENT_CATEGORIES.HOLIDAY,
              ].map((cat) => {
                const checked = categoryFilters[cat.key as keyof typeof categoryFilters];
                return (
                  <label
                    key={cat.key}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer select-none text-xs font-medium text-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-3 h-3 rounded-full ${cat.bgClass}`} />
                      <span>{cat.label}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setCategoryFilters((prev) => ({
                          ...prev,
                          [cat.key]: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Legend Details */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-2">
            <p className="font-semibold text-slate-800">Tips & Guidelines</p>
            <ul className="text-slate-600 space-y-1 list-disc pl-4 text-[11px]">
              <li>Drag & drop events in Week or Day view to reschedule.</li>
              <li>Click any empty slot to schedule a new event.</li>
              <li>Tasks display as locked blocks mirroring task due dates.</li>
            </ul>
          </div>
        </div>

        {/* Right Main Calendar Grid */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs lg:col-span-3 space-y-4">
          {/* Custom Calendar Navigation Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <button
                onClick={handleToday}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
              >
                Today
              </button>
              <div className="flex items-center bg-slate-100 rounded-xl p-0.5">
                <button
                  onClick={handlePrev}
                  className="p-1.5 rounded-lg hover:bg-white text-slate-600 transition-colors"
                  title="Previous"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={handleNext}
                  className="p-1.5 rounded-lg hover:bg-white text-slate-600 transition-colors"
                  title="Next"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <h2 className="font-bold text-lg text-slate-900 ml-2">
                {titleHeader || 'Calendar'}
              </h2>
            </div>

            {/* View Switcher Tabs */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              {[
                { id: 'dayGridMonth', label: 'Month' },
                { id: 'timeGridWeek', label: 'Week' },
                { id: 'timeGridDay', label: 'Day' },
                { id: 'listMonth', label: 'Agenda' },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleViewChange(v.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    currentView === v.id
                      ? 'bg-white text-indigo-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* FullCalendar Component */}
          <div className="fullcalendar-custom-wrapper min-h-[650px]">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
              initialView={currentView}
              headerToolbar={false} // Handled by our custom navbar
              events={fullCalendarEvents}
              selectable={isManager}
              select={handleDateSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDropOrResize}
              eventResize={handleEventDropOrResize}
              eventContent={renderEventContent}
              height="auto"
              aspectRatio={1.6}
              datesSet={(dateInfo) => {
                setTitleHeader(dateInfo.view.title);
              }}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateCalendarEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        defaultStart={createDefaultStart}
        defaultEnd={createDefaultEnd}
      />

      <CalendarEventDetailModal
        event={selectedEvent}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedEvent(null);
        }}
      />
    </div>
  );
};
