import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Role } from '../types';
import { ShieldAlert } from 'lucide-react';

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

interface RoleRouteProps {
  allow: Role[];
  children?: React.ReactNode;
}

export function RoleRoute({ allow, children }: RoleRouteProps) {
  const user = useAuthStore((state) => state.user);

  if (!user || !allow.includes(user.role)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 border border-red-200">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-slate-600 max-w-md mb-6">
          Your current role (<span className="font-semibold text-slate-800">{user?.role || 'Guest'}</span>) does not have authorization to view this section.
        </p>
        <a
          href="/"
          className="inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium transition-colors"
        >
          Return to Dashboard
        </a>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
