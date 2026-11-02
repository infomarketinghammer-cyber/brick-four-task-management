import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  X,
  Key,
  AlertTriangle,
  CheckCircle2,
  Copy,
  UserCheck,
  RefreshCw,
  GitBranch,
  Edit3,
  Lock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

import { apiClient } from '../api/client';
import { showToast } from '../store/toastStore';
import { Role, User } from '../types';

const editUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email address is required'),
  phone: z.string().optional().nullable(),
  designation: z.string().min(1, 'Designation is required'),
  department: z.string().min(1, 'Department is required'),
  role: z.enum(['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE']),
  manager_id: z.string().optional().nullable(),
  is_active: z.boolean(),
});

export type EditUserFormData = z.infer<typeof editUserSchema>;

interface EditUserModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
}

function getDescendantIds(userId: string, users: User[]): string[] {
  const descendants: string[] = [];
  const userMap = new Map<string, User[]>();

  for (const u of users) {
    if (u.manager_id) {
      const list = userMap.get(u.manager_id) || [];
      list.push(u);
      userMap.set(u.manager_id, list);
    }
  }

  function traverse(id: string) {
    const reports = userMap.get(id) || [];
    for (const r of reports) {
      descendants.push(r.id);
      traverse(r.id);
    }
  }

  traverse(userId);
  return descendants;
}

