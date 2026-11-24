import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Calendar,
  Clock,
  User as UserIcon,
  AlertCircle,
  Bold,
  Italic,
  List,
  Code,
  Repeat,
  Bell,
  Sparkles,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';

import { apiClient } from '../api/client';
import { uploadTaskAttachments } from '../api/attachments';
import { useAuthStore } from '../store/authStore';
import { showToast } from '../store/toastStore';
import { useAssignableUsers } from '../hooks/useAssignableUsers';
import { AttachmentPicker } from './AttachmentPicker';
import { TaskPriority } from '../types';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Blocks picking a past date/time for a brand-new task's schedule — a task created with a
// deadline already behind it would be marked OVERDUE the instant it's saved.
function nowForDateTimeInput(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function CreateTaskModal({ isOpen, onClose }: CreateTaskModalProps) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [createMode, setCreateMode] = useState<'TASK' | 'PROJECT'>('TASK');
  const [assignedToId, setAssignedToId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<TaskPriority>('CRITICAL');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Recurrence State
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM'>('WEEKLY');

  // Reminder State
  const [enableReminder, setEnableReminder] = useState(true);
  const [reminderType, setReminderType] = useState<'RELATIVE' | 'ABSOLUTE'>('RELATIVE');
  const [relativeMinutes, setRelativeMinutes] = useState('15');
  const [absoluteScheduledAt, setAbsoluteScheduledAt] = useState('');

  // Documents to attach once the task is created
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Org-wide assignable users for the Assignee picker: peers at my level (any department)
  // plus anyone at a lower level (any department) — see useAssignableUsers.
  const { assignableUsers, isLoading: isLoadingSubordinates } = useAssignableUsers(isOpen);

  // Set default assignee to current user when modal opens
  useEffect(() => {
    if (isOpen && currentUser) {
      setCreateMode('TASK');
      setAssignedToId(currentUser.id);
      setAssigneeIds([]);
      // Default dates — local time (not raw UTC), so they never start out below the
      // local-time `min` the date pickers enforce in a positive-UTC-offset timezone.
      const nowLocal = nowForDateTimeInput();
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      nextWeek.setMinutes(nextWeek.getMinutes() - nextWeek.getTimezoneOffset());
      setStartDate(nowLocal);
      setDueDate(nextWeek.toISOString().slice(0, 16));
      setAbsoluteScheduledAt(nowLocal);
    }
  }, [isOpen, currentUser]);

  // Create Task Mutation
  const createTaskMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res: any = await apiClient.post('/tasks', payload);
      const created = res.data;

      // Upload documents attached at assignment time; the task already exists, so a failed upload only warns
      if (created?.id && attachmentFiles.length > 0) {
        try {
          await uploadTaskAttachments(created.id, attachmentFiles, 'REFERENCE');
        } catch (uploadErr: any) {
          showToast({
            type: 'error',
            title: 'Task created, documents not attached',
            message: uploadErr?.response?.data?.error?.message || 'Open the task to attach the documents again.',
          });
        }
      }
      return created;
    },
    onSuccess: () => {
      // Invalidate queries to refresh task lists & KPIs
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['delegated-tasks'] });

      // Reset and close
      resetForm();
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to create task';
      setErrorMessage(msg);
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCreateMode('TASK');
    setAssigneeIds([]);
    setPriority('CRITICAL');
    setIsRecurring(false);
    setRecurrencePattern('WEEKLY');
    setEnableReminder(true);
    setReminderType('RELATIVE');
    setRelativeMinutes('15');
    setAttachmentFiles([]);
    setErrorMessage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage('Task title is required');
      return;
    }

    if (createMode === 'PROJECT' && assigneeIds.length === 0) {
      setErrorMessage('Select at least one employee to assign the project to');
      return;
    }

    const reminders = [];
    if (enableReminder) {
      if (reminderType === 'RELATIVE') {
        reminders.push({
          type: 'RELATIVE',
          relativeMinutes: Number(relativeMinutes),
        });
      } else if (absoluteScheduledAt) {
        reminders.push({
          type: 'ABSOLUTE',
          scheduledAt: new Date(absoluteScheduledAt).toISOString(),
        });
      }
    }

    const payload =
      createMode === 'PROJECT'
        ? {
            title: title.trim(),
            description,
            task_type: 'PROJECT' as const,
            assignee_ids: assigneeIds,
            priority,
            start_date: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
            due_date: dueDate ? new Date(dueDate).toISOString() : null,
            is_recurring: isRecurring,
            recurrence_pattern: isRecurring ? recurrencePattern : null,
            reminders,
          }
        : {
            title: title.trim(),
            description,
            assigned_to_id: assignedToId || currentUser?.id,
            priority,
            start_date: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
            due_date: dueDate ? new Date(dueDate).toISOString() : null,
            is_recurring: isRecurring,
            recurrence_pattern: isRecurring ? recurrencePattern : null,
            reminders,
          };

    createTaskMutation.mutate(payload);
  };

  // Rich Text Helpers
  const insertFormatting = (tagStart: string, tagEnd: string = '') => {
    setDescription((prev) => `${prev}${tagStart}text${tagEnd}`);
  };

  if (!isOpen) return null;

  // Group the org-wide assignable list by department for clearer browsing in the picker.
  const assigneesByDept = assignableUsers.reduce<Record<string, typeof assignableUsers>>((acc, u) => {
    const dept = u.department || 'Other';
    (acc[dept] = acc[dept] || []).push(u);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] sm:max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
              <Plus size={20} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {createMode === 'PROJECT' ? 'Create & Assign Project' : 'Create & Assign Task'}
              </h2>
              <p className="text-xs text-slate-500">
                Assign {createMode === 'PROJECT' ? 'projects' : 'tasks'} down your management chain with hierarchy governance.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Content */}
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
            {errorMessage && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-xs text-red-700 font-medium">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

          {/* Task vs Project Mode Toggle */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setCreateMode('TASK')}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                createMode === 'TASK' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Task (1 assignee)
            </button>
            <button
              type="button"
              onClick={() => setCreateMode('PROJECT')}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                createMode === 'PROJECT' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Project (multiple assignees)
            </button>
          </div>

          {/* Title Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <span>{createMode === 'PROJECT' ? 'Project Title' : 'Task Title'}</span>
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                createMode === 'PROJECT'
                  ? 'e.g., Q1 Client Onboarding Rollout'
                  : 'e.g., Upgrade API Authentication Middleware & Tokens'
              }
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Description Field with Rich Formatting */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Description (Rich Text)</label>

            <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 bg-slate-50">
                {/* Formatting Bar */}
                <div className="flex items-center gap-1 p-2 bg-slate-100/80 border-b border-slate-200 text-slate-600">
                  <button
                    type="button"
                    onClick={() => insertFormatting('<b>', '</b>')}
                    className="p-1 hover:bg-slate-200 rounded text-slate-700"
                    title="Bold"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('<i>', '</i>')}
                    className="p-1 hover:bg-slate-200 rounded text-slate-700"
                    title="Italic"
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('<ul>\n  <li>', '</li>\n</ul>')}
                    className="p-1 hover:bg-slate-200 rounded text-slate-700"
                    title="Bullet List"
                  >
                    <List size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('<code>', '</code>')}
                    className="p-1 hover:bg-slate-200 rounded text-slate-700"
                    title="Code"
                  >
                    <Code size={14} />
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter detailed task instructions, technical acceptance criteria, or HTML formatted description..."
                  className="w-full p-3 bg-white text-xs text-slate-800 font-medium focus:outline-none resize-none"
                />
              </div>
          </div>

          {/* Assignee & Priority Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {createMode === 'TASK' ? (
              /* Assignee Dropdown: self, any peer at my level, or anyone below my level — org-wide */
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <UserIcon size={14} className="text-slate-400" />
                  <span>Assignee (My Level & Below, Org-Wide)</span>
                </label>
                <select
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  {currentUser && (
                    <option value={currentUser.id}>
                      Assign to Myself ({currentUser.name} - {currentUser.designation})
                    </option>
                  )}

                  {isLoadingSubordinates ? (
                    <option disabled>Loading assignable employees...</option>
                  ) : (
                    Object.entries(assigneesByDept).map(([dept, people]) => (
                      <optgroup key={dept} label={dept}>
                        {people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name} ({person.designation})
                          </option>
                        ))}
                      </optgroup>
                    ))
                  )}
                </select>
                <p className="text-[10px] text-slate-400">
                  Assign to yourself, a peer at your level, or anyone below your level — in any department.
                </p>
              </div>
            ) : (
              /* Multi-select Assignee Picker for Projects */
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <UserIcon size={14} className="text-slate-400" />
                  <span>Assignees ({assigneeIds.length} selected)</span>
                </label>
                <div className="w-full max-h-40 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {isLoadingSubordinates ? (
                    <div className="px-3 py-2.5 text-xs text-slate-400">Loading assignable employees...</div>
                  ) : assignableUsers.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-400">No one at or below your level to assign a project to.</div>
                  ) : (
                    assignableUsers.map((person) => {
                      const checked = assigneeIds.includes(person.id);
                      return (
                        <label
                          key={person.id}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-800 cursor-pointer hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setAssigneeIds((prev) =>
                                e.target.checked ? [...prev, person.id] : prev.filter((id) => id !== person.id)
                              );
                            }}
                            className="text-indigo-600 focus:ring-indigo-500 rounded"
                          />
                          <span>
                            {person.name} ({person.designation} - Dept: {person.department})
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  Each selected employee gets their own tracked task; the project auto-completes once everyone finishes.
                </p>
              </div>
            )}

            {/* Priority Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Priority Level</label>
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as TaskPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      priority === p
                        ? p === 'CRITICAL'
                          ? 'bg-red-600 text-white shadow-xs'
                          : p === 'HIGH'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : p === 'MEDIUM'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">
                Defaults to Critical if not changed.
              </p>
            </div>
          </div>

          {/* Documents attached at assignment */}
          <AttachmentPicker
            files={attachmentFiles}
            onChange={setAttachmentFiles}
            label="Attach Documents (optional)"
            disabled={createTaskMutation.isPending}
          />

          {/* Dates Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Calendar size={14} className="text-slate-400" />
                <span>Start Date</span>
              </label>
              <input
                type="datetime-local"
                value={startDate}
                min={nowForDateTimeInput()}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Clock size={14} className="text-slate-400" />
                <span>Due Date</span>
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                min={nowForDateTimeInput()}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Recurrence Section */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat size={16} className="text-indigo-600" />
                <span className="text-xs font-bold text-slate-900">{createMode === 'PROJECT' ? 'Project Recurrence' : 'Task Recurrence'}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {isRecurring && (
              <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium shrink-0">Frequency:</span>
                <div className="flex flex-wrap gap-1.5">
                  {(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const).map((pat) => (
                    <button
                      key={pat}
                      type="button"
                      onClick={() => setRecurrencePattern(pat)}
                      className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                        recurrencePattern === pat
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {pat}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Reminder Section */}
          <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-indigo-600" />
                <span className="text-xs font-bold text-slate-900">Notification Reminder</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableReminder}
                  onChange={(e) => setEnableReminder(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {enableReminder && (
              <div className="pt-2 border-t border-indigo-100/80 space-y-2.5">
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="reminderType"
                      checked={reminderType === 'RELATIVE'}
                      onChange={() => setReminderType('RELATIVE')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Relative (Before Due Date)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="reminderType"
                      checked={reminderType === 'ABSOLUTE'}
                      onChange={() => setReminderType('ABSOLUTE')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Absolute Date & Time</span>
                  </label>
                </div>

                {reminderType === 'RELATIVE' ? (
                  <select
                    value={relativeMinutes}
                    onChange={(e) => setRelativeMinutes(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="15">15 minutes before due date</option>
                    <option value="30">30 minutes before due date</option>
                    <option value="60">1 hour before due date</option>
                    <option value="1440">1 day before due date</option>
                  </select>
                ) : (
                  <input
                    type="datetime-local"
                    value={absoluteScheduledAt}
                    min={nowForDateTimeInput()}
                    onChange={(e) => setAbsoluteScheduledAt(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>
            )}
          </div>

          </div>

          {/* Modal Actions (Sticky Footer) */}
          <div className="flex items-center justify-end gap-3 px-6 py-3.5 bg-slate-50 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTaskMutation.isPending}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {createTaskMutation.isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{createMode === 'PROJECT' ? 'Creating Project...' : 'Creating Task...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>{createMode === 'PROJECT' ? 'Assign & Launch Project' : 'Assign & Launch Task'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
