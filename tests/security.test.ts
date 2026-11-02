/**
 * Section 1: Security Hardening Test Suite
 * Validates permission scoping, refresh token reuse detection, HTML sanitization, and signed URLs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { canViewTask, canAssignTask } from '../src/permissions';
import { dbStore } from '../src/db/prisma';
import { tasksStore } from '../src/db/tasksStore';
import { sanitizeRichText } from '../src/utils/sanitizer';
import {
  validateAttachment,
  generateSignedAttachmentUrl,
  verifySignedAttachmentUrl,
} from '../src/utils/attachments';
import { AuthService } from '../src/modules/auth/auth.service';
import { Task, User } from '../src/types';

describe('1. SECURITY - Task Query Permission Scoping', () => {
  let level3UserA: User;
  let level3UserB: User;
  let adminUser: User;
  let teamLead: User;

  beforeEach(() => {
    adminUser = dbStore.users.get('usr-admin-001')!;
    level3UserA = {
      id: 'usr-exec-01',
      name: 'Alex Rivera',
      email: 'alex@company.com',
      password_hash: '$2b$10$xyz',
      role: 'EXECUTIVE',
      hierarchy_level: 3,
      department: 'Engineering',
      designation: 'Developer A',
      manager_id: 'usr-admin-001',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    level3UserB = {
      id: 'usr-exec-04',
      name: 'Dmitri Volkov',
      email: 'dmitri@company.com',
      password_hash: '$2b$10$xyz',
      role: 'EXECUTIVE',
      hierarchy_level: 3,
      department: 'Engineering',
      designation: 'Developer B',
      manager_id: 'usr-admin-001',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    teamLead = {
      id: 'usr-lead-fe',
      name: 'Esha Joshi',
      email: 'esha.fe@company.com',
      password_hash: '$2b$10$xyz',
      role: 'TEAM_LEAD',
      hierarchy_level: 2,
      department: 'Engineering',
      designation: 'Lead Dev',
      manager_id: 'usr-admin-001',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
  });

  it('prevents a Level-3 Executive from viewing a sibling executive task by guessing the task ID', () => {
    // Task created by and assigned to Dmitri Volkov (level3UserB)
    const privateTaskOfB: Task = {
      id: 'tsk-private-b',
      title: 'Confidential Backend Task',
      description: 'Private research task',
      created_by_id: level3UserB.id,
      assigned_to_id: level3UserB.id,
      parent_task_id: null,
      root_task_id: 'tsk-private-b',
      depth: 0,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      is_recurring: false,
      submission_count: 0,
      last_submitted_at: null,
      first_submitted_at: null,
      is_overdue: false,
      overdue_since: null,
      completed_on_time: null,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const allUsers = Array.from(dbStore.users.values());

    // Alex Rivera (level3UserA) tries to view Dmitri's task
    const canAlexView = canViewTask(level3UserA, privateTaskOfB, { allUsers });
    expect(canAlexView).toBe(false);

    // Dmitri (owner/assignee) CAN view his task
    const canDmitriView = canViewTask(level3UserB, privateTaskOfB, { allUsers });
    expect(canDmitriView).toBe(true);

    // Admin CAN view any task
    const canAdminView = canViewTask(adminUser, privateTaskOfB, { allUsers });
    expect(canAdminView).toBe(true);
  });

  it('enforces universal dynamic access control: only creator, assignee, and admin have access, while all other employees are denied', () => {
    // Dynamic Employee Y creates and assigns a task to Dynamic Employee X
    const arbitraryAssigner: User = {
      id: 'usr-dyn-emp-y',
      name: 'Employee Y',
      email: 'y@company.com',
      password_hash: '$2b$10$xyz',
      role: 'DEPT_HEAD',
      hierarchy_level: 1,
      department: 'Operations',
      designation: 'Operations Lead',
      manager_id: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const arbitraryAssignee: User = {
      id: 'usr-dyn-emp-x',
      name: 'Employee X',
      email: 'x@company.com',
      password_hash: '$2b$10$xyz',
      role: 'EXECUTIVE',
      hierarchy_level: 3,
      department: 'Operations',
      designation: 'Operations Specialist',
      manager_id: 'usr-dyn-emp-y',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const arbitraryUnrelatedEmployee: User = {
      id: 'usr-dyn-emp-z',
      name: 'Employee Z',
      email: 'z@company.com',
      password_hash: '$2b$10$xyz',
      role: 'TEAM_LEAD',
      hierarchy_level: 2,
      department: 'Marketing',
      designation: 'Marketing Lead',
      manager_id: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const dynamicTask: Task = {
      id: 'tsk-dynamic-xy',
      title: 'Dynamic Workstream Task',
      description: 'Cross-functional assignment',
      created_by_id: arbitraryAssigner.id,
      assigned_to_id: arbitraryAssignee.id,
      parent_task_id: null,
      root_task_id: 'tsk-dynamic-xy',
      depth: 0,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      is_recurring: false,
      submission_count: 0,
      last_submitted_at: null,
      first_submitted_at: null,
      is_overdue: false,
      overdue_since: null,
      completed_on_time: null,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 1. Assigner Y -> ALLOWED (true)
    expect(canViewTask(arbitraryAssigner, dynamicTask)).toBe(true);

    // 2. Assignee X -> ALLOWED (true)
    expect(canViewTask(arbitraryAssignee, dynamicTask)).toBe(true);

    // 3. Authorized Admin -> ALLOWED (true)
    expect(canViewTask(adminUser, dynamicTask)).toBe(true);

    // 4. Unrelated Employee Z -> DENIED (false)
    expect(canViewTask(arbitraryUnrelatedEmployee, dynamicTask)).toBe(false);

    // 5. Existing Team Lead not involved in this task -> DENIED (false)
    expect(canViewTask(teamLead, dynamicTask)).toBe(false);
  });

  it('ensures tasks and calendar events do not appear on unrelated employee calendar or task views', async () => {
    const empX: User = {
      id: 'usr-iso-x',
      name: 'Employee X',
      email: 'x-iso@company.com',
      password_hash: '$2b$10$xyz',
      role: 'EXECUTIVE',
      hierarchy_level: 3,
      department: 'Engineering',
      designation: 'Developer',
      manager_id: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const empY: User = {
      id: 'usr-iso-y',
      name: 'Employee Y',
      email: 'y-iso@company.com',
      password_hash: '$2b$10$xyz',
      role: 'TEAM_LEAD',
      hierarchy_level: 2,
      department: 'Engineering',
      designation: 'Lead Developer',
      manager_id: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const empZ: User = {
      id: 'usr-iso-z',
      name: 'Employee Z',
      email: 'z-iso@company.com',
      password_hash: '$2b$10$xyz',
      role: 'EXECUTIVE',
      hierarchy_level: 3,
      department: 'Design',
      designation: 'UI Designer',
      manager_id: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Save users in store
    dbStore.users.set(empX.id, empX);
    dbStore.users.set(empY.id, empY);
    dbStore.users.set(empZ.id, empZ);

    // Task between X and Y
    const privateTask: Task = {
      id: 'tsk-iso-xy',
      title: 'Secret Feature Work',
      description: 'Between X and Y',
      created_by_id: empY.id,
      assigned_to_id: empX.id,
      parent_task_id: null,
      root_task_id: 'tsk-iso-xy',
      depth: 0,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      start_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 86400000).toISOString(),
      is_recurring: false,
      submission_count: 0,
      last_submitted_at: null,
      first_submitted_at: null,
      is_overdue: false,
      overdue_since: null,
      completed_on_time: null,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    tasksStore.tasks.set(privateTask.id, privateTask);

    // Verify task visibility
    expect(canViewTask(empX, privateTask)).toBe(true);
    expect(canViewTask(empY, privateTask)).toBe(true);
    expect(canViewTask(empZ, privateTask)).toBe(false);

    // Verify Calendar events query for Employee Z does NOT include privateTask
    const { CalendarService } = await import('../src/modules/calendar/calendar.service');
    const zEvents = await CalendarService.getCalendarEvents(empZ, {});
    const hasPrivateTaskInZCalendar = zEvents.some((e) => e.id === privateTask.id || e.id === `task-by-${privateTask.id}` || e.source_id === privateTask.id);
    expect(hasPrivateTaskInZCalendar).toBe(false);

    // Verify Calendar events query for Employee X DOES include privateTask
    const xEvents = await CalendarService.getCalendarEvents(empX, {});
    const hasPrivateTaskInXCalendar = xEvents.some((e) => e.id === privateTask.id || e.id === `task-by-${privateTask.id}` || e.source_id === privateTask.id);
    expect(hasPrivateTaskInXCalendar).toBe(true);
  });
});

describe('1. SECURITY - Refresh Token Rotation & Reuse Detection', () => {
  it('detects refresh token reuse and revokes all user sessions', async () => {
    // Login as admin
    const loginRes = await AuthService.login({
      email: 'admin@company.com',
      password: 'Password123!',
    });

    const token1 = loginRes.tokens.refreshToken;

    // First rotation (valid)
    const refreshRes1 = await AuthService.refresh({ refreshToken: token1 });
    const token2 = refreshRes1.refreshToken;

    expect(token2).toBeDefined();
    expect(token2).not.toEqual(token1);

    // REUSE ATTEMPT: Trying to use token1 again!
    await expect(AuthService.refresh({ refreshToken: token1 })).rejects.toThrow(
      /Refresh token reuse detected/
    );

    // Confirm token2 is now ALSO revoked due to reuse detection countermeasure
    await expect(AuthService.refresh({ refreshToken: token2 })).rejects.toThrow();
  });
});

describe('1. SECURITY - Server-Side Rich-Text HTML Sanitization', () => {
  it('strips dangerous <script>, <iframe>, and event handlers from HTML content', () => {
    const maliciousHtml = `<p>Normal description</p><script>alert("XSS")</script><img src="x" onerror="stealCookies()"/><iframe src="http://evil.com"></iframe>`;

    const cleanHtml = sanitizeRichText(maliciousHtml);

    expect(cleanHtml).not.toContain('<script>');
    expect(cleanHtml).not.toContain('onerror');
    expect(cleanHtml).not.toContain('<iframe>');
    expect(cleanHtml).toContain('<p>Normal description</p>');
    expect(cleanHtml).toContain('<img src="x" />');
  });
});

describe('1. SECURITY - Expiring Signed Attachment URLs & Validation', () => {
  it('rejects attachments over 10MB or with invalid MIME types', () => {
    const oversized = validateAttachment('image/png', 11 * 1024 * 1024);
    expect(oversized.valid).toBe(false);
    expect(oversized.error).toContain('exceeds max limit');

    const invalidType = validateAttachment('application/x-msdownload', 1024);
    expect(invalidType.valid).toBe(false);
    expect(invalidType.error).toContain('Unsupported file type');

    const validFile = validateAttachment('image/png', 500 * 1024);
    expect(validFile.valid).toBe(true);
  });

  it('verifies valid HMAC signatures and rejects expired or tampered signatures', () => {
    const fileKey = 'att-123456-document.pdf';
    const signedData = generateSignedAttachmentUrl(fileKey, 3600);

    // Valid signature check
    const isValid = verifySignedAttachmentUrl(fileKey, signedData.expiresAt, signedData.signature);
    expect(isValid).toBe(true);

    // Tampered signature
    const isTamperedValid = verifySignedAttachmentUrl(fileKey, signedData.expiresAt, 'bad-signature-hash');
    expect(isTamperedValid).toBe(false);

    // Expired timestamp
    const isExpiredValid = verifySignedAttachmentUrl(fileKey, Math.floor(Date.now() / 1000) - 100, signedData.signature);
    expect(isExpiredValid).toBe(false);
  });
});

describe('2. PERMISSIONS - Cross-Department Head Assignment & Delegation Chain Visibility', () => {
  const mkUser = (id: string, role: User['role'], level: number, dept: string, manager_id: string | null): User => ({
    id,
    name: id,
    email: `${id}@company.com`,
    password_hash: 'x',
    role,
    hierarchy_level: level,
    department: dept,
    designation: role,
    manager_id,
    is_active: true,
  });

  const ceo = mkUser('ceo', 'ADMIN', 0, 'Management', null);
  const salesHead = mkUser('sales-head', 'DEPT_HEAD', 1, 'Sales', 'ceo');
  const legalHead = mkUser('legal-head', 'DEPT_HEAD', 1, 'Legal', 'ceo');
  const legalExec = mkUser('legal-exec', 'EXECUTIVE', 2, 'Legal', 'legal-head');
  const salesExec = mkUser('sales-exec', 'EXECUTIVE', 2, 'Sales', 'sales-head');
  const allUsers = [ceo, salesHead, legalHead, legalExec, salesExec];

  const mkTask = (id: string, created_by_id: string, assigned_to_id: string, parent_task_id: string | null): Task => ({
    id,
    title: id,
    created_by_id,
    assigned_to_id,
    parent_task_id,
    root_task_id: 'root',
    depth: parent_task_id ? 1 : 0,
    status: 'TODO',
    priority: 'HIGH',
    is_recurring: false,
    submission_count: 0,
    last_submitted_at: null,
    first_submitted_at: null,
    is_overdue: false,
    overdue_since: null,
    completed_on_time: null,
    is_deleted: false,
  });

  // Sales head asks Legal head to vet a land sale; Legal head delegates to their executive
  const rootTask = mkTask('root', salesHead.id, legalHead.id, null);
  const subTask = mkTask('sub', legalHead.id, legalExec.id, 'root');
  const tasks = new Map([rootTask, subTask].map((t) => [t.id, t]));
  const getTask = (id: string) => tasks.get(id);

  it('allows a department head to assign to a peer department head, but not to another dept member', () => {
    expect(canAssignTask(salesHead, legalHead, allUsers)).toBe(true);
    expect(canAssignTask(salesHead, legalExec, allUsers)).toBe(false);
    expect(canAssignTask(salesExec, legalHead, allUsers)).toBe(false);
  });

  it('lets the requesting head monitor the subtask delegated by the peer head', () => {
    expect(canViewTask(salesHead, subTask, { allUsers, getTask })).toBe(true);
    expect(canViewTask(legalHead, subTask, { allUsers, getTask })).toBe(true);
    expect(canViewTask(legalExec, subTask, { allUsers, getTask })).toBe(true);
  });

  it('does not expose the delegation chain to unrelated users or downward to parents', () => {
    expect(canViewTask(salesExec, subTask, { allUsers, getTask })).toBe(false);
    expect(canViewTask(legalExec, rootTask, { allUsers, getTask })).toBe(false);
    // Without a task lookup the chain rule is not applied
    expect(canViewTask(salesHead, subTask, { allUsers })).toBe(false);
  });
});