export function EditUserModal({ user, isOpen, onClose }: EditUserModalProps) {
  const [step, setStep] = useState<'edit' | 'reassign'>('edit');
  const [subordinateCount, setSubordinateCount] = useState<number>(0);
  const [reassignManagerId, setReassignManagerId] = useState<string>('');
  const [pendingFormData, setPendingFormData] = useState<EditUserFormData | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tempPassResult, setTempPassResult] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Fetch all users to filter manager options
  const { data: usersData } = useQuery<{ users: User[] }>({
    queryKey: ['users'],
    queryFn: async () => {
      const res: any = await apiClient.get('/users?limit=100');
      if (res.data?.users) return { users: res.data.users };
      if (Array.isArray(res.data)) return { users: res.data };
      if (Array.isArray(res)) return { users: res };
      return { users: [] };
    },
    enabled: isOpen && !!user,
  });

  const allUsers = usersData?.users || [];

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
  });

  const selectedRole = watch('role');

  // Reset form when modal opens with user data
  useEffect(() => {
    if (user && isOpen) {
      setStep('edit');
      setFormError(null);
      setTempPassResult(null);
      setPendingFormData(null);
      setReassignManagerId('');
      reset({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        designation: user.designation || '',
        department: user.department || 'Engineering',
        role: user.role || 'EXECUTIVE',
        manager_id: user.manager_id || '',
        is_active: user.is_active ?? true,
      });
    }
  }, [user, isOpen, reset]);

  if (!isOpen || !user) return null;

  // Calculate descendant IDs to exclude user self and descendants from manager dropdown
  const descendantIds = getDescendantIds(user.id, allUsers);
  const eligibleManagers = allUsers.filter(
    (u) => u.id !== user.id && !descendantIds.includes(u.id) && u.is_active
  );

  // Edit user submission logic
  const handleSave = async (data: EditUserFormData, reassignTargetId?: string) => {
    setFormError(null);
    try {
      const payload: any = { ...data };
      if (data.manager_id === '') payload.manager_id = null;
      if (reassignTargetId) payload.reassign_subordinates_to_id = reassignTargetId;

      const res: any = await apiClient.patch(`/users/${user.id}`, payload);

      showToast({
        type: 'success',
        title: 'User Updated',
        message: `Account details for ${res.data?.name || data.name} updated successfully.`,
      });

      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org-chart'] });
      onClose();
    } catch (err: any) {
      const responseData = err?.response?.data;
      const apiErr = responseData?.error;

      // Handle HAS_SUBORDINATES 409
      if (
        apiErr?.code === 'HAS_SUBORDINATES' ||
        apiErr?.details?.code === 'HAS_SUBORDINATES' ||
        err?.response?.status === 409
      ) {
        const count = apiErr?.details?.subordinate_count || 1;
        setSubordinateCount(count);
        setPendingFormData(data);
        setStep('reassign');
        return;
      }

      // Handle field level errors
      if (Array.isArray(apiErr?.details)) {
        apiErr.details.forEach((item: any) => {
          if (item.field && item.message) {
            setError(item.field as any, { type: 'manual', message: item.message });
          }
        });
      }

      setFormError(apiErr?.message || err.message || 'Failed to update user details.');
    }
  };

  const handleReassignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingFormData || !reassignManagerId) return;
    handleSave(pendingFormData, reassignManagerId);
  };

  // Reset password handler
  const handleResetPassword = async () => {
    try {
      const res: any = await apiClient.post(`/users/${user.id}/reset-password`);
      const tempPass = res.data?.temporaryPassword;
      setTempPassResult(tempPass || 'Generated');
      showToast({
        type: 'success',
        title: 'Password Reset',
        message: `Temporary password generated for ${user.name}.`,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Reset Failed',
        message: err?.response?.data?.error?.message || 'Failed to reset password.',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 animate-in zoom-in-95 my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
              <Edit3 size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {step === 'edit' ? `Edit User: ${user.name}` : 'Reassign Subordinates'}
              </h3>
              <p className="text-[11px] text-slate-500">ID: {user.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Global Error Banner */}
        {formError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-800 text-xs font-medium">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Temp Password Success Banner */}
        {tempPassResult && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-950">Password Reset Successful</p>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Temporary Password:{' '}
                  <code className="bg-emerald-100 text-emerald-950 font-mono px-2 py-0.5 rounded font-bold">
                    {tempPassResult}
                  </code>
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(tempPassResult);
                showToast({ type: 'info', message: 'Temporary password copied' });
              }}
              className="p-1.5 bg-emerald-200 hover:bg-emerald-300 text-emerald-900 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
            >
              <Copy size={13} />
              <span>Copy</span>
            </button>
          </div>
        )}

        {/* STEP 1: EDIT FORM */}
        {step === 'edit' && (
          <form onSubmit={handleSubmit((d) => handleSave(d))} className="space-y-4 mt-4">
            {/* Name & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  {...register('name')}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                />
                {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  {...register('email')}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                />
                {errors.email && <p className="text-xs text-red-500 mt-0.5">{errors.email.message}</p>}
              </div>
            </div>

            {/* Designation & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Designation / Title</label>
                <input
                  type="text"
                  {...register('designation')}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                />
                {errors.designation && (
                  <p className="text-xs text-red-500 mt-0.5">{errors.designation.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  {...register('phone')}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Department & Role */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <select
                  {...register('department')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none"
                >
                  <option value="Executive">Executive</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Product">Product</option>
                  <option value="Operations">Operations</option>
                  <option value="HR">HR</option>
                </select>
                {errors.department && (
                  <p className="text-xs text-red-500 mt-0.5">{errors.department.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">System Role</label>
                <select
                  {...register('role')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none"
                >
                  <option value="ADMIN">ADMIN (Level 0)</option>
                  <option value="DEPT_HEAD">DEPT_HEAD (Level 1)</option>
                  <option value="TEAM_LEAD">TEAM_LEAD (Level 2)</option>
                  <option value="EXECUTIVE">EXECUTIVE (Level 3)</option>
                </select>
              </div>
            </div>

            {/* Reporting Line Manager Dropdown */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reporting Line Manager
              </label>
              <select
                {...register('manager_id')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none"
              >
                <option value="">-- No Manager (Top Level) --</option>
                {eligibleManagers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.designation} - {m.role})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Excludes current user and all direct/indirect descendants to prevent cycle loops.
              </p>
            </div>

            {/* Account Status Toggle */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">Account Active Status</p>
                <p className="text-[11px] text-slate-500">
                  Deactivating revokes access permissions and soft-deletes the user.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  {...register('is_active')}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Reset Password Action */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleResetPassword}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <Key size={14} className="text-amber-600" />
                <span>Reset Password</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        )}

        {/* STEP 2: REASSIGN SUBORDINATES STEP */}
        {step === 'reassign' && (
          <form onSubmit={handleReassignSubmit} className="space-y-4 mt-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950 text-sm">
                <ShieldAlert size={18} className="text-amber-600 shrink-0" />
                <span>Subordinates Reassignment Required</span>
              </div>
              <p>
                <span className="font-bold">{user.name}</span> currently manages{' '}
                <span className="font-bold underline">{subordinateCount}</span> active direct report(s).
                Before deactivating this account, you must reassign their reports to another active manager.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Reassign {subordinateCount} Report(s) To:
              </label>
              <select
                value={reassignManagerId}
                onChange={(e) => setReassignManagerId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                required
              >
                <option value="">-- Choose New Manager --</option>
                {eligibleManagers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.designation} - {m.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep('edit')}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!reassignManagerId}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <span>Reassign & Deactivate</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
