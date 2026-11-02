/**
 * KRA & KPI routes — scores pulled from the Compliance Dashboard, scoped by reporting hierarchy:
 * every user sees their own scorecard plus everyone below them (all levels); ADMIN sees everyone.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { sendSuccess } from '../../utils/envelope';
import { AppError } from '../../utils/errors';
import { dbStore } from '../../db/prisma';
import { getSubordinateIds } from '../../permissions';
import { getComplianceSnapshot, isComplianceConfigured } from './complianceClient';

const router = Router();
router.use(authenticate);

const LEGACY_ADMIN_ALIAS_ID = 'usr-admin-001';

function visibleUserIds(requesterId: string, isAdmin: boolean): Set<string> {
  const activeUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active && u.id !== LEGACY_ADMIN_ALIAS_ID);
  if (isAdmin) return new Set(activeUsers.map((u) => u.id));
  return new Set([requesterId, ...getSubordinateIds(requesterId, activeUsers)]);
}

// Depth below the requester in the reporting tree (0 = requester), for indenting the team view
function depthBelow(rootId: string, userId: string): number {
  let depth = 0;
  let current = dbStore.users.get(userId);
  const seen = new Set<string>();
  while (current && current.id !== rootId && current.manager_id && !seen.has(current.id)) {
    seen.add(current.id);
    depth++;
    current = dbStore.users.get(current.manager_id);
  }
  return current?.id === rootId ? depth : 0;
}

// GET /api/v1/kpi/scorecards — self + visible team, each with their KRAs/KPIs (or null if none assigned)
router.get('/scorecards', async (req, res, next) => {
  try {
    const requesterId = req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    const snapshot = await getComplianceSnapshot();
    const visible = visibleUserIds(requesterId, isAdmin);

    const employees = Array.from(visible)
      .map((id) => dbStore.users.get(id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .map((u) => ({
        user: {
          id: u.id,
          name: u.name,
          designation: u.designation,
          department: u.department,
          role: u.role,
          hierarchy_level: u.hierarchy_level,
          manager_id: u.manager_id || null,
          manager_name: u.manager_id ? dbStore.users.get(u.manager_id)?.name || null : null,
        },
        is_self: u.id === requesterId,
        depth: isAdmin ? u.hierarchy_level : depthBelow(requesterId, u.id),
        scorecard: snapshot.scorecards.get(u.id) || null,
      }))
      .sort((a, b) => a.user.hierarchy_level - b.user.hierarchy_level || a.user.name.localeCompare(b.user.name));

    res.json(
      sendSuccess({
        period: snapshot.period,
        fetched_at: snapshot.fetched_at,
        employees,
        // Only admins need to know which dashboard owners could not be matched to a user here
        unmatched_owners: isAdmin ? snapshot.unmatched_owners : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/kpi/status — lets the UI show a setup message instead of an error
router.get('/status', (_req, res) => {
  res.json(sendSuccess({ configured: isComplianceConfigured() }));
});

// POST /api/v1/kpi/refresh — admin forces a re-sync from the Compliance Dashboard
router.post('/refresh', requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const snapshot = await getComplianceSnapshot(true);
    res.json(sendSuccess({ fetched_at: snapshot.fetched_at, scorecards: snapshot.scorecards.size }));
  } catch (err) {
    next(err instanceof Error ? err : new AppError('Refresh failed', 502));
  }
});

export default router;
