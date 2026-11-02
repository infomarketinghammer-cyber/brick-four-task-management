import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { AppLayout } from './layouts/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { OrgChart } from './pages/OrgChart';
import { TeamManagement } from './pages/TeamManagement';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { MessagingPage } from './pages/MessagingPage';
import { TodosPage } from './pages/TodosPage';
import { TeamWorkload } from './pages/TeamWorkload';
import { CalendarPage } from './pages/CalendarPage';
import { KpiPage } from './pages/KpiPage';
import { ProtectedRoute, RoleRoute } from './components/RouteGuards';
import { ToastContainer } from './components/ToastContainer';
import { useSocket } from './hooks/useSocket';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function SocketInitializer({ children }: { children: React.ReactNode }) {
  useSocket();
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketInitializer>
        <BrowserRouter>
          <ToastContainer />
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected App Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/org-chart" element={<OrgChart />} />
                <Route
                  path="/team"
                  element={
                    <RoleRoute allow={['ADMIN']}>
                      <TeamManagement />
                    </RoleRoute>
                  }
                />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/tasks/:id" element={<TaskDetailPage />} />
                <Route path="/team-workload" element={<TeamWorkload />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/todos" element={<TodosPage />} />
                <Route path="/messages" element={<MessagingPage />} />
                <Route path="/kpi" element={<KpiPage />} />
              </Route>
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SocketInitializer>
    </QueryClientProvider>
  );
}
