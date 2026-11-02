import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Eye,
  X,
  ExternalLink,
  Shield,
  ArrowUpDown,
  UserCheck,
} from 'lucide-react';

import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useCapabilities } from '../hooks/useCapabilities';
import { Task } from '../types';

export interface TeamNodeUser {
  id: string;
  name: string;
  avatar_url?: string | null;
  designation?: string;
  hierarchy_level: number;
}

export interface TeamNodeStats {
  open_tasks: number;
  overdue_tasks: number;
  completed_this_week: number;
}

export interface TeamWorkloadNode {
  user: TeamNodeUser;
  stats: TeamNodeStats;
  direct_reports: TeamWorkloadNode[];
}

type SortField = 'name' | 'open_tasks' | 'overdue';

export function TeamWorkload() {
  const { user } = useAuthStore();
  const { is_leaf_node } = useCapabilities();

  const [depth, setDepth] = useState<'all' | '1'>('all');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [adminUserId, setAdminUserId] = useState<string>('');

  // Slide-over drawer state
  const [selectedUserForTasks, setSelectedUserForTasks] = useState<TeamNodeUser | null>(null);

  // Expanded nodes set for accordion
  const [expandedNodeIds, setExpandedNodeIds] = useState<Record<string, boolean>>({});

  // Query users for Admin perspective picker
  const { data: allUsersData = [] } = useQuery({
    queryKey: ['all-users-list'],
    queryFn: async () => {
      const res: any = await apiClient.get('/users');
      return res.data?.users || (Array.isArray(res.data) ? res.data : []);
    },
    enabled: user?.role === 'ADMIN',
  });

  // Query Team Workload Tree
  const {
    data: treeData = [],
    isLoading,
    isError,
    error,
  } = useQuery<TeamWorkloadNode[]>({
    queryKey: ['team-workload-tree', depth, adminUserId],
    queryFn: async () => {
      let url = `/reports/team-load?depth=${depth}`;
      if (user?.role === 'ADMIN' && adminUserId) {
        url += `&user_id=${adminUserId}`;
      }
      const res: any = await apiClient.get(url);
      const data = res.data ?? res;
      return Array.isArray(data) ? data : [];
    },
    enabled: !is_leaf_node,
    retry: 1,
  });

  // Query open tasks for slide-over drawer
  const { data: userOpenTasks = [], isLoading: isLoadingUserTasks } = useQuery<Task[]>({
    queryKey: ['subordinate-open-tasks', selectedUserForTasks?.id],
    queryFn: async () => {
      if (!selectedUserForTasks?.id) return [];
      const res: any = await apiClient.get(`/reports/team-load/user/${selectedUserForTasks.id}/tasks`);
      const data = res.data ?? res;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedUserForTasks?.id,
  });

  // Toggle node expansion
  const toggleExpand = (id: string) => {
    setExpandedNodeIds((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  };

  // Recursively sort nodes
  const sortNodes = (nodes: TeamWorkloadNode[]): TeamWorkloadNode[] => {
    const sorted = [...nodes].sort((a, b) => {
      if (sortBy === 'name') {
        return a.user.name.localeCompare(b.user.name);
      }
      if (sortBy === 'open_tasks') {
        return b.stats.open_tasks - a.stats.open_tasks;
      }
      if (sortBy === 'overdue') {
        return b.stats.overdue_tasks - a.stats.overdue_tasks;
      }
      return 0;
    });

    return sorted.map((node) => ({
      ...node,
      direct_reports: node.direct_reports ? sortNodes(node.direct_reports) : [],
    }));
  };

  const sortedTree = useMemo(() => sortNodes(treeData), [treeData, sortBy]);

  // Recursively calculate overall summary stats
  const summary = useMemo(() => {
    let totalPeople = 0;
    let totalOpenTasks = 0;
    let totalOverdue = 0;
    const visited = new Set<string>();

    const traverse = (nodes: TeamWorkloadNode[]) => {
      for (const n of nodes) {
        if (!visited.has(n.user.id)) {
          visited.add(n.user.id);
          totalPeople++;
          totalOpenTasks += n.stats.open_tasks || 0;
          totalOverdue += n.stats.overdue_tasks || 0;
        }
        if (n.direct_reports && n.direct_reports.length > 0) {
          traverse(n.direct_reports);
        }
      }
    };

    traverse(treeData);
    return { totalPeople, totalOpenTasks, totalOverdue };
  }, [treeData]);

  // Handle leaf user or 403 error state
  if (is_leaf_node || (isError && (error as any)?.response?.status === 403)) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Team Workload Restricted</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
            You do not have direct subordinates in the organizational hierarchy. Team workload and capacity views are reserved for managers and team leads.
          </p>
          <Link
            to="/tasks"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition"
          >
            <span>Go to My Tasks</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Your Team</h1>
          <p className="text-sm text-slate-500 mt-1">
            Hierarchy-scoped workload distribution and open tasks.
          </p>
        </div>

        {/* Top Summary Bar */}
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-100">
            <Users className="text-indigo-600" size={18} />
            <span className="text-xs font-semibold text-slate-700">
              Your team — {summary.totalPeople} {summary.totalPeople === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="flex items-center gap-2 pr-3 border-r border-slate-100">
            <Clock className="text-slate-500" size={16} />
            <span className="text-xs font-medium text-slate-600">
              {summary.totalOpenTasks} open tasks
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className={summary.totalOverdue > 0 ? 'text-rose-500' : 'text-slate-400'} size={16} />
            <span className={`text-xs font-medium ${summary.totalOverdue > 0 ? 'text-rose-600 font-semibold' : 'text-slate-600'}`}>
              {summary.totalOverdue} overdue
            </span>
          </div>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Depth Toggle */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs font-medium">
            <button
              onClick={() => setDepth('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                depth === 'all'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Full subtree
            </button>
            <button
              onClick={() => setDepth('1')}
              className={`px-3 py-1.5 rounded-lg transition ${
                depth === '1'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Direct reports only
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <ArrowUpDown size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="name">Name</option>
              <option value="open_tasks">Open tasks</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        {/* Admin Perspective Override */}
        {user?.role === 'ADMIN' && (
          <div className="flex items-center gap-2">
            <UserCheck size={14} className="text-purple-600" />
            <span className="text-xs font-medium text-purple-700">Admin Perspective:</span>
            <select
              value={adminUserId}
              onChange={(e) => setAdminUserId(e.target.value)}
              className="text-xs bg-purple-50/60 border border-purple-200 rounded-xl px-3 py-1.5 text-purple-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Your Subtree (Top Level)</option>
              {allUsersData
                .filter((u: any) => u.id !== user.id && u.is_active)
                .map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.designation || u.role})
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Accordion Workload Tree */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading hierarchy workload data...</p>
          </div>
        ) : sortedTree.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto text-slate-300 mb-3" size={32} />
            <h3 className="text-sm font-semibold text-slate-700">No team members found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              There are no subordinate team members under this hierarchy view.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedTree.map((node) => (
              <WorkloadTreeNodeRow
                key={node.user.id}
                node={node}
                level={0}
                expandedNodeIds={expandedNodeIds}
                onToggleExpand={toggleExpand}
                onViewTasks={setSelectedUserForTasks}
              />
            ))}
          </div>
        )}
      </div>

      {/* Subordinate Tasks Slide-Over Panel */}
      {selectedUserForTasks && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedUserForTasks(null)}
          />

          {/* Slide-over Container */}
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl z-10 flex flex-col border-l border-slate-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center text-sm shadow-xs">
                  {selectedUserForTasks.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{selectedUserForTasks.name}</h2>
                  <p className="text-xs text-slate-500">{selectedUserForTasks.designation}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForTasks(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Open Tasks ({userOpenTasks.length})
                </h3>
              </div>

              {isLoadingUserTasks ? (
                <div className="py-12 text-center space-y-2">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-500">Fetching open tasks...</p>
                </div>
              ) : userOpenTasks.length === 0 ? (
                <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
                  <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={28} />
                  <p className="text-sm font-semibold text-slate-700">No open tasks!</p>
                  <p className="text-xs text-slate-500 mt-1">This user currently has zero pending or active tasks.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userOpenTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 transition shadow-2xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/tasks/${task.id}`}
                          onClick={() => setSelectedUserForTasks(null)}
                          className="font-semibold text-sm text-slate-900 hover:text-indigo-600 transition flex items-center gap-1.5"
                        >
                          <span>{task.title}</span>
                          <ExternalLink size={12} className="text-slate-400" />
                        </Link>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                            task.priority === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-700'
                              : task.priority === 'HIGH'
                              ? 'bg-amber-100 text-amber-700'
                              : task.priority === 'MEDIUM'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>

                      {task.description && (
                        <p className="text-xs text-slate-600 line-clamp-2">{task.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500 border-t border-slate-100">
                        <span className="font-medium text-slate-700">Status: {task.status}</span>
                        {task.due_date && (
                          <span
                            className={
                              new Date(task.due_date) < new Date() ? 'text-rose-600 font-semibold' : ''
                            }
                          >
                            Due: {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tree Node Row Component
interface WorkloadTreeNodeRowProps {
  node: TeamWorkloadNode;
  level: number;
  expandedNodeIds: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onViewTasks: (user: TeamNodeUser) => void;
}

const WorkloadTreeNodeRow: React.FC<WorkloadTreeNodeRowProps> = ({
  node,
  level,
  expandedNodeIds,
  onToggleExpand,
  onViewTasks,
}) => {
  const isExpanded = expandedNodeIds[node.user.id] ?? true; // Default expanded
  const hasReports = node.direct_reports && node.direct_reports.length > 0;

  return (
    <div className="w-full">
      {/* Row container */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-slate-50/80 transition ${
          level > 0 ? 'bg-slate-50/30 border-l-2 border-indigo-200/60' : ''
        }`}
        style={{ paddingLeft: level > 0 ? `${Math.min(level * 1.5 + 1, 4)}rem` : '1rem' }}
      >
        {/* User Identity & Chevron */}
        <div className="flex items-center gap-3 min-w-[240px]">
          {hasReports ? (
            <button
              onClick={() => onToggleExpand(node.user.id)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/50 transition"
              title={isExpanded ? 'Collapse team' : 'Expand team'}
            >
              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
          ) : (
            <div className="w-6" />
          )}

          {node.user.avatar_url ? (
            <img
              src={node.user.avatar_url}
              alt={node.user.name}
              className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-800 text-white font-semibold flex items-center justify-center text-sm shrink-0">
              {node.user.name.charAt(0)}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-900">{node.user.name}</span>
              <span className="text-[10px] px-2 py-0.5 font-medium text-slate-500 bg-slate-100 rounded-md border border-slate-200/60">
                L{node.user.hierarchy_level}
              </span>
            </div>
            <p className="text-xs text-slate-500">{node.user.designation || 'Team Member'}</p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-slate-600">
          {/* Open Tasks */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Open</span>
            <span className="font-bold text-slate-900">{node.stats.open_tasks} tasks</span>
          </div>

          {/* Overdue */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Overdue</span>
            <span
              className={`font-bold ${
                node.stats.overdue_tasks > 0 ? 'text-rose-600' : 'text-slate-700'
              }`}
            >
              {node.stats.overdue_tasks}
            </span>
          </div>

          {/* View Tasks Action Link */}
          <button
            onClick={() => onViewTasks(node.user)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100/70 rounded-xl transition border border-indigo-100"
          >
            <Eye size={13} />
            <span>View Tasks</span>
          </button>
        </div>
      </div>

      {/* Direct Reports Nested Accordion */}
      {hasReports && isExpanded && (
        <div className="divide-y divide-slate-100 bg-slate-50/20">
          {node.direct_reports.map((report) => (
            <WorkloadTreeNodeRow
              key={report.user.id}
              node={report}
              level={level + 1}
              expandedNodeIds={expandedNodeIds}
              onToggleExpand={onToggleExpand}
              onViewTasks={onViewTasks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
