import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  List,
  Kanban,
  Search,
  Filter,
  Plus,
  Clock,
  AlertTriangle,
  User as UserIcon,
  CheckCircle2,
  X,
  ChevronDown,
  Layers,
  Sparkles,
  ArrowRight,
  MoreVertical,
  Calendar as CalendarIcon,
  ShieldAlert,
  Paperclip,
  GitBranch,
} from 'lucide-react';

import { apiClient } from '../api/client';
import { Task, TaskPriority, TaskStatus, User } from '../types';
import { useAuthStore } from '../store/authStore';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { useCapabilities } from '../hooks/useCapabilities';
import { getTaskActorRole } from '../permissions';
import { getAllowedNextStatuses, validateTransition } from '../taskStateMachine';
import { showToast } from '../store/toastStore';

type ViewMode = 'list' | 'board' | 'calendar';

interface TasksResponse {
  tasks: Task[];
  total: number;
}

export function TasksPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const { is_leaf_node } = useCapabilities();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [viewScope, setViewScope] = useState<'assigned_by_me' | 'my' | 'all'>('assigned_by_me');

  // Fetch Users for Assignee dropdown
  const { data: usersData } = useQuery<{ users: User[] }>({
    queryKey: ['users-list'],
    queryFn: async () => {
      const res: any = await apiClient.get('/users');
      return res.data || { users: [] };
    },
  });

  // Accessible users for Assignee filter
  const allUsersList = usersData?.users || [];

  const getUserName = (id?: string, name?: string) => {
    if (name && !name.startsWith('usr-')) return name;
    if (!id) return 'Unassigned';
    const found = allUsersList.find((u) => u.id === id);
    if (found) return found.name;
    if (id === 'usr-admin-001') return 'Hemant Sir (CEO)';
    return name || id;
  };

  const accessibleUsers = allUsersList.filter((u) => {
    if (currentUser?.role === 'ADMIN') return true;
    if (u.id === currentUser?.id) return true;
    if (u.manager_id === currentUser?.id) return true;
    return false;
  });

  // Fetch Tasks with filters
  const { data: tasksData, isLoading, isError } = useQuery<TasksResponse>({
    queryKey: ['tasks', { search, statusFilter, priorityFilter, assigneeFilter, viewScope }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);
      if (assigneeFilter) params.append('assignee_id', assigneeFilter);
      if (viewScope === 'my') params.append('view', 'my');
      if (viewScope === 'assigned_by_me') params.append('view', 'assigned_by_me');

      const res: any = await apiClient.get(`/tasks?${params.toString()}`);
      if (res.data?.tasks) return res.data;
      if (Array.isArray(res.data)) return { tasks: res.data, total: res.data.length };
      return { tasks: [], total: 0 };
    },
  });

  const [blockingModal, setBlockingModal] = useState<{
    isOpen: boolean;
    message: string;
    tasks: Array<{ id: string; title: string; status: string }>;
  }>({ isOpen: false, message: '', tasks: [] });

  // Optimistic Status Update Mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Task> }) => {
      const res: any = await apiClient.patch(`/tasks/${id}`, updates);
      return res.data;
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousData = queryClient.getQueryData(['tasks', { search, statusFilter, priorityFilter, assigneeFilter, viewScope }]);

      queryClient.setQueriesData({ queryKey: ['tasks'] }, (old: any) => {
        if (!old) return old;
        const taskList = old.tasks || (Array.isArray(old) ? old : []);
        const updatedList = taskList.map((t: Task) =>
          t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
        );
        return old.tasks ? { ...old, tasks: updatedList } : updatedList;
      });

      return { previousData };
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ['tasks', { search, statusFilter, priorityFilter, assigneeFilter, viewScope }],
          context.previousData
        );
      }

      const errCode = err?.response?.data?.error?.code;
      const errMsg = err?.response?.data?.error?.message || err?.message || 'Failed to update task status.';

      if (
        err?.response?.status === 409 &&
        errCode === 'PARENT_HAS_INCOMPLETE_CHILDREN'
      ) {
        const details = err.response.data.error.details;
        setBlockingModal({
          isOpen: true,
          message:
            errMsg || 'Parent task cannot be completed until subtasks are resolved.',
          tasks: details?.blocking_tasks || [],
        });
      } else if (
        errCode === 'STATUS_TRANSITION_FORBIDDEN' ||
        errCode === 'OVERDUE_IS_SYSTEM_MANAGED' ||
        errCode === 'PRIORITY_EDIT_FORBIDDEN' ||
        err?.response?.status === 403
      ) {
        showToast({
          type: 'error',
          title: 'Action Forbidden',
          message: errMsg,
        });
      } else {
        showToast({
          type: 'error',
          title: 'Update Error',
          message: errMsg,
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['delegated-tasks'] });
    },
  });

  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    updateTaskMutation.mutate({ id: taskId, updates: { status: newStatus } });
  };

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
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'BLOCKED':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'OVERDUE':
        return 'bg-red-50 text-red-700 border-red-200 font-bold';
      case 'CANCELLED':
        return 'bg-slate-100 text-slate-500 border-slate-200 line-through';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const tasksList = tasksData?.tasks || [];

  // Kanban Columns Definition
  const kanbanColumns: { title: string; statuses: TaskStatus[]; targetStatus: TaskStatus; color: string; bg: string }[] = [
    { title: 'To Do', statuses: ['TODO', 'BACKLOG', 'DRAFT'], targetStatus: 'TODO', color: 'border-slate-300 text-slate-700', bg: 'bg-slate-50/50' },
    { title: 'In Progress', statuses: ['IN_PROGRESS'], targetStatus: 'IN_PROGRESS', color: 'border-blue-300 text-blue-700', bg: 'bg-blue-50/20' },
    { title: 'In Review / Submitted', statuses: ['SUBMITTED', 'UNDER_REVIEW'], targetStatus: 'SUBMITTED', color: 'border-amber-300 text-amber-700', bg: 'bg-amber-50/20' },
    { title: 'Overdue (System-set)', statuses: ['OVERDUE'], targetStatus: 'OVERDUE', color: 'border-red-300 text-red-700', bg: 'bg-red-50/30' },
    { title: 'Completed', statuses: ['COMPLETED'], targetStatus: 'COMPLETED', color: 'border-emerald-300 text-emerald-700', bg: 'bg-emerald-50/20' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <CheckSquare size={20} />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Task Management</h1>
          </div>
          <p className="text-xs text-slate-500">
            Real-time delegation hierarchy, state machine transitions, and workload tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Switcher */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List size={14} />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === 'board' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Kanban size={14} />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CalendarIcon size={14} />
              <span>Calendar</span>
            </button>
          </div>

          {/* Create Task Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/30 inline-flex items-center gap-2 transition-all"
          >
            <Plus size={16} />
            <span>Create Task</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Scope presets: 1st Assigned/Created by Me, 2nd Assigned to Me, 3rd All Company Tasks */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setViewScope('assigned_by_me')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                viewScope === 'assigned_by_me' ? 'bg-white text-purple-700 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Assigned / Created by Me
            </button>
            <button
              onClick={() => setViewScope('my')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                viewScope === 'my' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Assigned to Me
            </button>
            <button
              onClick={() => setViewScope('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                viewScope === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {currentUser?.role === 'ADMIN' ? 'All Company Tasks' : 'All My Tasks'}
            </button>
          </div>

          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks by title or description..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Filters Row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium">
            <Filter size={14} />
            <span>Filters:</span>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="TODO">To Do</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="BLOCKED">Blocked</option>
            <option value="COMPLETED">Completed</option>
          </select>

          {/* Overdue Only Toggle Button */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
              statusFilter === 'OVERDUE'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
            }`}
          >
            <AlertTriangle size={13} />
            <span>Overdue only</span>
          </button>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Assignee Filter */}
          {accessibleUsers.length > 1 && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:outline-none focus:border-indigo-500 max-w-[200px]"
            >
              <option value="">All Assignees</option>
              {accessibleUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.designation})
                </option>
              ))}
            </select>
          )}

          {/* Clear Filters button */}
          {(statusFilter !== 'ALL' || priorityFilter !== 'ALL' || assigneeFilter || search || viewScope !== 'all') && (
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setPriorityFilter('ALL');
                setAssigneeFilter('');
                setSearch('');
                setViewScope('all');
              }}
              className="text-xs text-indigo-600 font-semibold hover:underline ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : tasksList.length === 0 ? (
            <div className="text-center py-16 px-4">
              <CheckCircle2 size={40} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No tasks found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No tasks match your active filter criteria. Try adjusting the status or search input.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {tasksList.map((t) => (
                <Link
                  key={t.id}
                  to={`/tasks/${t.id}`}
                  state={{ from: location.pathname + location.search }}
                  className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer block border-b border-slate-100 last:border-b-0 group text-slate-900"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getPriorityBadge(t.priority)}`}>
                        {t.priority}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusBadge(t.status)}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                      {t.is_overdue && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-600 text-white flex items-center gap-1 uppercase tracking-wider shadow-2xs">
                          <AlertTriangle size={10} /> OVERDUE
                        </span>
                      )}
                      {t.status === 'COMPLETED' && (
                        t.completed_on_time === true ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 size={10} className="text-emerald-600" /> Completed on time
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <AlertTriangle size={10} className="text-amber-600" /> Completed late
                          </span>
                        )
                      )}
                      {t.due_date && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                          <Clock size={12} /> Due: {new Date(t.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors block">
                      {t.title}
                    </h3>

                    {t.description && (
                      <p className="text-xs text-slate-500 line-clamp-1 max-w-2xl">{t.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-[11px] text-slate-500 font-medium pt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <UserIcon size={12} className="text-slate-400" />
                        Assignee: <span className="text-slate-700 font-semibold">{getUserName(t.assigned_to_id, t.assigned_to_name)}</span>
                      </span>
                      {t.delegated_to && t.delegated_to.length > 0 && (
                        <span
                          className="flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md text-[10px] font-bold border border-indigo-100"
                          title={t.delegated_to.map((d) => `${d.user_name} (${d.department}) — ${d.status}`).join('\n')}
                        >
                          <GitBranch size={11} className="shrink-0" />
                          <span>
                            Working: {t.delegated_to[t.delegated_to.length - 1].user_name}
                            {t.delegated_to.length > 1 ? ` +${t.delegated_to.length - 1}` : ''}
                          </span>
                        </span>
                      )}
                      {t.attachment_count !== undefined && t.attachment_count > 0 && (
                        <span className="flex items-center gap-1 text-slate-700 bg-slate-100/80 px-2 py-0.5 rounded-md text-[10px] font-bold border border-slate-200" title={`${t.attachment_count} total files (${t.submitted_attachment_count || 0} deliverables)`}>
                          <Paperclip size={12} className="text-indigo-600" />
                          <span>{t.attachment_count} file{t.attachment_count === 1 ? '' : 's'}</span>
                          {t.submitted_attachment_count ? (
                            <span className="text-purple-700 font-extrabold">({t.submitted_attachment_count} sub)</span>
                          ) : null}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress & Quick Actions */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 min-w-[240px] justify-end">
                    <div className="w-36 space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-600 font-semibold">
                        <span>Progress</span>
                        <span>{t.progress_percent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${t.progress_percent}%` }}
                        />
                      </div>
                      {t.progress_info?.source_text && (
                        <p className="text-[10px] text-slate-400 font-mono text-right truncate">
                          {t.progress_info.source_text}
                        </p>
                      )}
                    </div>

                    {/* Quick Status Dropdown */}
                    {(() => {
                      const actorRole = currentUser ? getTaskActorRole(currentUser, t) : 'OTHER';

                      if (t.status === 'OVERDUE') {
                        return (
                          <span className="px-2.5 py-1 text-[11px] font-bold border rounded-xl bg-red-50 text-red-700 border-red-200" title="Auto-set by system">
                            OVERDUE
                          </span>
                        );
                      }

                      if (actorRole === 'OTHER') {
                        return (
                          <span className={`px-2.5 py-1 text-[11px] font-bold border rounded-xl ${getStatusBadge(t.status)}`}>
                            {t.status.replace('_', ' ')}
                          </span>
                        );
                      }

                      const allowedNext = getAllowedNextStatuses(t.status, actorRole as 'ASSIGNEE' | 'ASSIGNER');
                      const options = Array.from(
                        new Set([t.status, ...allowedNext.filter((s) => s !== 'OVERDUE')])
                      );

                      return (
                        <select
                          value={t.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleStatusChange(t.id, e.target.value as TaskStatus);
                          }}
                          className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold text-slate-700 hover:border-indigo-300 focus:outline-none focus:border-indigo-500"
                        >
                          {options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BOARD (KANBAN) VIEW */}
      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {kanbanColumns.map((col) => {
            const colTasks = tasksList.filter((t) => col.statuses.includes(t.status));

            return (
              <div
                key={col.title}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (col.targetStatus === 'OVERDUE') {
                    e.dataTransfer.dropEffect = 'none';
                  } else {
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (col.targetStatus === 'OVERDUE') {
                    showToast({
                      type: 'error',
                      title: 'Action Forbidden',
                      message: 'Only system triggers can mark a task as OVERDUE.',
                    });
                    return;
                  }

                  try {
                    const dataStr = e.dataTransfer.getData('text/plain');
                    if (!dataStr) return;
                    const { taskId, currentStatus } = JSON.parse(dataStr);
                    if (!taskId || currentStatus === col.targetStatus) return;

                    const task = tasksList.find((tk) => tk.id === taskId);
                    if (!task) return;

                    const actorRole = currentUser ? getTaskActorRole(currentUser, task) : 'OTHER';
                    if (actorRole === 'OTHER') {
                      throw new Error('You do not have permission to change status on this task.');
                    }
                    validateTransition(task.status, col.targetStatus, actorRole, {
                      completed_at: task.completed_at,
                      userRole: currentUser?.role,
                      isAdmin: currentUser?.role === 'ADMIN',
                    });

                    handleStatusChange(taskId, col.targetStatus);
                  } catch (err: any) {
                    showToast({
                      type: 'error',
                      title: 'Transition Forbidden',
                      message: err.reason || err.message || 'Transition not permitted for your role.',
                    });
                  }
                }}
                className={`rounded-2xl p-4 border ${col.color} ${col.bg} flex flex-col min-h-[500px] shadow-xs`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider">{col.title}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-white border border-slate-200 text-slate-800">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto">
                  {colTasks.length === 0 ? (
                    <div className="h-32 border border-dashed border-slate-200/80 rounded-xl flex items-center justify-center text-[11px] text-slate-400 font-medium">
                      No tasks
                    </div>
                  ) : (
                    colTasks.map((t) => (
                      <Link
                        key={t.id}
                        to={`/tasks/${t.id}`}
                        state={{ from: location.pathname + location.search }}
                        draggable={t.status !== 'CANCELLED'}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: t.id, currentStatus: t.status }));
                        }}
                        className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-indigo-300 hover:bg-slate-50 transition-all space-y-2.5 cursor-grab active:cursor-grabbing block text-slate-900 group"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${getPriorityBadge(t.priority)}`}>
                              {t.priority}
                            </span>
                            {t.is_overdue && (
                              <span className="px-1.5 py-0.5 bg-red-600 text-white font-extrabold text-[9px] rounded-md uppercase tracking-wider">
                                OVERDUE
                              </span>
                            )}
                            {t.status === 'COMPLETED' && (
                              t.completed_on_time === true ? (
                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[9px] rounded-md">
                                  On time
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[9px] rounded-md">
                                  Late
                                </span>
                              )
                            )}
                          </div>
                          {t.due_date && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {new Date(t.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">
                          {t.title}
                        </h4>

                        <div className="space-y-1 pt-1 border-t border-slate-100">
                          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                            <span>Progress</span>
                            <span className="font-bold text-slate-800">{t.progress_percent}%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full rounded-full"
                              style={{ width: `${t.progress_percent}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate max-w-[120px] font-medium text-slate-700" title={getUserName(t.assigned_to_id, t.assigned_to_name)}>
                              {getUserName(t.assigned_to_id, t.assigned_to_name)}
                            </span>
                            {t.attachment_count !== undefined && t.attachment_count > 0 && (
                              <span className="flex items-center gap-0.5 text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded text-[9px] font-bold border border-slate-200" title={`${t.attachment_count} files`}>
                                <Paperclip size={10} className="text-indigo-600 shrink-0" />
                                <span>{t.attachment_count}</span>
                              </span>
                            )}
                          </div>
                          {(() => {
                            const actorRole = currentUser ? getTaskActorRole(currentUser, t) : 'OTHER';

                            if (t.status === 'OVERDUE') {
                              return (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 border rounded-md bg-red-50 text-red-700 border-red-200" title="Auto-set by system">
                                  OVERDUE
                                </span>
                              );
                            }

                            if (actorRole === 'OTHER') {
                              return (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 border rounded-md ${getStatusBadge(t.status)}`}>
                                  {t.status.replace('_', ' ')}
                                </span>
                              );
                            }

                            const allowedNext = getAllowedNextStatuses(t.status, actorRole as 'ASSIGNEE' | 'ASSIGNER');
                            const options = Array.from(new Set([t.status, ...allowedNext.filter((s) => s !== 'OVERDUE')]));

                            return (
                              <select
                                value={t.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(t.id, e.target.value as TaskStatus);
                                }}
                                className="text-[10px] bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 font-medium text-slate-700"
                              >
                                {options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt.replace('_', ' ')}
                                  </option>
                                ))}
                              </select>
                            );
                          })()}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CalendarIcon size={18} className="text-indigo-600" />
              <span>Calendar View</span>
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              Tasks organized by scheduled due dates
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasksList.length === 0 ? (
              <p className="text-xs text-slate-500 col-span-full py-8 text-center">No tasks to display on calendar.</p>
            ) : (
              tasksList.map((t) => (
                <Link
                  key={t.id}
                  to={`/tasks/${t.id}`}
                  state={{ from: location.pathname + location.search }}
                  className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all cursor-pointer block text-slate-900 space-y-2.5 shadow-2xs group"
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getPriorityBadge(t.priority)}`}>
                      {t.priority}
                    </span>
                    <span className="text-[11px] font-mono text-indigo-600 font-bold flex items-center gap-1">
                      <Clock size={12} />
                      {t.due_date ? new Date(t.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'No due date'}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {t.title}
                  </h4>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span>Assignee: {t.assigned_to_id}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${getStatusBadge(t.status)}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* Blocking Subtasks Modal */}
      {blockingModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 border border-slate-200 shadow-2xl">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-50 rounded-2xl border border-red-100 shrink-0">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cannot Complete Parent Task</h3>
                <p className="text-xs text-slate-500 font-medium">409 Conflict: Incomplete Subtasks Exist</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100">
              {blockingModal.message}
            </p>

            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Blocking Subtasks ({blockingModal.tasks.length}):
              </span>
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {blockingModal.tasks.map((bt) => (
                  <Link
                    key={bt.id}
                    to={`/tasks/${bt.id}`}
                    state={{ from: location.pathname + location.search }}
                    onClick={() => setBlockingModal({ isOpen: false, message: '', tasks: [] })}
                    className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs cursor-pointer transition-colors block text-inherit"
                  >
                    <span className="font-semibold text-slate-800 truncate pr-2 hover:text-indigo-600">{bt.title}</span>
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md shrink-0">
                      {bt.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setBlockingModal({ isOpen: false, message: '', tasks: [] })}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-2xs transition-all"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      <CreateTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
