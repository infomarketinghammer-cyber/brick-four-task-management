import React, { useState } from 'react';
import { Lock, X, Eye, EyeOff, ShieldAlert, KeyRound } from 'lucide-react';
import { apiClient } from '../api/client';
import { showToast } from '../store/toastStore';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
  // When true, this is the "you must change your password" first-login flow — no close
  // button, no cancel, nothing else in the app usable until it's done.
  forced?: boolean;
}

export function ChangePasswordModal({ isOpen, onClose, onChanged, forced = false }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword });
      showToast({ type: 'success', title: 'Password Changed', message: 'Your password has been updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to change password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-100 text-indigo-600">
              <KeyRound size={18} />
            </span>
            <h2 className="text-sm font-bold text-slate-900">
              {forced ? 'Change Your Password' : 'Change Password'}
            </h2>
          </div>
          {!forced && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
              <X size={18} />
            </button>
          )}
        </div>

        {forced && (
          <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
            <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <span>You're signed in with a temporary password. Set a new password to continue.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              {forced ? 'Temporary Password' : 'Current Password'}
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">New Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Confirm New Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPasswords(!showPasswords)}
            className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1 font-semibold"
          >
            {showPasswords ? <EyeOff size={12} /> : <Eye size={12} />}
            <span>{showPasswords ? 'Hide' : 'Show'} passwords</span>
          </button>

          <div className="flex items-center justify-end gap-2 pt-2">
            {!forced && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save New Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
