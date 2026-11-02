import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Copy,
  AlertTriangle,
  Building2,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';

import { apiClient } from '../api/client';
import { showToast } from '../store/toastStore';
import { Role, User } from '../types';
import { EditUserModal } from '../components/EditUserModal';

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE']),
  manager_id: z.string().nullable().optional(),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export function TeamManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<User | null>(null);
  const [createdInviteInfo, setCreatedInviteInfo] = useState<{ tempPass: string; name: string } | null>(null);

  const queryClient = useQueryClient();

  // Fetch Users
  const { data: usersData, isLoading } = useQuery<{ users: User[]; total: number }>({
    queryKey: ['users', searchTerm, selectedRole, selectedDept],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedRole !== 'ALL') params.append('role', selectedRole);
      if (selectedDept !== 'ALL') params.append('department', selectedDept);

      const res: any = await apiClient.get(`/users?${params.toString()}`);
      return res.data || { users: [], total: 0 };
    },
  });

  // Add User Form
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: 'EXECUTIVE',
      department: 'Engineering',
    },
  });

  const selectedRoleWatch = watch('role');

  // Create User Mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      const res: any = await apiClient.post('/users', data);
      return res.data;
    },
    onSuccess: (data) => {
      showToast({
        type: 'success',
        title: 'User Created',
        message: `Account for ${data.user.name} created successfully.`,
      });
      setCreatedInviteInfo({
        tempPass: data.invite.temporaryPassword,
        name: data.user.name,
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org-chart'] });
      reset();
      setAddModalOpen(false);
    },
  });

  // Edit User Mutation
  const editUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<User> }) => {
      const res: any = await apiClient.patch(`/users/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      showToast({ type: 'success', title: 'User Updated', message: 'User details updated successfully.' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org-chart'] });
      setEditUser(null);
    },
  });

  // Deactivate User Mutation
  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await apiClient.delete(`/users/${id}`);
      return res.data;
    },
    onSuccess: () => {
      showToast({ type: 'info', title: 'User Deactivated', message: 'User account deactivated.' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org-chart'] });
      setDeactivateUser(null);
    },
  });

  // Hierarchy rules for Manager Dropdown filtering
  // ADMIN level 0; DEPT_HEAD level 1 (needs level 0 manager); TEAM_LEAD level 2 (needs level <= 1); EXECUTIVE level 3 (needs level <= 2)
  const getEligibleManagers = (role: Role) => {
    if (!usersData?.users) return [];

    let maxAllowedLevel = 0;
    if (role === 'DEPT_HEAD') maxAllowedLevel = 0;
    else if (role === 'TEAM_LEAD') maxAllowedLevel = 1;
    else if (role === 'EXECUTIVE') maxAllowedLevel = 2;

    return usersData.users.filter((u) => u.hierarchy_level <= maxAllowedLevel && u.is_active);
  };

  const roleBadgeStyles: Record<Role, string> = {
    ADMIN: 'bg-purple-100 text-purple-800 border-purple-200',
    DEPT_HEAD: 'bg-blue-100 text-blue-800 border-blue-200',
    TEAM_LEAD: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    EXECUTIVE: 'bg-slate-100 text-slate-800 border-slate-200',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="text-indigo-600" size={28} />
            <span>Team Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Admin directory control for user provisioning, manager hierarchy line assignments, and status.
          </p>
        </div>

        <button
          onClick={() => setAddModalOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <UserPlus size={16} />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Generated Credentials Alert Banner */}
      {createdInviteInfo && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start justify-between gap-4 animate-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-950">Employee Provisioned: {createdInviteInfo.name}</p>
              <p className="text-xs text-emerald-800 mt-1">
                Temporary Password:{' '}
                <code className="bg-emerald-100 text-emerald-900 font-mono px-2 py-0.5 rounded font-bold">
                  {createdInviteInfo.tempPass}
                </code>
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(createdInviteInfo.tempPass);
              showToast({ type: 'info', message: 'Temporary password copied to clipboard' });
            }}
            className="p-1.5 bg-emerald-200 hover:bg-emerald-300 text-emerald-900 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <Copy size={14} />
            <span>Copy</span>
          </button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute left-3.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees by name, email, or designation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Role Filter */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="DEPT_HEAD">DEPT_HEAD</option>
            <option value="TEAM_LEAD">TEAM_LEAD</option>
            <option value="EXECUTIVE">EXECUTIVE</option>
          </select>

          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none"
          >
            <option value="ALL">All Departments</option>
            <option value="Executive">Executive</option>
            <option value="Engineering">Engineering</option>
            <option value="Product">Product</option>
            <option value="Operations">Operations</option>
            <option value="HR">HR</option>
          </select>
        </div>
      </div>

      {/* Employee Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">Loading employee database...</div>
        ) : usersData?.users && usersData.users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Employee</th>
                  <th className="py-3.5 px-4">Role & Level</th>
                  <th className="py-3.5 px-4">Department & Designation</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                {usersData.users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{user.name}</p>
                          <p className="text-[11px] text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${roleBadgeStyles[user.role]}`}>
                        {user.role} (Level {user.hierarchy_level})
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <p className="font-semibold text-slate-900">{user.designation}</p>
                      <p className="text-[11px] text-slate-500">{user.department}</p>
                    </td>
                    <td className="py-4 px-4">
                      {user.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right space-x-1">
                      <button
                        onClick={() => setEditUser(user)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit details"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeactivateUser(user)}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Deactivate staff"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500">
            <Users size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-bold">No employees found matching filter criteria</p>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Provision New Staff Account</h3>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit((d) => createUserMutation.mutate(d))} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  {...register('name')}
                  placeholder="e.g. John Doe"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                />
                {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  {...register('email')}
                  placeholder="johndoe@company.com"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                />
                {errors.email && <p className="text-xs text-red-500 mt-0.5">{errors.email.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    {...register('department')}
                    placeholder="Engineering"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                  {errors.department && <p className="text-xs text-red-500 mt-0.5">{errors.department.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Designation</label>
                <input
                  type="text"
                  {...register('designation')}
                  placeholder="Senior Developer"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none"
                />
                {errors.designation && <p className="text-xs text-red-500 mt-0.5">{errors.designation.message}</p>}
              </div>

              {selectedRoleWatch !== 'ADMIN' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reporting Line Manager</label>
                  <select
                    {...register('manager_id')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none"
                  >
                    <option value="">-- Select Manager --</option>
                    {getEligibleManagers(selectedRoleWatch).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.designation} - {m.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                >
                  {createUserMutation.isPending ? 'Provisioning...' : 'Provision User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      <EditUserModal
        user={editUser}
        isOpen={!!editUser}
        onClose={() => setEditUser(null)}
      />

      {/* Deactivate User Modal */}
      {deactivateUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3 border border-red-100">
              <AlertTriangle size={24} />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Deactivate Staff Account?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Deactivating <span className="font-bold text-slate-800">{deactivateUser.name}</span> will soft-delete their account and revoke access privileges.
            </p>

            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setDeactivateUser(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => deactivateMutation.mutate(deactivateUser.id)}
                disabled={deactivateMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
              >
                {deactivateMutation.isPending ? 'Deactivating...' : 'Confirm Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
