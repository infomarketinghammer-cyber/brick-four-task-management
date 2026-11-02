import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import {
  CheckSquare,
  Clock,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  GitFork,
  Users,
  Plus,
  ArrowUpRight,
  Bell,
  Activity,
  BarChart3,
  TrendingUp,
  Shield,
  Briefcase,
  ChevronRight,
  Layers,
  Paperclip,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { Task, TaskPriority, TaskStatus } from '../types';
import { useCapabilities } from '../hooks/useCapabilities';
import { MiniCalendarWidget } from '../components/MiniCalendarWidget';

interface KPIResponse {
  myOpen: number;
  dueToday: number;
  overdue: number;
  awaitingApproval: number;
  completedThisWeek: number;
}

interface TeamLoadItem {
  userId: string;
  userName: string;
  userRole: string;
  department: string;
  designation: string;
  totalAssigned: number;
  openTasksCount: number;
  overdueCount: number;
  completedCount: number;
  completionRate: number;
}

interface ActivityItem {
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

interface ReminderItem {
  id: string;
  task_id: string;
  task_title: string;
  user_id: string;
  remind_at: string;
  channel: 'IN_APP' | 'EMAIL' | 'BOTH';
  is_sent: boolean;
  message: string;
}

export function Dashboard() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { is_leaf_node } = useCapabilities();
  const isManagerOrAdmin = ['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD'].includes(user?.role || '');

  // 1. Fetch Dashboard KPIs
  const { data: kpiData, isLoading: isLoadingKPIs } = useQuery<KPIResponse>({
    queryKey: ['dashboard-kpis'],
    queryFn: async () => {
      const res: any = await apiClient.get('/reports/dashboard');
      return res.data;
    },
  });

  // 2. Fetch My Assigned Tasks
  const { data: myTasks, isLoading: isLoadingMyTasks } = useQuery<Task[]>({
    queryKey: ['my-tasks'],
    queryFn: async () => {
      const res: any = await apiClient.get('/tasks?view=my');
      const data = Array.isArray(res) ? res : res?.data;
      if (Array.isArray(data)) return data;
      if (data?.tasks && Array.isArray(data.tasks)) return data.tasks;
      return [];
    },
  });

  // 3. Fetch Delegated Tasks
  const { data: delegatedTasks, isLoading: isLoadingDelegated } = useQuery<Task[]>({
    queryKey: ['delegated-tasks'],
    queryFn: async () => {
      const res: any = await apiClient.get('/tasks?view=assigned_by_me');
      const data = Array.isArray(res) ? res : res?.data;
      if (Array.isArray(data)) return data;
      if (data?.tasks && Array.isArray(data.tasks)) return data.tasks;
      return [];
    },
    enabled: !is_leaf_node,
  });

  // 4. Fetch Team Workload (Managers/Admins who are not leaf nodes)
  const { data: teamLoad, isLoading: isLoadingTeamLoad } = useQuery<TeamLoadItem[]>({
    queryKey: ['team-workload'],
    queryFn: async () => {
      const res: any = await apiClient.get('/reports/team-load');
      const data = Array.isArray(res) ? res : res?.data;
      if (!Array.isArray(data)) return [];

      const flattenNodes = (nodes: any[]): any[] => {
        let result: any[] = [];
        for (const n of nodes) {
          if (n?.user) {
            result.push({
              userName: n.user.name,
              openTasksCount: n.stats?.open_tasks || 0,
              overdueCount: n.stats?.overdue_tasks || 0,
            });
          }
          if (Array.isArray(n?.direct_reports) && n.direct_reports.length > 0) {
            result = result.concat(flattenNodes(n.direct_reports));
          }
        }
        return result;
      };

      return flattenNodes(data);
    },
    enabled: isManagerOrAdmin && !is_leaf_node,
  });

  // 5. Fetch Activity Feed & Notifications
  const { data: activityLogs, isLoading: isLoadingActivity } = useQuery<ActivityItem[]>({
    queryKey: ['activity-feed'],
    queryFn: async () => {
      const res: any = await apiClient.get('/activity');
      const data = Array.isArray(res) ? res : res?.data;
      return Array.isArray(data) ? data : [];
    },
  });

  // 6. Fetch Upcoming Reminders
  const { data: reminders, isLoading: isLoadingReminders } = useQuery<ReminderItem[]>({
    queryKey: ['reminders'],
    queryFn: async () => {
      const res: any = await apiClient.get('/reminders');
      const data = Array.isArray(res) ? res : res?.data;
      return Array.isArray(data) ? data : [];
    },
  });

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'MEDIUM':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'IN_PROGRESS':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'OVERDUE':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'BLOCKED':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl border border-slate-800">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-72 h-72 bg-indigo-600/30 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-indigo-300 mb-3">
              <Shield size={14} className="text-indigo-400" />
              <span>{user?.role} &bull; Level {user?.hierarchy_level} &bull; {user?.department}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
              Welcome back, {user?.name}!
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Real-time task monitoring across delegation trees and hierarchical workflows. You are overseeing operational tasks for <span className="text-white font-semibold">{user?.designation}</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!is_leaf_node && (
              <Link
                to="/tasks"
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/30 inline-flex items-center gap-2 transition-all"
              >
                <Plus size={16} />
                <span>New Task / Assign</span>
              </Link>
            )}
            <Link
              to="/org-chart"
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 inline-flex items-center gap-2 transition-all"
            >
              <GitFork size={16} />
              <span>Org Chart</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards (5 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* KPI 1: My Open */}
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">My Open</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <CheckSquare size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-900">{isLoadingKPIs ? '...' : kpiData?.myOpen ?? 0}</h3>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Clock size={12} className="text-indigo-500" /> Active assignments
            </p>
          </div>
        </div>

        {/* KPI 2: Due Today */}
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Due Today</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-amber-900">{isLoadingKPIs ? '...' : kpiData?.dueToday ?? 0}</h3>
            <p className="text-[11px] text-amber-700 font-medium mt-1">
              Requires attention
            </p>
          </div>
        </div>

        {/* KPI 3: Overdue */}
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Overdue</span>
            <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-red-900">{isLoadingKPIs ? '...' : kpiData?.overdue ?? 0}</h3>
            <p className="text-[11px] text-red-600 font-medium mt-1">
              Past deadline
            </p>
          </div>
        </div>

        {/* KPI 4: Awaiting My Approval */}
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Awaiting Approval</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <FileCheck size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-slate-900">{isLoadingKPIs ? '...' : kpiData?.awaitingApproval ?? 0}</h3>
            <p className="text-[11px] text-purple-700 font-medium mt-1">
              Review requests
            </p>
          </div>
        </div>

        {/* KPI 5: Completed This Week */}
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Completed (Week)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-emerald-900">{isLoadingKPIs ? '...' : kpiData?.completedThisWeek ?? 0}</h3>
            <p className="text-[11px] text-emerald-700 font-medium mt-1">
              Last 7 days
            </p>
          </div>
        </div>
      </div>

      {/* Mini Calendar Widget */}
      <MiniCalendarWidget />

      {/* Main Grid Section: Tasks & Delegation */}
      <div className={`grid grid-cols-1 ${is_leaf_node ? '' : 'lg:grid-cols-2'} gap-6`}>
        {/* "My Tasks" List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckSquare size={18} className="text-indigo-600" />
                <span>My Assigned Tasks</span>
              </h2>
              <p className="text-xs text-slate-500">Tasks directly assigned to you for execution</p>
            </div>
            <Link to="/tasks" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              <span>View all</span>
              <ChevronRight size={14} />
            </Link>
          </div>

          <div className="space-y-3 flex-1">
            {isLoadingMyTasks ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : !myTasks || myTasks.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <CheckCircle2 size={32} className="mx-auto text-slate-400 mb-2" />
                <p className="text-xs font-medium text-slate-600">No active tasks assigned to you</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Enjoy your clear queue!</p>
              </div>
            ) : (
              (myTasks || []).slice(0, 5).map((t) => (
                <Link
                  key={t.id}
                  to={`/tasks/${t.id}`}
                  state={{ from: location.pathname + location.search }}
                  className="p-3.5 rounded-xl border border-slate-200/70 hover:border-indigo-300 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group block text-inherit"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getPriorityBadge(t.priority)}`}>
                        {t.priority}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getStatusBadge(t.status)}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                      {t.attachment_count !== undefined && t.attachment_count > 0 && (
                        <span className="flex items-center gap-0.5 text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded text-[10px] font-bold border border-slate-200" title={`${t.attachment_count} attachments`}>
                          <Paperclip size={10} className="text-indigo-600" />
                          <span>{t.attachment_count}</span>
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{t.title}</h4>
                    {t.due_date && (
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock size={12} /> Due: {new Date(t.due_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="w-full sm:w-32 flex flex-col items-end gap-1">
                    <div className="flex items-center justify-between w-full text-[11px] text-slate-500 font-medium">
                      <span>Progress</span>
                      <span className="font-bold text-slate-800">{t.progress_percent}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${t.progress_percent}%` }}
                      />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* "Delegated by Me" List */}
        {!is_leaf_node && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <GitFork size={18} className="text-purple-600" />
                  <span>Delegated by Me</span>
                </h2>
                <p className="text-xs text-slate-500">Tasks assigned to subordinates with rollup progress</p>
              </div>
              <Link to="/tasks" className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1">
                <span>View all</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            <div className="space-y-3 flex-1">
              {isLoadingDelegated ? (
                <div className="space-y-3 py-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-xl" />
                  ))}
                </div>
              ) : !delegatedTasks || delegatedTasks.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Layers size={32} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-xs font-medium text-slate-600">No tasks delegated by you yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Delegate tasks down your reporting line</p>
                </div>
              ) : (
                (delegatedTasks || []).slice(0, 5).map((t) => (
                  <Link
                    key={t.id}
                    to={`/tasks/${t.id}`}
                    state={{ from: location.pathname + location.search }}
                    className="p-3.5 rounded-xl border border-slate-200/70 hover:border-purple-300 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group block text-inherit"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getPriorityBadge(t.priority)}`}>
                          {t.priority}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getStatusBadge(t.status)}`}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-800 group-hover:text-purple-600 transition-colors truncate">{t.title}</h4>
                      <p className="text-[11px] text-slate-500">
                        Assigned to: <span className="font-semibold text-slate-700">{t.assigned_to_id}</span>
                      </p>
                    </div>

                    <div className="w-full sm:w-32 flex flex-col items-end gap-1">
                      <div className="flex items-center justify-between w-full text-[11px] text-slate-500 font-medium">
                        <span>Rollup</span>
                        <span className="font-bold text-purple-700">{t.progress_percent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${t.progress_percent}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Team Workload Chart (For Managers/Admins who are not leaf nodes) */}
      {isManagerOrAdmin && !is_leaf_node && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-indigo-600" />
                <span>Team Workload & Capacity Overview</span>
              </h2>
              <p className="text-xs text-slate-500">Open tasks count and total estimated hours per active team member</p>
            </div>
            <Link
              to="/team-workload"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
            >
              <span>Detailed Reports</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>

          {isLoadingTeamLoad ? (
            <div className="h-64 bg-slate-50 animate-pulse rounded-2xl" />
          ) : !teamLoad || teamLoad.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No team workload data available.</p>
          ) : (
            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(teamLoad || []).slice(0, 10)}
                  margin={{ top: 10, right: 20, left: -10, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="userName"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      border: 'none',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="openTasksCount" name="Open Tasks" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Activity Feed & Reminders Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity Feed */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Activity size={18} className="text-emerald-600" />
              <span>Recent Activity Feed</span>
            </h2>
            <span className="text-[11px] font-semibold text-slate-400">Live</span>
          </div>

          <div className="space-y-4 flex-1">
            {isLoadingActivity ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : !activityLogs || activityLogs.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No recent activity logged.</p>
            ) : (
              activityLogs.map((item) => (
                <div key={item.id} className="flex gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                  <div className="space-y-0.5">
                    <p className="text-slate-800">
                      <span className="font-bold text-slate-900">{item.user_name}</span>{' '}
                      <span className="text-slate-600">{item.action.replace(/_/g, ' ').toLowerCase()}</span>{' '}
                      on <span className="font-semibold text-indigo-600">&quot;{item.task_title}&quot;</span>
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Reminders Panel */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Bell size={18} className="text-amber-500" />
              <span>Upcoming Reminders</span>
            </h2>
            <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              Active Alerts
            </span>
          </div>

          <div className="space-y-3 flex-1">
            {isLoadingReminders ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : !reminders || reminders.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No upcoming reminders.</p>
            ) : (
              reminders.map((r) => (
                <div
                  key={r.id}
                  className="p-3 bg-amber-50/50 border border-amber-200/80 rounded-xl flex items-start gap-3"
                >
                  <Bell size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-slate-800">{r.task_title}</h5>
                    <p className="text-[11px] text-slate-600 leading-snug">{r.message}</p>
                    <p className="text-[10px] text-amber-700 font-semibold mt-1">
                      Target Time: {new Date(r.remind_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

