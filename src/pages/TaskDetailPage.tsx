import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronRight,
  GitBranch,
  Paperclip,
  Upload,
  Download,
  MessageSquare,
  Activity,
  CheckCircle2,
  Clock,
  User as UserIcon,
  AlertTriangle,
  Send,
  FileText,
  Calendar,
  Sparkles,
  ShieldAlert,
  Edit3,
  Eye,
  Check,
  Zap,
  Play,
  XCircle,
  RotateCcw,
  AlertCircle,
  X,
} from 'lucide-react';

import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { AttachmentRecord, Task, TaskPriority, TaskStatus, User } from '../types';
import { Trash2, FileCheck, Layers, File, Image as ImageIcon } from 'lucide-react';
import { TaskProgressBar } from '../components/TaskProgressBar';
import { TaskChecklistSection } from '../components/TaskChecklistSection';
import { DelegateTaskModal } from '../components/DelegateTaskModal';
import { useCapabilities } from '../hooks/useCapabilities';
import { getTaskActorRole, canEditPriority } from '../permissions';
import { getAllowedNextStatuses, validateTransition } from '../taskStateMachine';
import { showToast } from '../store/toastStore';
import { uploadTaskAttachments, fetchAttachmentObjectUrl, downloadAttachment } from '../api/attachments';
import { AttachmentPicker, SelectedFileChips } from '../components/AttachmentPicker';

interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  user_designation: string;
  content: string;
  attachments?: AttachmentRecord[];
  created_at: string;
}

interface ActivityLog {
  id: string;
  task_id: string;
  task_title: string;
  user_id: string;
  user_name: string;
  action: string;
  field_name?: string;
  new_value?: string;
  created_at: string;
}

interface AttachmentItem {
  fileKey: string;
  filename: string;
  size: number;
  downloadUrl: string;
  expiresAt: string;
}

