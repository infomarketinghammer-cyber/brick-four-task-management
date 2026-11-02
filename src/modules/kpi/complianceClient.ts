/**
 * Read-only client for the BrickFour Compliance Dashboard (KRA/KPI system).
 * Signs in with a service account, pulls KRAs, KPIs and the active period's measurements,
 * and maps KPI owners onto this tool's users so scores can be shown hierarchy-wise.
 */

import { dbStore } from '../../db/prisma';
import { User } from '../../types';
import { AppError } from '../../utils/errors';

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

export interface KpiScore {
  id: string;
  code: string;
  name: string;
  target: number | null;
  unit: string;
  weight: number | null;
  actual: number | null;
  achievement: number | null; // % completed for the period, as calculated by the dashboard
  weighted_score: number | null;
  status: string | null;
}

export interface KraGroup {
  id: string;
  number: string | number | null;
  name: string;
  kpis: KpiScore[];
}

export interface EmployeeScorecard {
  user_id: string; // this tool's user id
  dashboard_owner_id: string;
  owner_name: string;
  kras: KraGroup[];
  kpi_count: number;
  recorded_count: number;
  overall_achievement: number | null; // weight-averaged achievement across the employee's KPIs
}

export interface ComplianceSnapshot {
  period: { id: string | null; name: string | null };
  fetched_at: string;
  scorecards: Map<string, EmployeeScorecard>; // keyed by this tool's user id
  unmatched_owners: string[]; // dashboard owners we could not map to a user here
}

function config() {
  return {
    baseUrl: (process.env.COMPLIANCE_API_URL || 'https://brick-four-compliance-dashboard.vercel.app').replace(/\/+$/, ''),
    email: process.env.COMPLIANCE_EMAIL || '',
    password: process.env.COMPLIANCE_PASSWORD || '',
  };
}

export function isComplianceConfigured(): boolean {
  const { email, password } = config();
  return Boolean(email && password);
}

let token: string | null = null;
let cache: { snapshot: ComplianceSnapshot; expiresAt: number } | null = null;
let inflight: Promise<ComplianceSnapshot> | null = null;

