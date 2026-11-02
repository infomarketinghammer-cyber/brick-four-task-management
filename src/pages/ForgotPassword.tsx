import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { DarodeJogLogo } from '../components/DarodeJogLogo';

import { apiClient } from '../api/client';
import { showToast } from '../store/toastStore';

const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export function ForgotPassword() {
  const [submitted, setSubmitted] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormData) => {
    try {
      setLoading(true);
      const res: any = await apiClient.post('/auth/forgot-password', data);
      if (res.data) {
        setSubmitted(true);
        if (res.data.resetToken) {
          setResetToken(res.data.resetToken);
        }
        showToast({
          type: 'success',
          title: 'Reset Link Dispatched',
          message: 'If the email exists, password reset instructions have been issued.',
        });
      }
    } catch {
      // Error handled by toast interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-slate-100">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Sign In</span>
        </Link>

        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <DarodeJogLogo size={52} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Password Recovery</h1>
          <p className="text-xs text-slate-500 mt-1">
            Enter your registered account email to receive reset instructions.
          </p>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <div className="p-4 bg-emerald-50 text-emerald-900 rounded-2xl border border-emerald-200">
              <CheckCircle2 size={32} className="text-emerald-600 mx-auto mb-2" />
              <p className="text-xs font-semibold">Instructions Dispatched</p>
              <p className="text-[11px] text-emerald-700 mt-1">
                Please check your email inbox for the reset link.
              </p>
            </div>

            {resetToken && (
              <div className="p-3 bg-slate-100 rounded-xl text-left border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Development Debug Token
                </p>
                <code className="text-xs text-indigo-600 font-mono break-all">{resetToken}</code>
                <div className="mt-2 text-right">
                  <Link
                    to={`/reset-password?token=${resetToken}`}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    Proceed to Reset Page →
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
              <input
                type="email"
                {...register('email')}
                placeholder="admin@company.com"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-indigo-600/25 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Send Recovery Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
