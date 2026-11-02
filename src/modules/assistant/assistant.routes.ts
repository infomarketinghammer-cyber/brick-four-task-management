/**
 * Admin-only AI Assistant
 * Answers questions about the organisation's tasks and people, grounded in a live snapshot
 * of the in-memory stores. Uses Gemini via GEMINI_API_KEY.
 */

import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { sendSuccess } from '../../utils/envelope';
import { AppError } from '../../utils/errors';
import { dbStore } from '../../db/prisma';
import { tasksStore } from '../../db/tasksStore';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TASKS_IN_CONTEXT = 400;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

function buildOrgSnapshot(): string {
  const users = Array.from(dbStore.users.values()).filter((u) => u.is_active && u.id !== 'usr-admin-001');
  const nameOf = (id?: string | null) => (id ? dbStore.users.get(id)?.name || id : '-');

  const userLines = users.map(
    (u) => `${u.id} | ${u.name} | ${u.role} | ${u.department} | ${u.designation} | reports to: ${nameOf(u.manager_id)}`
  );

  const tasks = Array.from(tasksStore.tasks.values())
    .filter((t) => !t.is_deleted)
    .sort((a, b) => new Date(String(b.updated_at || 0)).getTime() - new Date(String(a.updated_at || 0)).getTime())
    .slice(0, MAX_TASKS_IN_CONTEXT);

  const taskLines = tasks.map((t) =>
    [
      t.id,
      t.title,
      t.status,
      t.priority,
      `assigned by: ${nameOf(t.created_by_id)}`,
      `assignee: ${nameOf(t.assigned_to_id)}`,
      `due: ${t.due_date ? new Date(t.due_date).toISOString().slice(0, 10) : '-'}`,
      `overdue: ${t.is_overdue ? 'yes' : 'no'}`,
      `progress: ${t.progress_percent ?? 0}%`,
      `parent: ${t.parent_task_id || '-'}`,
    ].join(' | ')
  );

  return [
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `USERS (${users.length}) — id | name | role | department | designation | manager`,
    ...userLines,
    '',
    `TASKS (${taskLines.length} most recently updated) — id | title | status | priority | assigner | assignee | due | overdue | progress | parent task`,
    ...(taskLines.length > 0 ? taskLines : ['(no tasks yet)']),
  ].join('\n');
}

const SYSTEM_PROMPT = `You are the BrickFour Task Management assistant, available only to the company administrator.
Answer questions about tasks, workload, deadlines, delegation chains and people using ONLY the data snapshot provided.
If the data does not contain the answer, say so plainly rather than guessing.
Keep answers concise and practical; use short bullet lists or small tables when listing tasks or people.
You cannot modify data — if asked to change something, explain where in the app the admin can do it.`;

// POST /api/v1/assistant/chat  { messages: [{ role: 'user' | 'assistant', content: string }] }
router.post('/chat', async (req, res, next) => {
  try {
    const ai = getClient();
    if (!ai) {
      throw new AppError(
        'The assistant is not configured. Set GEMINI_API_KEY on the server to enable it.',
        503,
        'ASSISTANT_NOT_CONFIGURED'
      );
    }

    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const history = rawMessages
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.slice(0, MAX_MESSAGE_CHARS) }],
      }));

    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      throw AppError.badRequest('Send at least one user message');
    }

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: history,
      config: {
        systemInstruction: `${SYSTEM_PROMPT}\n\n--- DATA SNAPSHOT ---\n${buildOrgSnapshot()}`,
        temperature: 0.2,
      },
    });

    const reply = response.text?.trim() || 'I could not generate an answer for that. Please try rephrasing.';
    res.json(sendSuccess({ reply }));
  } catch (err: any) {
    if (err instanceof AppError) return next(err);
    console.error('[assistant] Gemini request failed:', err?.message || err);
    next(new AppError('The assistant could not answer right now. Please try again.', 502, 'ASSISTANT_UPSTREAM_ERROR'));
  }
});

export default router;