async function rawRequest(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}) {
  const { baseUrl } = config();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.auth !== false && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function login() {
  const { email, password } = config();
  const res = await rawRequest('/api/auth/login', { method: 'POST', body: { email, password }, auth: false });
  if (!res.ok || !res.json?.token) {
    throw new AppError(
      `Could not sign in to the Compliance Dashboard (${res.json?.error || res.status}). Check COMPLIANCE_EMAIL / COMPLIANCE_PASSWORD.`,
      502,
      'COMPLIANCE_LOGIN_FAILED'
    );
  }
  token = res.json.token;
}

// GET with a single re-login on 401 (expired session)
async function get(path: string): Promise<any> {
  if (!token) await login();
  let res = await rawRequest(path);
  if (res.status === 401) {
    await login();
    res = await rawRequest(path);
  }
  if (!res.ok) {
    throw new AppError(
      `Compliance Dashboard request ${path} failed (${res.json?.error || res.status})`,
      502,
      'COMPLIANCE_UPSTREAM_ERROR'
    );
  }
  return res.json;
}

// The dashboard returns either bare arrays or { <key>: [...] }
const asArray = (value: any, key: string): any[] =>
  Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

// Same normalisation the dashboard uses for initials: drop honorifics, lowercase, collapse spaces
const normalizeName = (name: string) =>
  String(name || '')
    .toLowerCase()
    .replace(/^(mrs\.|mr\.|ms\.|ar\.|adv\.|ca)\s*/i, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function buildUserMatcher(users: User[]) {
  const byEmail = new Map<string, User>();
  const byName = new Map<string, User>();
  for (const u of users) {
    if (u.email) byEmail.set(u.email.toLowerCase(), u);
    byName.set(normalizeName(u.name), u);
  }
  return (owner: { email?: string; name?: string }): User | undefined => {
    if (owner.email) {
      const hit = byEmail.get(owner.email.toLowerCase());
      if (hit) return hit;
    }
    const n = normalizeName(owner.name || '');
    if (!n) return undefined;
    if (byName.has(n)) return byName.get(n);
    // Fall back to first + last name match (dashboard may omit middle names)
    const parts = n.split(' ');
    const firstLast = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : n;
    for (const [key, u] of byName) {
      const kp = key.split(' ');
      if (kp.length > 1 && `${kp[0]} ${kp[kp.length - 1]}` === firstLast) return u;
    }
    return undefined;
  };
}

async function fetchSnapshot(): Promise<ComplianceSnapshot> {
  const bootstrap = await get('/api/bootstrap');
  const period = bootstrap?.activePeriod || null;
  const periodId: string | null = period?.id || null;

  const [krasRes, kpisRes, measurementsRes, dashUsersRes] = await Promise.all([
    get('/api/kras'),
    get('/api/kpis'),
    get(periodId ? `/api/measurements?periodId=${encodeURIComponent(periodId)}` : '/api/measurements'),
    get('/api/auth/users').catch(() => []),
  ]);

  const kras = asArray(krasRes, 'kras');
  const kpis = asArray(kpisRes, 'kpis').filter((k) => k && k.active !== false);
  const measurements = asArray(measurementsRes, 'measurements').filter(
    (m) => !periodId || !m.periodId || m.periodId === periodId
  );
  const dashUsers = asArray(dashUsersRes, 'users');

  const kraById = new Map(kras.map((k: any) => [k.id, k]));
  const measurementByKpi = new Map(measurements.map((m: any) => [m.kpiId, m]));
  const dashUserById = new Map(dashUsers.map((u: any) => [u.id, u]));

  const localUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active);
  const matchUser = buildUserMatcher(localUsers);

  const scorecards = new Map<string, EmployeeScorecard>();
  const unmatched = new Set<string>();

  for (const kpi of kpis) {
    const ownerId = String(kpi.ownerId || '');
    const dashOwner: any = dashUserById.get(ownerId) || {};
    const ownerName = kpi.ownerName || dashOwner.name || ownerId;
    const localUser = matchUser({ email: dashOwner.email, name: ownerName });
    if (!localUser) {
      if (ownerName) unmatched.add(ownerName);
      continue;
    }

    let card = scorecards.get(localUser.id);
    if (!card) {
      card = {
        user_id: localUser.id,
        dashboard_owner_id: ownerId,
        owner_name: ownerName,
        kras: [],
        kpi_count: 0,
        recorded_count: 0,
        overall_achievement: null,
      };
      scorecards.set(localUser.id, card);
    }

    const kra: any = kraById.get(kpi.kraId) || {};
    let group = card.kras.find((g) => g.id === (kpi.kraId || 'unassigned'));
    if (!group) {
      group = {
        id: kpi.kraId || 'unassigned',
        number: kra.kraNumber ?? null,
        name: kra.name || 'Unassigned KRA',
        kpis: [],
      };
      card.kras.push(group);
    }

    const m: any = measurementByKpi.get(kpi.id);
    group.kpis.push({
      id: kpi.id,
      code: kpi.kpiCode || '',
      name: kpi.name || kpi.kpiCode || 'KPI',
      target: num(kpi.targetValue),
      unit: kpi.unit || '',
      weight: num(kpi.weight),
      actual: m ? num(m.actual ?? m.actualValue) : null,
      achievement: m ? num(m.achievement) : null,
      weighted_score: m ? num(m.weightedScore) : null,
      status: m?.status || null,
    });
  }

  // Overall % per employee: KPI-weight-averaged achievement (unrecorded KPIs count as 0%)
  for (const card of scorecards.values()) {
    const all = card.kras.flatMap((g) => g.kpis);
    card.kras.sort((a, b) => Number(a.number ?? 999) - Number(b.number ?? 999));
    card.kpi_count = all.length;
    card.recorded_count = all.filter((k) => k.achievement !== null).length;
    const totalWeight = all.reduce((s, k) => s + (k.weight || 1), 0);
    card.overall_achievement =
      all.length === 0
        ? null
        : Math.round((all.reduce((s, k) => s + (k.weight || 1) * (k.achievement || 0), 0) / totalWeight) * 100) / 100;
  }

  return {
    period: { id: periodId, name: period?.name || period?.label || periodId },
    fetched_at: new Date().toISOString(),
    scorecards,
    unmatched_owners: Array.from(unmatched),
  };
}

/**
 * Returns the cached snapshot, refreshing it when stale (or when force=true).
 */
export async function getComplianceSnapshot(force = false): Promise<ComplianceSnapshot> {
  if (!isComplianceConfigured()) {
    throw new AppError(
      'KRA/KPI integration is not configured. Set COMPLIANCE_EMAIL and COMPLIANCE_PASSWORD on the server.',
      503,
      'KPI_NOT_CONFIGURED'
    );
  }
  if (!force && cache && cache.expiresAt > Date.now()) return cache.snapshot;
  if (!inflight) {
    inflight = fetchSnapshot()
      .then((snapshot) => {
        cache = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
        return snapshot;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
