/**
 * KRA/KPI integration: Compliance Dashboard sync (mocked) and hierarchy-scoped visibility.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import kpiRoutes from '../src/modules/kpi/kpi.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';
import { dbStore } from '../src/db/prisma';

const DASH = 'https://compliance.test';

// Mock Compliance Dashboard data: KPIs owned by Legal team members, Sales head, and one unknown owner
const dashUsers = [
  { id: 'd-dwarka', name: 'Dwarka Laxman Khandade', email: 'dwarka@brickfour.com' },
  { id: 'd-archana', name: 'Adv. Archana Katkar', email: 'someone-else@legal.example' }, // name match (honorific stripped)
  { id: 'd-darshana', name: 'Darshana Ghodake', email: '' }, // first + last name match
  { id: 'd-sanghshil', name: 'Sanghshil Ghatkamble', email: 'sanghshil@brickfour.com' },
  { id: 'd-ghost', name: 'Ghost Person', email: 'ghost@nowhere.example' },
];
const kras = [{ id: 'kra-1', kraNumber: 1, name: 'Legal Compliance' }, { id: 'kra-2', kraNumber: 2, name: 'Sales Growth' }];
const kpis = [
  { id: 'kpi-a', kpiCode: 'KPI-1', name: 'Contracts vetted', kraId: 'kra-1', ownerId: 'd-dwarka', targetValue: 100, unit: '%', weight: 50, active: true },
  { id: 'kpi-b', kpiCode: 'KPI-2', name: 'Title searches', kraId: 'kra-1', ownerId: 'd-dwarka', targetValue: 20, unit: 'cases', weight: 50, active: true },
  { id: 'kpi-c', kpiCode: 'KPI-3', name: 'Notices drafted', kraId: 'kra-1', ownerId: 'd-archana', targetValue: 10, unit: 'docs', weight: 100, active: true },
  { id: 'kpi-d', kpiCode: 'KPI-4', name: 'Encumbrance checks', kraId: 'kra-1', ownerId: 'd-darshana', targetValue: 5, unit: 'cases', weight: 100, active: true },
  { id: 'kpi-e', kpiCode: 'KPI-5', name: 'Units sold', kraId: 'kra-2', ownerId: 'd-sanghshil', targetValue: 40, unit: 'units', weight: 100, active: true },
  { id: 'kpi-f', kpiCode: 'KPI-6', name: 'Unknown', kraId: 'kra-1', ownerId: 'd-ghost', targetValue: 1, unit: '', weight: 100, active: true },
];
const measurements = [
  { kpiId: 'kpi-a', periodId: 'p-1', actual: 80, achievement: 80, weightedScore: 40, status: 'ON_TRACK' },
  { kpiId: 'kpi-b', periodId: 'p-1', actual: 3, achievement: 15, weightedScore: 7.5, status: 'AT_RISK' },
  { kpiId: 'kpi-c', periodId: 'p-1', actual: 9, achievement: 90, weightedScore: 90, status: 'ON_TRACK' },
  { kpiId: 'kpi-e', periodId: 'p-1', actual: 20, achievement: 50, weightedScore: 50, status: 'AT_RISK' },
];

let loginCount = 0;
function mockDashboard(url: string, init?: RequestInit) {
  const path = url.replace(DASH, '');
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  if (path === '/api/auth/login') {
    loginCount++;
    return json({ token: 'svc-token', user: { id: 'svc' } });
  }
  if ((init?.headers as Record<string, string>)?.Authorization !== 'Bearer svc-token') return json({ error: 'Unauthorized' }, 401);
  if (path === '/api/bootstrap') return json({ activePeriod: { id: 'p-1', name: 'Sep 2026' } });
  if (path === '/api/kras') return json({ kras, totalWeight: 100, isValidTotalWeight: true });
  if (path === '/api/kpis') return json(kpis);
  if (path.startsWith('/api/measurements')) return json(measurements);
  if (path === '/api/auth/users') return json(dashUsers);
  return json({ error: 'not found' }, 404);
}

const app = express();
app.use(express.json());
app.use('/api/v1/kpi', kpiRoutes);
app.use(errorHandler);

const tokenFor = (userId: string) => {
  const u = dbStore.users.get(userId)!;
  return signAccessToken({ userId: u.id, email: u.email, role: u.role, hierarchy_level: u.hierarchy_level });
};
const scorecardsAs = async (userId: string) => {
  const res = await request(app).get('/api/v1/kpi/scorecards').set('Authorization', `Bearer ${tokenFor(userId)}`);
  expect(res.status).toBe(200);
  return res.body.data;
};

describe('KRA/KPI - Compliance Dashboard integration', () => {
  beforeAll(() => {
    process.env.COMPLIANCE_API_URL = DASH;
    process.env.COMPLIANCE_EMAIL = 'svc@brickfour.com';
    process.env.COMPLIANCE_PASSWORD = 'secret';
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => mockDashboard(String(url), init)));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('pulls KPI completion % per employee and maps owners by email and by name', async () => {
    const data = await scorecardsAs('usr-hemant-001');
    const byId = new Map(data.employees.map((e: any) => [e.user.id, e]));

    const dwarka: any = byId.get('usr-dwarka-008');
    expect(dwarka.scorecard.kpi_count).toBe(2);
    const titleSearches = dwarka.scorecard.kras[0].kpis.find((k: any) => k.code === 'KPI-2');
    expect(titleSearches.achievement).toBe(15); // "KPI 2 — 15% completed"
    expect(dwarka.scorecard.overall_achievement).toBe(47.5); // (80*50 + 15*50) / 100

    expect((byId.get('usr-archana-005') as any).scorecard.overall_achievement).toBe(90);
    const darshana: any = byId.get('usr-darshana-073');
    expect(darshana.scorecard.recorded_count).toBe(0); // KPI exists but nothing measured yet
    expect(darshana.scorecard.overall_achievement).toBe(0);

    expect(data.period.name).toBe('Sep 2026');
    expect(data.unmatched_owners).toEqual(['Ghost Person']);
  });

  it('shows a department head their own scorecard and everyone below them, but not peer heads', async () => {
    const data = await scorecardsAs('usr-dwarka-008');
    const ids = data.employees.map((e: any) => e.user.id);
    expect(ids).toContain('usr-dwarka-008');
    expect(ids).toContain('usr-archana-005'); // direct report
    expect(ids).toContain('usr-vikas-026'); // team lead
    expect(ids).toContain('usr-darshana-073'); // team lead's report (indirect)
    expect(ids).not.toContain('usr-sanghshil-019'); // peer head
    expect(ids).not.toContain('usr-hemant-001'); // their manager
    expect(data.unmatched_owners).toBeUndefined();
  });

  it('shows a team lead only their own subtree, and an executive only themselves', async () => {
    const lead = await scorecardsAs('usr-vikas-026');
    expect(lead.employees.map((e: any) => e.user.id).sort()).toEqual(['usr-darshana-073', 'usr-vikas-026']);

    const exec = await scorecardsAs('usr-archana-005');
    expect(exec.employees.map((e: any) => e.user.id)).toEqual(['usr-archana-005']);
  });

  it('caches the dashboard data instead of signing in on every request', async () => {
    const before = loginCount;
    await scorecardsAs('usr-archana-005');
    await scorecardsAs('usr-dwarka-008');
    expect(loginCount).toBe(before);
  });

  it('only lets the admin force a re-sync', async () => {
    const denied = await request(app).post('/api/v1/kpi/refresh').set('Authorization', `Bearer ${tokenFor('usr-dwarka-008')}`);
    expect(denied.status).toBe(403);
    const ok = await request(app).post('/api/v1/kpi/refresh').set('Authorization', `Bearer ${tokenFor('usr-hemant-001')}`);
    expect(ok.status).toBe(200);
  });
});