const getStatusBadge = (status: string) => {
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

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const { is_leaf_node } = useCapabilities();

  const [activeCenterTab, setActiveCenterTab] = useState<'comments' | 'activity'>('comments');
  const [commentInput, setCommentInput] = useState('');
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [requestChangesFiles, setRequestChangesFiles] = useState<File[]>([]);
  const [isDelegateModalOpen, setIsDelegateModalOpen] = useState(false);

  // Edit description state
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editedDescription, setEditedDescription] = useState('');

  // Attachment upload state & preview state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentRecord | null>(null);

  // Modals state
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);
  const [changesFeedback, setChangesFeedback] = useState('');
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [showPreviousSubmissions, setShowPreviousSubmissions] = useState(false);

  // Fetch attachments from server
  const { data: attachments = [], refetch: refetchAttachments } = useQuery<AttachmentRecord[]>({
    queryKey: ['attachments', id],
    queryFn: async () => {
      const res: any = await apiClient.get(`/tasks/${id}/attachments`);
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
    enabled: !!id,
  });

  // Fetch single task details
  const {
    data: task,
    isLoading: isLoadingTask,
    error: taskError,
  } = useQuery<Task>({
    queryKey: ['task', id],
    queryFn: async () => {
      const res: any = await apiClient.get(`/tasks/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  // Fetch child subtasks for this task
  const { data: subtasks = [] } = useQuery<Task[]>({
    queryKey: ['subtasks', id],
    queryFn: async () => {
      const res: any = await apiClient.get(`/tasks?parent_task_id=${id}`);
      if (res.data?.tasks) return res.data.tasks;
      if (Array.isArray(res.data)) return res.data;
      return [];
    },
    enabled: !!id,
  });

  // Fetch lineage / delegation breadcrumb chain
  const { data: lineage } = useQuery<Array<{ id: string; title: string; depth: number; status: string }>>({
    queryKey: ['task-lineage', id],
    queryFn: async () => {
      const res: any = await apiClient.get(`/tasks/${id}/lineage`);
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
    enabled: !!id,
  });

  // Fetch comments
  const { data: comments = [] } = useQuery<TaskComment[]>({
    queryKey: ['task-comments', id],
    queryFn: async () => {
      const res: any = await apiClient.get(`/tasks/${id}/comments`);
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
    enabled: !!id,
  });

  // Fetch activity logs
  const { data: activityLogs = [] } = useQuery<ActivityLog[]>({
    queryKey: ['task-activity', id],
    queryFn: async () => {
      const res: any = await apiClient.get(`/tasks/${id}/activity`);
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
    enabled: !!id,
  });

  // Fetch assigned user details
  const { data: assigneeUser } = useQuery<User>({
    queryKey: ['user-detail', task?.assigned_to_id],
    queryFn: async () => {
      if (!task?.assigned_to_id) return null as any;
      const res: any = await apiClient.get(`/users/${task.assigned_to_id}`);
      return res.data?.user || res.data;
    },
    enabled: !!task?.assigned_to_id,
  });

  const [blockingTasksModal, setBlockingTasksModal] = useState<{
    isOpen: boolean;
    message: string;
    tasks: Array<{ id: string; title: string; status: string }>;
  }>({ isOpen: false, message: '', tasks: [] });

  // Modals for Assigner Review Actions
  const [requestChangesRemarks, setRequestChangesRemarks] = useState('');

  // Task Update Mutation (Status, Progress, Priority, Description)
  const updateTaskMutation = useMutation({
    mutationFn: async (payload: Partial<Task>) => {
      const res: any = await apiClient.patch(`/tasks/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-activity', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
    },
    onError: (err: any) => {
      const errCode = err?.response?.data?.error?.code;
      const errMsg = err?.response?.data?.error?.message || err?.message || 'Failed to update task.';

      if (
        err?.response?.status === 409 &&
        errCode === 'PARENT_HAS_INCOMPLETE_CHILDREN'
      ) {
        const details = err.response.data.error.details;
        setBlockingTasksModal({
          isOpen: true,
          message:
            errMsg || 'Parent task cannot be completed until subtasks are resolved.',
          tasks: details?.blocking_tasks || [],
        });
      } else {
        showToast({
          type: 'error',
          title: 'Action Not Allowed',
          message: errMsg,
        });
      }
    },
  });

  // Post Comment Mutation (uploads any attached documents first, then links them to the reply)
  const postCommentMutation = useMutation({
    mutationFn: async ({ content, files = [] }: { content: string; files?: File[] }) => {
      const uploaded = files.length > 0 && id ? await uploadTaskAttachments(id, files, 'REFERENCE') : [];
      const res: any = await apiClient.post(`/tasks/${id}/comments`, {
        content,
        attachment_ids: uploaded.map((a) => a.id),
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      if (variables.files && variables.files.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['attachments', id] });
        queryClient.invalidateQueries({ queryKey: ['task', id] });
      }
      queryClient.invalidateQueries({ queryKey: ['task-comments', id] });
      queryClient.invalidateQueries({ queryKey: ['task-activity', id] });
    },
  });

  // Handle Comment Submission
  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim() && commentFiles.length === 0) return;
    try {
      await postCommentMutation.mutateAsync({ content: commentInput.trim(), files: commentFiles });
      setCommentInput('');
      setCommentFiles([]);
    } catch {
      // Error toast is shown by the API client interceptor
    }
  };

  // Real Multipart File Upload Handler
  const handleFileUpload = async (
    filesToUpload: FileList | File[] | null,
    context: 'SUBMISSION' | 'REFERENCE' = 'REFERENCE'
  ) => {
    if (!filesToUpload || filesToUpload.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      Array.from(filesToUpload).forEach((f) => formData.append('files', f));
      formData.append('context', context);

      await apiClient.post(`/tasks/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            setUploadProgress(Math.round((e.loaded * 100) / e.total));
          }
        },
      });

      queryClient.invalidateQueries({ queryKey: ['attachments', id] });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      showToast({
        type: 'success',
        title: 'Attachment Uploaded',
        message: 'File(s) attached successfully.',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Failed to upload attachment.';
      setUploadError(msg);
      showToast({
        type: 'error',
        title: 'Upload Failed',
        message: msg,
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle Download
  const handleDownloadAttachment = async (att: AttachmentRecord) => {
    try {
      await downloadAttachment(att);
    } catch {
      // Error toast is shown by the API client interceptor
    }
  };

  // Load the previewed file through the authenticated client (img/iframe can't send the Bearer token)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => {
    if (!previewAttachment) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewError(false);
    fetchAttachmentObjectUrl(previewAttachment)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewAttachment]);

  // Handle Delete Attachment
  const handleDeleteAttachment = async (attId: string) => {
    try {
      await apiClient.delete(`/attachments/${attId}`);
      queryClient.invalidateQueries({ queryKey: ['attachments', id] });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      showToast({
        type: 'success',
        title: 'Attachment Deleted',
        message: 'File removed successfully.',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Failed to delete attachment';
      showToast({
        type: 'error',
        title: 'Delete Failed',
        message: msg,
      });
    }
  };

  // Handle Submit for Review button click (checks for zero submission files)
  const handleSubmitForReviewClick = () => {
    const nextRound = (task?.submission_count || 0) + 1;
    const currentSubmissionFiles = attachments.filter(
      (a) => a.context === 'SUBMISSION' && a.submission_round === nextRound
    );

    if (currentSubmissionFiles.length === 0) {
      setIsSubmitConfirmOpen(true);
    } else {
      updateTaskMutation.mutate({ status: 'SUBMITTED' });
    }
  };

  if (isLoadingTask) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold">Loading task details...</span>
        </div>
      </div>
    );
  }

  if (taskError || !task) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 bg-red-50 border border-red-200 rounded-3xl text-center space-y-4">
        <ShieldAlert size={36} className="text-red-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">Task Not Found or Access Denied</h2>
        <p className="text-xs text-slate-600">
          You may not have the required permissions in the organizational hierarchy to view this task.
        </p>
        <button
          onClick={() => navigate('/tasks')}
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
        >
          Back to Tasks
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(location.state?.from || '/tasks')}
            className="px-3.5 py-2 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-all shadow-2xs flex items-center gap-2 text-xs font-bold shrink-0"
            title="Back to previous list (preserving active filters)"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100 font-mono">
                {task.id}
              </span>
              <span className="text-[10px] font-bold text-slate-400">Depth L{task.depth || 0}</span>
              {task.is_overdue && (
                <span className="px-2 py-0.5 bg-red-600 text-white font-extrabold text-[10px] rounded-md uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                  <AlertTriangle size={10} /> Overdue
                </span>
              )}
              {task.status === 'COMPLETED' && (
                task.completed_on_time === true ? (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px] rounded-md flex items-center gap-1">
                    <CheckCircle2 size={10} className="text-emerald-600" /> Completed on time
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[10px] rounded-md flex items-center gap-1">
                    <AlertTriangle size={10} className="text-amber-600" /> Completed late
                  </span>
                )
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">{task.title}</h1>
          </div>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2">
          {!is_leaf_node && (
            <button
              onClick={() => setIsDelegateModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all"
            >
              <GitBranch size={16} />
              <span>Delegate Subtask</span>
            </button>
          )}
        </div>
      </div>

      {/* MONITORING BANNER: viewer is upstream in the delegation chain, not assigner/assignee */}
      {currentUser && currentUser.role !== 'ADMIN' && getTaskActorRole(currentUser, task) === 'OTHER' && (
        <div className="bg-sky-50 border border-sky-200 rounded-3xl p-4 flex items-center gap-3 text-sky-900 shadow-xs">
          <div className="p-2 bg-sky-100 rounded-2xl shrink-0 text-sky-700">
            <Eye size={20} />
          </div>
          <div>
            <p className="text-xs font-bold">You are monitoring this task</p>
            <p className="text-[11px] text-sky-700">
              It was delegated from a task you assigned or own. You can follow progress, view files and reply; status changes stay with{' '}
              {task.created_by_name || 'the assigner'} and {task.assigned_to_name || 'the assignee'}.
            </p>
          </div>
        </div>
      )}

      {/* OVERDUE RED BANNER */}
      {task.is_overdue && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-4 flex items-center justify-between gap-3 text-red-800 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-2xl shrink-0 text-red-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-red-900">
                Overdue since {task.overdue_since ? new Date(task.overdue_since).toLocaleString() : (task.due_date ? new Date(task.due_date).toLocaleString() : 'deadline')}.
              </p>
              <p className="text-[11px] text-red-700">
                Completion after the deadline will be recorded as late.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-red-600 text-white font-extrabold text-[10px] rounded-xl uppercase tracking-wider shrink-0 shadow-2xs">
            Overdue
          </span>
        </div>
      )}

      {/* 3-COLUMN MAIN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================== */}
        {/* LEFT COLUMN: Lineage, Description, Attachments */}
        {/* ========================================== */}
        <div className="lg:col-span-4 space-y-6">
          {/* Delegation Chain Breadcrumb */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <GitBranch size={16} className="text-indigo-600" />
                Delegation Hierarchy Chain
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              {lineage && lineage.length > 0 ? (
                <div className="space-y-2">
                  {lineage.map((item, index) => {
                    const isCurrent = item.id === task.id;
                    return (
                      <div key={item.id} className="flex items-center gap-2 text-xs">
                        {index > 0 && <ChevronRight size={14} className="text-slate-300 shrink-0" />}
                        <Link
                          to={`/tasks/${item.id}`}
                          state={{ from: location.state?.from || location.pathname + location.search }}
                          className={`flex-1 truncate font-semibold transition-colors ${
                            isCurrent
                              ? 'text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <span className="text-[10px] font-mono text-slate-400 mr-1.5">L{item.depth}</span>
                          {item.title}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Root task level (no parent chain).</p>
              )}
            </div>
          </div>

          {/* Subtask Tree Section */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <GitBranch size={16} className="text-indigo-600" />
                <span>Delegated Subtasks ({subtasks.length})</span>
              </span>
              {!is_leaf_node && (
                <button
                  onClick={() => setIsDelegateModalOpen(true)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  + Delegate
                </button>
              )}
            </div>

            {subtasks.length === 0 ? (
              <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-2xl border border-slate-100">
                No child subtasks delegated yet under this task.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {subtasks.map((st) => (
                  <Link
                    key={st.id}
                    to={`/tasks/${st.id}`}
                    state={{ from: location.state?.from || location.pathname + location.search }}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3 block text-inherit group"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400">#{st.id}</span>
                        <h5 className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                          {st.title}
                        </h5>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                        <span>Assignee: {st.assigned_to_name || st.assigned_to_id}</span>
                        <span>•</span>
                        <span className="font-bold text-slate-700">{st.progress_percent}%</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border shrink-0 ${getStatusBadge(st.status)}`}>
                      {st.status.replace('_', ' ')}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Description Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" />
                Task Description & Instructions
              </span>
              {currentUser && getTaskActorRole(currentUser, task) !== 'OTHER' && (
              <button
                onClick={() => {
                  if (isEditingDesc) {
                    updateTaskMutation.mutate({ description: editedDescription });
                    setIsEditingDesc(false);
                  } else {
                    setEditedDescription(task.description || '');
                    setIsEditingDesc(true);
                  }
                }}
                className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
              >
                {isEditingDesc ? <Check size={14} /> : <Edit3 size={14} />}
                <span>{isEditingDesc ? 'Save' : 'Edit'}</span>
              </button>
              )}
            </div>

            {isEditingDesc ? (
              <textarea
                rows={5}
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-mono"
              />
            ) : (
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-700 leading-relaxed min-h-[100px]">
                {task.description ? (
                  <div
                    className="prose prose-xs max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: task.description }}
                  />
                ) : (
                  <p className="text-slate-400 italic">No description provided for this task.</p>
                )}
              </div>
            )}
          </div>

          {/* Checklist Section (Tier 1 Preferred Basis) */}
          <TaskChecklistSection
            taskId={task.id}
            checklist={task.checklist}
            onChecklistUpdated={() => queryClient.invalidateQueries({ queryKey: ['task', id] })}
          />

          {/* Attachments Upload & Storage */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Paperclip size={16} className="text-indigo-600" />
                Attachments & Deliverables
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">{attachments.length} files</span>
            </div>

            {/* Upload Zone */}
            <div className="space-y-2">
              <div className="relative border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-4 text-center transition-all bg-slate-50/50 hover:bg-indigo-50/20 group">
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const isAssignee = task && currentUser?.id === task.assigned_to_id;
                    const context = isAssignee && task?.status === 'IN_PROGRESS' ? 'SUBMISSION' : 'REFERENCE';
                    handleFileUpload(e.target.files, context);
                  }}
                  disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                  <Upload size={20} className="text-indigo-600 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-slate-700">
                    {isUploading ? `Uploading... (${uploadProgress}%)` : 'Click or Drag files to attach'}
                  </span>
                  <span className="text-[10px] text-slate-400">PDF, PNG, JPG, ZIP, DOCX (Max 10MB)</span>
                </div>
              </div>

              {/* Upload Context Indicator */}
              {task && currentUser?.id === task.assigned_to_id && task.status === 'IN_PROGRESS' && (
                <div className="flex items-center justify-between px-2 py-1 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[10px] text-indigo-700 font-medium">
                  <span>Uploading as: <strong className="font-bold">Submission Deliverable (Round {(task.submission_count || 0) + 1})</strong></span>
                  <span className="text-slate-400">Will be bundled for review</span>
                </div>
              )}
            </div>

            {uploadError && (
              <p className="text-[11px] font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">
                {uploadError}
              </p>
            )}

            {/* Attachments List */}
            {attachments.length > 0 && (
              <div className="space-y-2 pt-1">
                {attachments.map((att) => {
                  const isImage = att.mime_type?.startsWith('image/');
                  const isPdf = att.mime_type?.includes('pdf');
                  const canDelete = (currentUser?.id === att.uploaded_by_id || currentUser?.role === 'ADMIN') && task?.status !== 'COMPLETED';

                  return (
                    <div
                      key={att.id}
                      className="p-3 bg-slate-50/80 border border-slate-200/90 rounded-2xl flex items-center justify-between gap-2.5 hover:bg-slate-100/60 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                          {isImage ? (
                            <ImageIcon size={16} className="text-indigo-600" />
                          ) : isPdf ? (
                            <FileText size={16} className="text-rose-600" />
                          ) : (
                            <File size={16} className="text-slate-500" />
                          )}
                        </div>
                        <div className="truncate space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-slate-800 truncate">{att.file_name}</p>
                            {att.context === 'SUBMISSION' ? (
                              <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[9px] font-bold rounded border border-purple-200">
                                Sub R{att.submission_round}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 bg-slate-200 text-slate-600 text-[9px] font-semibold rounded">
                                Ref
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {(att.size_bytes / 1024).toFixed(1)} KB • {att.uploaded_by_name}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {(isImage || isPdf) && (
                          <button
                            onClick={() => setPreviewAttachment(att)}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors"
                            title="Preview file"
                          >
                            <Eye size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownloadAttachment(att)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Download file"
                        >
                          <Download size={14} />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete attachment"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ========================================== */}
        {/* CENTER COLUMN: Comments & Activity Tabs    */}
        {/* ========================================== */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-[520px]">
          {/* ASSIGNER SUBMISSION REVIEW PANEL */}
          {task && getTaskActorRole(currentUser, task) === 'ASSIGNER' && task.status === 'SUBMITTED' && (
            <div className="bg-amber-50/60 border-b border-amber-200/80 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Submission Review — Round {task.submission_count || 1}
                    </h3>
                    {task.last_submitted_at && (
                      <p className="text-[11px] text-slate-500">
                        Submitted {new Date(task.last_submitted_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-full border border-amber-200">
                  Awaiting Review
                </span>
              </div>

              {/* Current Round Deliverable Files */}
              {(() => {
                const currentRound = task.submission_count || 1;
                const currentSubmissionFiles = attachments.filter(
                  (a) => a.context === 'SUBMISSION' && a.submission_round === currentRound
                );

                if (currentSubmissionFiles.length === 0) {
                  return (
                    <div className="p-3 bg-amber-100/50 border border-amber-200 rounded-xl text-center">
                      <AlertCircle size={20} className="mx-auto text-amber-600 mb-1" />
                      <p className="text-xs font-bold text-amber-900">No files were attached to this submission</p>
                      <p className="text-[10px] text-amber-700">The assignee submitted this round without uploading files.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Paperclip size={14} className="text-indigo-600" />
                      Submitted Deliverables ({currentSubmissionFiles.length})
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {currentSubmissionFiles.map((att) => (
                        <div
                          key={att.id}
                          className="p-3 bg-white border border-amber-200/90 rounded-2xl flex items-center justify-between gap-3 shadow-2xs"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                              {att.mime_type.startsWith('image/') ? (
                                <ImageIcon size={18} className="text-indigo-600" />
                              ) : att.mime_type.includes('pdf') ? (
                                <FileText size={18} className="text-rose-600" />
                              ) : (
                                <File size={18} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="text-xs font-bold text-slate-800 truncate">{att.file_name}</p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                {(att.size_bytes / 1024).toFixed(1)} KB • Uploaded by {att.uploaded_by_name}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => setPreviewAttachment(att)}
                              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors text-xs font-semibold flex items-center gap-1"
                              title="Preview file"
                            >
                              <Eye size={14} />
                              <span className="hidden sm:inline">Preview</span>
                            </button>
                            <button
                              onClick={() => handleDownloadAttachment(att)}
                              className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-colors text-xs font-semibold flex items-center gap-1"
                              title="Download file"
                            >
                              <Download size={14} />
                              <span className="hidden sm:inline">Download</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Previous Submissions Accordion */}
              {(() => {
                const currentRound = task.submission_count || 1;
                const earlierFiles = attachments.filter(
                  (a) => a.context === 'SUBMISSION' && a.submission_round < currentRound
                );

                if (earlierFiles.length === 0) return null;

                return (
                  <div className="pt-2 border-t border-amber-200/60">
                    <button
                      onClick={() => setShowPreviousSubmissions(!showPreviousSubmissions)}
                      className="text-xs font-bold text-slate-700 hover:text-indigo-600 flex items-center justify-between w-full py-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <Layers size={14} className="text-purple-600" />
                        Previous Submission History ({earlierFiles.length} file{earlierFiles.length === 1 ? '' : 's'})
                      </span>
                      <span className="text-[10px] text-indigo-600 font-semibold">
                        {showPreviousSubmissions ? 'Hide' : 'Show'}
                      </span>
                    </button>

                    {showPreviousSubmissions && (
                      <div className="mt-2 space-y-2 pl-2 border-l-2 border-amber-200">
                        {earlierFiles.map((att) => (
                          <div key={att.id} className="p-2.5 bg-white/80 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                            <div className="truncate">
                              <p className="font-semibold text-slate-800 truncate">{att.file_name}</p>
                              <p className="text-[10px] text-slate-400">Round {att.submission_round} • {(att.size_bytes / 1024).toFixed(1)} KB</p>
                            </div>
                            <button
                              onClick={() => handleDownloadAttachment(att)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                            >
                              <Download size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Quick Review Action Controls */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/80">
                <button
                  onClick={() => updateTaskMutation.mutate({ status: 'COMPLETED' })}
                  disabled={updateTaskMutation.isPending}
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all"
                >
                  <CheckCircle2 size={14} />
                  <span>Approve & Complete</span>
                </button>
                <button
                  onClick={() => setIsRequestChangesOpen(true)}
                  disabled={updateTaskMutation.isPending}
                  className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all"
                >
                  <RotateCcw size={14} />
                  <span>Request Changes</span>
                </button>
                <button
                  onClick={() => setIsCancelConfirmOpen(true)}
                  disabled={updateTaskMutation.isPending}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <XCircle size={14} />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab Header */}
          <div className="flex items-center border-b border-slate-200 bg-slate-50/70 p-2 gap-1">
            <button
              onClick={() => setActiveCenterTab('comments')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all ${
                activeCenterTab === 'comments'
                  ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <MessageSquare size={15} />
              <span>Comments ({comments.length})</span>
            </button>
            <button
              onClick={() => setActiveCenterTab('activity')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all ${
                activeCenterTab === 'activity'
                  ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Activity size={15} />
              <span>Activity Log ({activityLogs.length})</span>
            </button>
          </div>

          {/* Tab Content Body */}
          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
            {activeCenterTab === 'comments' ? (
              <div className="flex-1 flex flex-col justify-between space-y-4">
                {/* Comments Stream */}
                <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                  {comments.length > 0 ? (
                    comments.map((cmt) => (
                      <div key={cmt.id} className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{cmt.user_name}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-slate-200/70 text-slate-600 rounded-md font-semibold">
                              {cmt.user_designation}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {new Date(cmt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {cmt.content && <p className="text-xs text-slate-700 leading-relaxed">{cmt.content}</p>}
                        {cmt.attachments && cmt.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {cmt.attachments.map((att) => (
                              <button
                                key={att.id}
                                type="button"
                                onClick={() =>
                                  att.mime_type?.startsWith('image/') || att.mime_type?.includes('pdf')
                                    ? setPreviewAttachment(att)
                                    : handleDownloadAttachment(att)
                                }
                                className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg text-[10px] font-semibold text-slate-700 max-w-[220px]"
                                title={`Open ${att.file_name}`}
                              >
                                <Paperclip size={11} className="text-indigo-600 shrink-0" />
                                <span className="truncate">{att.file_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 space-y-2">
                      <MessageSquare size={28} className="text-slate-300 mx-auto" />
                      <p className="text-xs text-slate-400 font-medium">No comments posted yet.</p>
                    </div>
                  )}
                </div>

                {/* Post Comment Input */}
                <form onSubmit={handleCommentSubmit} className="pt-3 border-t border-slate-100 space-y-2">
                  <SelectedFileChips
                    files={commentFiles}
                    onRemove={(idx) => setCommentFiles((prev) => prev.filter((_, i) => i !== idx))}
                  />
                  <div className="flex items-center gap-2">
                    <AttachmentPicker
                      compact
                      files={commentFiles}
                      onChange={setCommentFiles}
                      disabled={postCommentMutation.isPending}
                    />
                    <input
                      type="text"
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Reply, give an update, or attach documents..."
                      className="flex-1 min-w-0 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={postCommentMutation.isPending || (!commentInput.trim() && commentFiles.length === 0)}
                      className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs disabled:opacity-40 transition-all shrink-0"
                      title="Send reply"
                    >
                      {postCommentMutation.isPending ? (
                        <span className="block w-[15px] h-[15px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send size={15} />
                      )}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Activity Log Stream */
              <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                {activityLogs.length > 0 ? (
                  activityLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-start gap-3">
                      <span className="p-2 bg-indigo-100 text-indigo-600 rounded-xl mt-0.5">
                        <Activity size={14} />
                      </span>
                      <div className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{log.user_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-600">
                          Action: <span className="font-bold text-indigo-700">{log.action}</span>
                          {log.new_value && (
                            <span className="text-slate-500 ml-1">({log.new_value})</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 space-y-2">
                    <Activity size={28} className="text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-400 font-medium">No activity recorded for this task yet.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* RIGHT COLUMN: Controls, Assignee & Progress */}
        {/* ========================================== */}
        <div className="lg:col-span-3 space-y-6">
          {/* Controls Box */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-slate-400">
              Task Settings & Workflow
            </h3>

            {/* INTENT-NAMED WORKFLOW ACTION BUTTONS */}
            {(() => {
              const actorRole = currentUser ? getTaskActorRole(currentUser, task) : 'OTHER';
              if (actorRole === 'OTHER') return null;

              const allowedNext = getAllowedNextStatuses(task.status, actorRole);

              if (actorRole === 'ASSIGNEE') {
                return (
                  <div className="space-y-2 pb-2 border-b border-slate-100">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                      Assignee Actions
                    </span>
                    {task.status === 'TODO' && allowedNext.includes('IN_PROGRESS') && (
                      <button
                        onClick={() => updateTaskMutation.mutate({ status: 'IN_PROGRESS' })}
                        disabled={updateTaskMutation.isPending}
                        className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs"
                      >
                        <Play size={15} />
                        <span>Start Work</span>
                      </button>
                    )}
                    {task.status === 'IN_PROGRESS' && allowedNext.includes('SUBMITTED') && (
                      <button
                        onClick={handleSubmitForReviewClick}
                        disabled={updateTaskMutation.isPending}
                        className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs"
                      >
                        <CheckCircle2 size={15} />
                        <span>Submit for Review</span>
                      </button>
                    )}
                    {task.status === 'SUBMITTED' && allowedNext.includes('IN_PROGRESS') && (
                      <button
                        onClick={() => updateTaskMutation.mutate({ status: 'IN_PROGRESS' })}
                        disabled={updateTaskMutation.isPending}
                        className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs"
                      >
                        <RotateCcw size={15} />
                        <span>Withdraw</span>
                      </button>
                    )}
                  </div>
                );
              }

              if (actorRole === 'ASSIGNER') {
                return (
                  <div className="space-y-2 pb-2 border-b border-slate-100">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                      Assigner Actions
                    </span>
                    {task.status === 'SUBMITTED' && (
                      <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-2xl space-y-2.5">
                        <div className="flex items-center gap-1.5 text-purple-900 font-bold text-xs">
                          <Sparkles size={14} className="text-purple-600" />
                          <span>Review Submitted Work</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => updateTaskMutation.mutate({ status: 'COMPLETED' })}
                            disabled={updateTaskMutation.isPending}
                            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
                          >
                            <CheckCircle2 size={14} />
                            <span>Approve & Complete</span>
                          </button>
                          <button
                            onClick={() => setIsRequestChangesOpen(true)}
                            disabled={updateTaskMutation.isPending}
                            className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
                          >
                            <RotateCcw size={14} />
                            <span>Request Changes</span>
                          </button>
                          <button
                            onClick={() => setIsCancelConfirmOpen(true)}
                            disabled={updateTaskMutation.isPending}
                            className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
                          >
                            <XCircle size={14} />
                            <span>Cancel Task</span>
                          </button>
                        </div>
                      </div>
                    )}
                    {(task.status === 'TODO' || task.status === 'IN_PROGRESS') && allowedNext.includes('CANCELLED') && (
                      <button
                        onClick={() => setIsCancelConfirmOpen(true)}
                        disabled={updateTaskMutation.isPending}
                        className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                      >
                        <XCircle size={14} />
                        <span>Cancel Task</span>
                      </button>
                    )}
                  </div>
                );
              }

              return null;
            })()}

            {/* Status Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Status</label>
              {(() => {
                const actorRole = currentUser ? getTaskActorRole(currentUser, task) : 'OTHER';

                if (task.status === 'OVERDUE') {
                  return (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between">
                      <span className="text-xs font-bold text-red-700 flex items-center gap-1.5 uppercase">
                        <AlertTriangle size={14} /> OVERDUE
                      </span>
                      <span className="text-[10px] font-bold text-red-600 bg-red-100/80 px-2 py-0.5 rounded-md">
                        Auto-set by system
                      </span>
                    </div>
                  );
                }

                if (actorRole === 'OTHER') {
                  return (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                      <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${getStatusBadge(task.status)}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">Read Only</span>
                    </div>
                  );
                }

                const allowedNext = getAllowedNextStatuses(task.status, actorRole as 'ASSIGNEE' | 'ASSIGNER');
                const dropdownOptions = Array.from(
                  new Set([task.status, ...allowedNext.filter((s) => s !== 'OVERDUE')])
                );

                return (
                  <select
                    value={task.status}
                    onChange={(e) => updateTaskMutation.mutate({ status: e.target.value as TaskStatus })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  >
                    {dropdownOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === 'SUBMITTED' ? 'SUBMITTED (Awaiting Approval)' : opt.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                );
              })()}
            </div>

            {/* Priority Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Priority</label>
              {(() => {
                const canChangePriority = currentUser ? canEditPriority(currentUser, task) : false;

                if (!canChangePriority) {
                  return (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between" title="Only the task assigner can change priority.">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getPriorityBadge(task.priority)}`}>
                        {task.priority}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">Assigner editable only</span>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as TaskPriority[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateTaskMutation.mutate({ priority: p })}
                        className={`py-1.5 text-[11px] font-bold rounded-xl transition-all border ${
                          task.priority === p
                            ? p === 'CRITICAL'
                              ? 'bg-red-600 text-white border-red-600 shadow-xs'
                              : p === 'HIGH'
                              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                              : p === 'MEDIUM'
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-slate-700 text-white border-slate-700 shadow-xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Three-Tier Progress Engine Component */}
            <TaskProgressBar
              progress={task.progress_percent || 0}
              status={task.status}
              progressInfo={task.progress_info}
              onSliderChange={(val) => updateTaskMutation.mutate({ progress_percent: val })}
              isUpdating={updateTaskMutation.isPending}
            />
          </div>

          {/* Assignee Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
              Assigned Ownership
            </span>

            {assigneeUser && assigneeUser.name ? (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    {(assigneeUser.name || 'U').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-900 truncate">{assigneeUser.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{assigneeUser.designation}</p>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200/60 flex justify-between">
                  <span>Dept: {assigneeUser.department}</span>
                  <span>Level: L{assigneeUser.hierarchy_level}</span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-700">Assignee ID: {task?.assigned_to_id || 'Unassigned'}</p>
              </div>
            )}

            <p className="text-[10px] text-slate-500">
              Assigned by <span className="font-bold text-slate-700">{task.created_by_name || task.created_by_id}</span>
            </p>

            {/* Downstream delegation: who is actually working on this */}
            {task.delegated_to && task.delegated_to.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                  Currently Being Worked On By
                </span>
                <div className="space-y-1.5">
                  {task.delegated_to.map((d) => (
                    <Link
                      key={d.task_id}
                      to={`/tasks/${d.task_id}`}
                      state={{ from: location.state?.from || location.pathname + location.search }}
                      className="block p-2.5 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 rounded-xl transition-colors"
                      style={{ marginLeft: `${Math.max(0, d.depth - (task.depth || 0) - 1) * 10}px` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">{d.user_name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 ${getStatusBadge(d.status)}`}>
                          {String(d.status).replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">
                        {d.department ? `${d.department} • ` : ''}delegated by {d.delegated_by_name}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Delegate Subtask Card */}
          <div className="p-5 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl text-white shadow-md shadow-indigo-600/20 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-amber-300" />
              <h4 className="text-xs font-bold">Hierarchy Delegation</h4>
            </div>
            <p className="text-[11px] text-indigo-100 leading-relaxed">
              Break this task down into subtasks and delegate to direct/indirect subordinates in your chain.
            </p>
            <button
              onClick={() => setIsDelegateModalOpen(true)}
              className="w-full py-2.5 bg-white hover:bg-slate-100 text-indigo-900 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2"
            >
              <GitBranch size={16} />
              <span>Delegate to Subordinate</span>
            </button>
          </div>
        </div>
      </div>

      {/* Blocking Subtasks 409 Modal */}
      {blockingTasksModal.isOpen && (
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
              {blockingTasksModal.message}
            </p>

            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Blocking Subtasks ({blockingTasksModal.tasks.length}):
              </span>
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {blockingTasksModal.tasks.map((bt) => (
                  <Link
                    key={bt.id}
                    to={`/tasks/${bt.id}`}
                    state={{ from: location.state?.from || location.pathname + location.search }}
                    onClick={() =>
                      setBlockingTasksModal({ isOpen: false, message: '', tasks: [] })
                    }
                    className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs cursor-pointer transition-colors block text-inherit group"
                  >
                    <span className="font-semibold text-slate-800 group-hover:text-indigo-600 truncate pr-2">{bt.title}</span>
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
                onClick={() =>
                  setBlockingTasksModal({ isOpen: false, message: '', tasks: [] })
                }
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-2xs transition-all"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Changes Modal */}
      {isRequestChangesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-amber-700">
                <RotateCcw size={18} />
                <h3 className="text-sm font-bold text-slate-900">Request Changes from Assignee</h3>
              </div>
              <button
                onClick={() => setIsRequestChangesOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Provide feedback or instructions. The task status will revert to <strong>IN_PROGRESS</strong> and your remarks will be posted as a task comment.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!requestChangesRemarks.trim()) return;
                try {
                  await updateTaskMutation.mutateAsync({ status: 'IN_PROGRESS' });
                  await postCommentMutation.mutateAsync({
                    content: `[Request Changes]: ${requestChangesRemarks.trim()}`,
                    files: requestChangesFiles,
                  });
                  setIsRequestChangesOpen(false);
                  setRequestChangesRemarks('');
                  setRequestChangesFiles([]);
                  showToast({
                    type: 'info',
                    title: 'Changes Requested',
                    message: 'Task returned to IN_PROGRESS with feedback comment.',
                  });
                } catch (err) {
                  // Handled by mutation onError
                }
              }}
              className="space-y-4"
            >
              <textarea
                required
                rows={4}
                value={requestChangesRemarks}
                onChange={(e) => setRequestChangesRemarks(e.target.value)}
                placeholder="Enter feedback or changes required..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-sans"
              />

              <AttachmentPicker
                files={requestChangesFiles}
                onChange={setRequestChangesFiles}
                label="Attach marked-up or reference documents (optional)"
                disabled={updateTaskMutation.isPending || postCommentMutation.isPending}
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRequestChangesOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!requestChangesRemarks.trim() || updateTaskMutation.isPending || postCommentMutation.isPending}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs disabled:opacity-50"
                >
                  Submit Feedback & Reopen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Task Confirm Dialog */}
      {isCancelConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 border border-slate-200 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-2xl border border-rose-100 shrink-0">
                <XCircle size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cancel Task?</h3>
                <p className="text-xs text-slate-500">Confirm task cancellation</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100">
              Are you sure you want to cancel this task? The status will be set to <strong>CANCELLED</strong>.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelConfirmOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateTaskMutation.mutateAsync({ status: 'CANCELLED' });
                    setIsCancelConfirmOpen(false);
                    showToast({
                      type: 'info',
                      title: 'Task Cancelled',
                      message: 'Task status updated to CANCELLED.',
                    });
                  } catch (err) {
                    // Handled by mutation onError
                  }
                }}
                disabled={updateTaskMutation.isPending}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Without Files Confirm Modal */}
      {isSubmitConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 border border-slate-200 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-2.5 bg-amber-50 rounded-2xl border border-amber-100 shrink-0">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Submit Without Deliverables?</h3>
                <p className="text-xs text-slate-500">No submission files attached for this round</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100">
              You haven't uploaded any <strong>Submission Deliverables</strong> for Round {(task?.submission_count || 0) + 1}. Are you sure you want to submit this task for review without attaching files?
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSubmitConfirmOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Go Back & Attach
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSubmitConfirmOpen(false);
                  updateTaskMutation.mutate({ status: 'SUBMITTED' });
                }}
                disabled={updateTaskMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-5 space-y-4 border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={18} className="text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">{previewAttachment.file_name}</h3>
                  <p className="text-[10px] text-slate-400">
                    {(previewAttachment.size_bytes / 1024).toFixed(1)} KB • Uploaded by {previewAttachment.uploaded_by_name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDownloadAttachment(previewAttachment)}
                  className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold flex items-center gap-1"
                >
                  <Download size={14} />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => setPreviewAttachment(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-auto min-h-[300px] flex items-center justify-center bg-slate-900/5 rounded-2xl p-2">
              {(previewAttachment.mime_type.startsWith('image/') || previewAttachment.mime_type.includes('pdf')) &&
              !previewUrl ? (
                <div className="text-center p-8 space-y-2">
                  {previewError ? (
                    <>
                      <AlertCircle size={32} className="text-red-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-700">Could not load this file for preview.</p>
                      <p className="text-[11px] text-slate-500">It may have been removed from storage. Try downloading it instead.</p>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-xs font-semibold text-slate-500">Loading preview...</p>
                    </>
                  )}
                </div>
              ) : previewAttachment.mime_type.startsWith('image/') ? (
                <img
                  src={previewUrl!}
                  alt={previewAttachment.file_name}
                  className="max-h-[60vh] object-contain rounded-xl shadow-md"
                />
              ) : previewAttachment.mime_type.includes('pdf') ? (
                <iframe
                  src={previewUrl!}
                  title={previewAttachment.file_name}
                  className="w-full h-[60vh] rounded-xl border border-slate-200"
                />
              ) : (
                <div className="text-center p-8 space-y-2">
                  <File size={40} className="text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">Preview not available for this file type</p>
                  <button
                    onClick={() => handleDownloadAttachment(previewAttachment)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-2"
                  >
                    <Download size={14} />
                    <span>Download File</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delegate Task Modal */}
      {task && (
        <DelegateTaskModal
          isOpen={isDelegateModalOpen}
          onClose={() => setIsDelegateModalOpen(false)}
          parentTask={task}
        />
      )}
    </div>
  );
}

