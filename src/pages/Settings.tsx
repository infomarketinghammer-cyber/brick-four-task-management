import React, { useState } from 'react';
import { Settings as SettingsIcon, KeyRound, User as UserIcon, Mail, Building2, Briefcase, Shield } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { ChangePasswordModal } from '../components/ChangePasswordModal';

export function Settings() {
  const user = useAuthStore((state) => state.user);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <SettingsIcon className="text-indigo-600" size={28} />
          <span>Settings</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">Manage your account and security preferences.</p>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Account</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <UserIcon size={15} className="text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Name</p>
              <p className="font-bold text-slate-900 truncate">{user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <Mail size={15} className="text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Login Email</p>
              <p className="font-bold text-slate-900 truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <Building2 size={15} className="text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Department</p>
              <p className="font-bold text-slate-900 truncate">{user?.department}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <Briefcase size={15} className="text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Designation</p>
              <p className="font-bold text-slate-900 truncate">{user?.designation}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-100 sm:col-span-2">
            <Shield size={15} className="text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Role</p>
              <p className="font-bold text-slate-900 truncate">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          To change your name, department, designation or manager, contact your admin on the Team page.
        </p>
      </div>

      {/* Security */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Security</h2>
        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
          <div>
            <p className="text-xs font-bold text-slate-900">Password</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Change your login password at any time.</p>
          </div>
          <button
            onClick={() => setIsChangePasswordOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shrink-0"
          >
            <KeyRound size={14} />
            <span>Change Password</span>
          </button>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onChanged={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}
