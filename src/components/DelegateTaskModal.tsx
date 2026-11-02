import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, GitBranch, AlertCircle, CheckCircle2, User as UserIcon, Calendar, Clock } from 'lucide-react';
import { apiClient } from '../api/client';
import { uploadTaskAttachments } from '../api/attachments';
import { showToast } from '../store/toastStore';
import { useAssignableUsers } from '../hooks/useAssignableUsers';
import { AttachmentPicker } from './AttachmentPicker';
import { Task, TaskPriority } from '../types';

interface DelegateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentTask: Task;
}

export function DelegateTaskModal({ isOpen, onClose, parentTask }: DelegateTaskModalProps) {
  const queryClient = useQueryClient();
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  const [subordinateId, setSubordinateId] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState(`[Subtask] ${parentTask.title}`);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('CRITICAL');
  const [dueDate, setDueDate] = useState(
    parentTask.due_date ? new Date(parentTask.due_date).toISOString().slice(0, 16) : ''
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Subordinates (and peer department heads) for assignment
  const { subordinates: subordinatesList, peerHeads, isLoading: isLoadingSubordinates } = useAssignableUsers(isOpen);

  const delegateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res: any = await apiClient.post(`/tasks/${parentTask.id}/delegate`, payload);
      const subtask = res.data;

      if (subtask?.id && attachmentFiles.length > 0) {
        try {
          await uploadTaskAttachments(subtask.id, attachmentFiles, 'REFERENCE');
        } catch (uploadErr: any) {
          showToast({
            type: 'error',
            title: 'Subtask created, documents not attached',
            message: uploadErr?.response?.data?.error?.message || 'Open the subtask to attach the documents again.',
          });
        }
      }
      return subtask;
    },
    onSuccess: () => {
      setAttachmentFiles([]);
      queryClient.invalidateQueries({ queryKey: ['subtasks', parentTask.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', parentTask.id] });
      queryClient.invalidateQueries({ queryKey: ['task-lineage', parentTask.id] });
      queryClient.invalidateQueries({ queryKey: ['task-activity', parentTask.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to delegate subtask';
      setErrorMessage(msg);
    },
  });

  if (!isOpen) return null;

  const subordinateIds = new Set(subordinatesList.map((s) => s.id));
  const peerHeadOptions = peerHeads.filter((h) => !subordinateIds.has(h.id) && h.id !== parentTask.created_by_id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!subordinateId) {
      setErrorMessage('Please select a subordinate to delegate this subtask to.');
      return;
    }

    if (!subtaskTitle.trim()) {
      setErrorMessage('Subtask title is required.');
      return;
    }

    delegateMutation.mutate({
      subordinate_id: subordinateId,
      title: subtaskTitle.trim(),
      description,
      priority,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] sm:max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
              <GitBranch size={20} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Delegate Subtask</h2>
              <p className="text-xs text-slate-500">
                Child task depth level: <span className="font-bold text-indigo-600">{(parentTask.depth || 0) + 1}</span>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-xs text-red-700 font-medium">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

          {/* Parent Task Context Banner */}
          <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider">Parent Task Context</span>
            <p className="text-xs font-bold text-slate-900 line-clamp-1">{parentTask.title}</p>
          </div>

          {/* Subordinate Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <UserIcon size={14} className="text-slate-400" />
              <span>Select Subordinate Assignee</span>
              <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={subordinateId}
              onChange={(e) => setSubordinateId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">-- Select Direct or Indirect Subordinate --</option>
              {isLoadingSubordinates ? (
                <option disabled>Loading subordinates...</option>
              ) : (
                <>
                  {subordinatesList.length > 0 && (
                    <optgroup label="My Team">
                      {subordinatesList.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} ({sub.designation} - Dept: {sub.department})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {peerHeadOptions.length > 0 && (
                    <optgroup label="Other Department Heads">
                      {peerHeadOptions.map((head) => (
                        <option key={head.id} value={head.id}>
                          {head.name} (Head - {head.department})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>
          </div>

          {/* Subtask Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Subtask Title *</label>
            <input
              type="text"
              required
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Subtask Instructions</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide specific instructions or acceptance criteria for this delegated component..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Documents for the delegate */}
          <AttachmentPicker
            files={attachmentFiles}
            onChange={setAttachmentFiles}
            label="Attach Documents (optional)"
            disabled={delegateMutation.isPending}
          />

          {/* Priority & Due Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Calendar size={12} />
                <span>Due Date</span>
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Submit Actions (Sticky Footer) */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 bg-slate-50 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={delegateMutation.isPending}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {delegateMutation.isPending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Delegating...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Assign Subtask</span>
              </>
            )}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
