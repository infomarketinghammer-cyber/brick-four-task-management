import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Target,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
  AlertTriangle,
  Settings,
  User as UserIcon,
} from 'lucide-react';

import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface KpiScore {
  id: string;
  code: string;
  name: string;
  target: number | null;
  unit: string;
  weight: number | null;
  actual: number | null;
  achievement: number | null;
  weighted_score: number | null;
  status: string | null;
}

interface KraGroup {
  id: string;
  number: string | number | null;
  name: string;
  kpis: KpiScore[];
}

interface Scorecard {
  kras: KraGroup[];
  kpi_count: number;
  recorded_count: number;
  overall_achievement: number | null;
}

interface EmployeeRow {
  user: {
    id: string;
    name: string;
    designation: string;
    department: string;
    role: string;
    hierarchy_level: number;
    manager_name: string | null;
  };
  is_self: boolean;
  depth: number;
  scorecard: Scorecard | null;
}

interface ScorecardsResponse {
  period: { id: string | null; name: string | null };
  fetched_at: string;
  employees: EmployeeRow[];
  unmatched_owners?: string[];
}

const achievementColor = (pct: number | null) => {
  if (pct === null) return { bar: 'bg-slate-300', text: 'text-slate-400' };
  if (pct >= 90) return { bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (pct >= 60) return { bar: 'bg-amber-500', text: 'text-amber-700' };
  return { bar: 'bg-rose-500', text: 'text-rose-700' };
};

function AchievementBar({ value, size = 'md' }: { value: number | null; size?: 'sm' | 'md' }) {
  const color = achievementColor(value);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`flex-1 bg-slate-100 rounded-full overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
        <div className={`${color.bar} h-full rounded-full`} style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} />
      </div>
      <span className={`font-extrabold tabular-nums shrink-0 ${size === 'sm' ? 'text-[11px]' : 'text-xs'} ${color.text}`}>
        {value === null ? '—' : `${value}%`}
      </span>
    </div>
  );
}

function ScorecardDetail({ scorecard }: { scorecard: Scorecard }) {
  return (
    <div className="space-y-3">
      {scorecard.kras.map((kra) => (
        <div key={kra.id} className="border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span className="text-[10px] font-extrabold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md shrink-0">
              KRA {kra.number ?? ''}
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">{kra.name}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 text-left">
                  <th className="px-4 py-2 font-bold">KPI</th>
                  <th className="px-3 py-2 font-bold text-right">Target</th>
                  <th className="px-3 py-2 font-bold text-right">Actual</th>
                  <th className="px-3 py-2 font-bold w-44">Completed</th>
                  <th className="px-3 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kra.kpis.map((kpi) => (
                  <tr key={kpi.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[10px] text-slate-400 mr-1.5">{kpi.code}</span>
                      <span className="font-semibold text-slate-800">{kpi.name}</span>
                      {kpi.weight !== null && <span className="text-[10px] text-slate-400 ml-1.5">({kpi.weight}% wt)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums whitespace-nowrap">
                      {kpi.target ?? '—'} {kpi.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                      {kpi.actual === null ? <span className="text-slate-400 font-normal">Not recorded</span> : `${kpi.actual} ${kpi.unit}`}
                    </td>
                    <td className="px-3 py-2.5">
                      <AchievementBar value={kpi.achievement} size="sm" />
                    </td>
                    <td className="px-3 py-2.5">
                      {kpi.status ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
                          {kpi.status.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function KpiPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === 'ADMIN';

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [onlyWithKpis, setOnlyWithKpis] = useState(true);

  const { data: status, isLoading: isLoadingStatus } = useQuery<{ configured: boolean }>({
    queryKey: ['kpi-status'],
    queryFn: async () => (await apiClient.get('/kpi/status') as any).data,
  });

  const { data, isLoading, error, isFetching } = useQuery<ScorecardsResponse>({
    queryKey: ['kpi-scorecards'],
    queryFn: async () => (await apiClient.get('/kpi/scorecards') as any).data,
    enabled: status?.configured === true,
    retry: false,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => apiClient.post('/kpi/refresh'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-scorecards'] }),
  });

  const self = data?.employees.find((e) => e.is_self);
  const team = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.employees || []).filter(
      (e) =>
        !e.is_self &&
        (!onlyWithKpis || e.scorecard) &&
        (!q ||
          e.user.name.toLowerCase().includes(q) ||
          e.user.department.toLowerCase().includes(q) ||
          e.user.designation.toLowerCase().includes(q))
    );
  }, [data, search, onlyWithKpis]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const teamWithKpis = (data?.employees || []).filter((e) => !e.is_self && e.scorecard);
  const teamAverage =
    teamWithKpis.length > 0
      ? Math.round(
          (teamWithKpis.reduce((s, e) => s + (e.scorecard!.overall_achievement || 0), 0) / teamWithKpis.length) * 100
        ) / 100
      : null;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Target size={22} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">KRA & KPI Scorecards</h1>
            <p className="text-xs text-slate-500">
              {data?.period?.name ? (
                <>
                  Period <span className="font-bold text-slate-700">{data.period.name}</span> • from the Compliance Dashboard
                  {data.fetched_at && ` • synced ${new Date(data.fetched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </>
              ) : (
                'Completion % for each KPI, synced from the BrickFour Compliance Dashboard.'
              )}
            </p>
          </div>
        </div>
        {isAdmin && status?.configured && (
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isFetching}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw size={14} className={refreshMutation.isPending || isFetching ? 'animate-spin' : ''} />
            Sync now
          </button>
        )}
      </div>

      {/* Not configured */}
      {!isLoadingStatus && status && !status.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex gap-3 text-amber-900">
          <Settings size={20} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold">KRA/KPI sync is not set up yet</p>
            <p className="text-xs">
              {isAdmin ? (
                <>
                  Add <code className="font-mono bg-amber-100 px-1 rounded">COMPLIANCE_EMAIL</code> and{' '}
                  <code className="font-mono bg-amber-100 px-1 rounded">COMPLIANCE_PASSWORD</code> (a Compliance Dashboard account that can
                  see all KPIs) to the server's <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code>, then restart the server.
                </>
              ) : (
                'Ask your administrator to connect the Compliance Dashboard.'
              )}
            </p>
          </div>
        </div>
      )}

      {(isLoadingStatus || (status?.configured && isLoading)) && (
        <div className="flex items-center justify-center py-16 text-slate-500 gap-3">
          <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold">Loading scorecards from the Compliance Dashboard...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-5 flex gap-3 text-red-800">
          <AlertTriangle size={20} className="shrink-0" />
          <div>
            <p className="text-sm font-bold">Could not load KRA/KPI data</p>
            <p className="text-xs">{(error as any)?.response?.data?.error?.message || 'The Compliance Dashboard did not respond.'}</p>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-2">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">My KPI completion</span>
              {self?.scorecard ? (
                <>
                  <p className={`text-3xl font-black tabular-nums ${achievementColor(self.scorecard.overall_achievement).text}`}>
                    {self.scorecard.overall_achievement ?? '—'}%
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {self.scorecard.recorded_count}/{self.scorecard.kpi_count} KPIs recorded
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-400 pt-2">No KPIs assigned to you this period.</p>
              )}
            </div>
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-2">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Team average</span>
              <p className={`text-3xl font-black tabular-nums ${achievementColor(teamAverage).text}`}>
                {teamAverage === null ? '—' : `${teamAverage}%`}
              </p>
              <p className="text-[11px] text-slate-500">Across {teamWithKpis.length} team member(s) with KPIs</p>
            </div>
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-2">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Visible to you</span>
              <p className="text-3xl font-black text-slate-900 tabular-nums">{(data.employees.length || 1) - 1}</p>
              <p className="text-[11px] text-slate-500">
                {isAdmin ? 'Everyone in the organisation' : 'Your direct and indirect reports'}
              </p>
            </div>
          </div>

          {/* My scorecard */}
          {self?.scorecard && (
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-slate-900">My KRAs & KPIs</h2>
              <ScorecardDetail scorecard={self.scorecard} />
            </div>
          )}

          {isAdmin && data.unmatched_owners && data.unmatched_owners.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                <strong>Not matched to an employee here:</strong> {data.unmatched_owners.join(', ')}. Their KPIs are hidden — make the name
                or email the same in both systems.
              </span>
            </div>
          )}

          {/* Team, hierarchy-wise */}
          {data.employees.length > 1 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900">{isAdmin ? 'Organisation Scorecards' : 'My Team’s Scorecards'}</h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyWithKpis}
                      onChange={(e) => setOnlyWithKpis(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    Only people with KPIs
                  </label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name or department..."
                      className="pl-8 pr-3 py-2 w-56 max-w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {team.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-400">
                  {onlyWithKpis ? 'No one in your team has KPIs this period.' : 'No team members match your search.'}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {team.map((row) => {
                    const isOpen = expanded.has(row.user.id);
                    const card = row.scorecard;
                    return (
                      <div key={row.user.id}>
                        <button
                          type="button"
                          onClick={() => card && toggle(row.user.id)}
                          disabled={!card}
                          className="w-full px-4 sm:px-5 py-3 flex items-center gap-3 text-left hover:bg-slate-50/80 disabled:cursor-default transition-colors"
                        >
                          <span
                            className="flex items-center gap-2 min-w-0 flex-1"
                            style={{ paddingLeft: `${Math.max(0, row.depth - 1) * 16}px` }}
                          >
                            <span className="text-slate-400 shrink-0 w-3.5">
                              {card ? isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
                            </span>
                            <span className="w-8 h-8 rounded-xl bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                              {row.user.name.charAt(0)}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-slate-900 truncate">{row.user.name}</span>
                              <span className="block text-[10px] text-slate-500 truncate">
                                {row.user.designation} • {row.user.department}
                                {row.user.manager_name && ` • reports to ${row.user.manager_name}`}
                              </span>
                            </span>
                          </span>
                          <span className="hidden sm:block text-[10px] text-slate-500 font-semibold shrink-0 w-24 text-right">
                            {card ? `${card.recorded_count}/${card.kpi_count} KPIs` : 'No KPIs'}
                          </span>
                          <span className="w-32 sm:w-44 shrink-0">
                            <AchievementBar value={card ? card.overall_achievement : null} />
                          </span>
                        </button>
                        {isOpen && card && (
                          <div className="px-4 sm:px-5 pb-4 bg-slate-50/40">
                            <ScorecardDetail scorecard={card} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!self?.scorecard && data.employees.length <= 1 && (
            <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center space-y-2">
              <UserIcon size={28} className="text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">No KRAs or KPIs are assigned to you in the Compliance Dashboard this period.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
