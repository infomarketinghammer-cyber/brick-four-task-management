import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar as CalendarIcon, ChevronRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { UnifiedCalendarEvent } from '../types';
import { getCategoryColor } from '../utils/calendarConfig';

export const MiniCalendarWidget: React.FC = () => {
  const navigate = useNavigate();
  const today = new Date();

  // Get current week days starting from Monday
  const currentDayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon
  const distToMon = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;

  const monday = new Date(today);
  monday.setDate(today.getDate() - distToMon);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const weekStartStr = monday.toISOString().split('T')[0];
  const sunday = weekDays[6];
  const weekEndStr = sunday.toISOString().split('T')[0];

  const { data: events = [] } = useQuery<UnifiedCalendarEvent[]>({
    queryKey: ['calendar-events-mini', weekStartStr, weekEndStr],
    queryFn: async () => {
      const res: any = await apiClient.get(
        `/calendar?start=${weekStartStr}T00:00:00.000Z&end=${weekEndStr}T23:59:59.999Z`
      );
      const list = res.data || res;
      return Array.isArray(list) ? list : [];
    },
  });

  const getEventsForDay = (dateObj: Date) => {
    const dayStr = dateObj.toISOString().split('T')[0];
    const safeEvents = Array.isArray(events) ? events : [];
    return safeEvents.filter((e) => {
      const evtStartDay = new Date(e.start_at).toISOString().split('T')[0];
      return evtStartDay === dayStr;
    });
  };

  const isToday = (d: Date) => d.toDateString() === today.toDateString();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <CalendarIcon size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-900">This Week's Schedule</h3>
            <p className="text-[11px] text-slate-500">
              {monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
              {sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/calendar')}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
        >
          <span>Open Calendar</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 7-Cell Day Strip */}
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {weekDays.map((dateObj, idx) => {
          const dayEvents = getEventsForDay(dateObj);
          const activeToday = isToday(dateObj);
          const dateISO = dateObj.toISOString().split('T')[0];

          return (
            <div
              key={idx}
              onClick={() => navigate(`/calendar?date=${dateISO}&view=timeGridDay`)}
              className={`p-2 rounded-xl cursor-pointer transition-all border ${
                activeToday
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-100'
              }`}
            >
              <p className={`text-[10px] font-semibold uppercase ${activeToday ? 'text-indigo-200' : 'text-slate-400'}`}>
                {dateObj.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </p>
              <p className="text-sm font-bold mt-0.5">{dateObj.getDate()}</p>

              {/* Event Dots */}
              <div className="flex items-center justify-center gap-1 mt-1.5 h-2">
                {dayEvents.slice(0, 3).map((evt, eIdx) => (
                  <span
                    key={eIdx}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: activeToday ? '#ffffff' : evt.color || getCategoryColor(evt.event_type),
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
