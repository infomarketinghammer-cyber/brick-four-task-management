import React, { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  GitFork,
  Users,
  CheckSquare,
  ListTodo,
  Bell,
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User as UserIcon,
  Shield,
  X,
  RefreshCw,
  Building2,
  Calendar as CalendarIcon,
  Target,
} from 'lucide-react';

import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { showToast } from '../store/toastStore';
import { Role } from '../types';
import { useCapabilities } from '../hooks/useCapabilities';
import { DarodeJogLogo } from '../components/DarodeJogLogo';
import { AdminAssistant } from '../components/AdminAssistant';

export function AppLayout() {
  const queryClient = useQueryClient();
  const { is_leaf_node } = useCapabilities();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const { user, logout, setAuth } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Notifications Query (Real-time polling)
  const { data: notificationsData = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res: any = await apiClient.get('/notifications');
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
    refetchInterval: 3000,
  });

  // Conversations Query (Real-time polling)
  const { data: conversationsData = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res: any = await apiClient.get('/conversations');
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
    refetchInterval: 3000,
  });

  // Global Search Query
  const { data: searchResults } = useQuery({
    queryKey: ['global-search', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return { users: [], tasks: [] };
      const [uRes, tRes]: any = await Promise.all([
        apiClient.get(`/users?search=${encodeURIComponent(searchQuery)}`),
        apiClient.get(`/tasks?search=${encodeURIComponent(searchQuery)}`),
      ]);
      const users = uRes.data?.users || [];
      const tasks = tRes.data?.tasks || (Array.isArray(tRes.data) ? tRes.data : []);
      return { users, tasks };
    },
    enabled: searchQuery.trim().length > 1,
  });

  const unreadNotifCount = Array.isArray(notificationsData)
    ? notificationsData.filter((n: any) => !n.is_read).length
    : 0;
  const unreadMsgCount = Array.isArray(conversationsData)
    ? conversationsData.reduce((acc: number, c: any) => acc + (c.unreadCount || 0), 0)
    : 0;



  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE'] },
    { label: 'Calendar', path: '/calendar', icon: CalendarIcon, roles: ['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE'] },
    { label: 'Team Workload', path: '/team-workload', icon: Users, roles: ['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE'] },
    { label: 'Org Chart', path: '/org-chart', icon: GitFork, roles: ['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE'] },
    { label: 'Team', path: '/team', icon: Users, roles: ['ADMIN'] },
    { label: 'Tasks', path: '/tasks', icon: CheckSquare, roles: ['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE'] },
    { label: 'To-Do', path: '/todos', icon: ListTodo, roles: ['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE'] },
    { label: 'Messages', path: '/messages', icon: MessageSquare, roles: ['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE'] },
    { label: 'KRA & KPI', path: '/kpi', icon: Target, roles: ['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE'] },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (!user || !item.roles.includes(user.role)) return false;
    if ((item.path === '/team' || item.path === '/team-workload') && is_leaf_node) return false;
    return true;
  });

  const roleBadgeStyles: Record<Role, string> = {
    ADMIN: 'bg-purple-100 text-purple-800 border-purple-200',
    DEPT_HEAD: 'bg-blue-100 text-blue-800 border-blue-200',
    TEAM_LEAD: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    EXECUTIVE: 'bg-slate-100 text-slate-800 border-slate-200',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900 font-sans antialiased">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-slate-950 text-white transition-all duration-300 relative border-r border-slate-800 z-30 ${
          sidebarCollapsed ? 'w-20' : 'w-[268px]'
        }`}
      >
        {/* Brand Header */}
        {sidebarCollapsed ? (
          <div className="h-16 flex items-center justify-center relative px-2 border-b border-slate-800/80">
            <Link to="/" className="flex items-center justify-center group" title="brickfour Task Management">
              <DarodeJogLogo size={20} showText={false} theme="dark" />
            </Link>
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="absolute -right-3 top-5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white w-6 h-6 rounded-full border border-slate-700 flex items-center justify-center shadow-md z-40 transition-colors"
              title="Expand sidebar"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <div className="h-16 flex items-center justify-between px-3.5 border-b border-slate-800/80 gap-2">
            <Link to="/" className="flex items-center min-w-0 flex-1 group" title="brickfour Task Management">
              <DarodeJogLogo size={24} showText={true} textColor="text-white" subtitleColor="text-indigo-400" theme="dark" />
            </Link>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
              title="Collapse sidebar"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        )}

        {/* Role Identity Banner */}
        {!sidebarCollapsed && user && (
          <div className="mx-3 mt-4 p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center font-medium text-xs border border-slate-600">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 truncate">{user.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider ${roleBadgeStyles[user.role]}`}>
                  {user.role.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon size={20} className={isActive ? 'text-white' : 'text-slate-400'} />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer info / Logout */}
        <div className="p-3 border-t border-slate-800">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-950/20 transition-colors"
          >
            <LogOut size={18} />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20 shadow-xs">
          {/* Global Search Bar */}
          <div className="relative flex-1 max-w-md">
            <div className="relative flex items-center">
              <Search size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search staff, roles, departments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                className="w-full pl-9 pr-8 py-2 bg-slate-100 hover:bg-slate-100/80 focus:bg-white text-xs sm:text-sm text-slate-900 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none transition-all placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Global Search Results Dropdown */}
            {searchFocused && searchQuery.trim().length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 max-h-96 overflow-y-auto space-y-2">
                {/* Employees Section */}
                <div>
                  <div className="text-[10px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider">
                    Employees
                  </div>
                  {searchResults?.users && searchResults.users.length > 0 ? (
                    searchResults.users.map((u: any) => (
                      <div
                        key={u.id}
                        onClick={() => {
                          navigate('/org-chart');
                          setSearchQuery('');
                        }}
                        className="flex items-center gap-3 p-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 font-semibold text-xs flex items-center justify-center shrink-0 border border-indigo-100">
                          {u.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900 truncate">{u.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{u.designation} • {u.department}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${roleBadgeStyles[u.role as Role]}`}>
                          {u.role}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-1.5 text-xs text-slate-400 font-medium">No matching employees</div>
                  )}
                </div>

                {/* Tasks Section */}
                <div>
                  <div className="text-[10px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider">
                    Tasks
                  </div>
                  {searchResults?.tasks && searchResults.tasks.length > 0 ? (
                    searchResults.tasks.map((t: any) => (
                      <Link
                        key={t.id}
                        to={`/tasks/${t.id}`}
                        state={{ from: location.pathname + location.search }}
                        onClick={() => {
                          setSearchQuery('');
                          setSearchFocused(false);
                        }}
                        className="flex items-center gap-3 p-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors block text-inherit group"
                      >
                        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                          <CheckSquare size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900 group-hover:text-indigo-600 truncate">{t.title}</p>
                          <p className="text-[11px] text-slate-500 truncate">{t.status.replace('_', ' ')} • Priority: {t.priority}</p>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="px-3 py-1.5 text-xs text-slate-400 font-medium">No matching tasks</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Messages Bell */}
            <div className="relative">
              <button
                onClick={() => {
                  setMsgOpen(!msgOpen);
                  setNotifOpen(false);
                  setUserMenuOpen(false);
                }}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors relative"
                title="Messages"
              >
                <MessageSquare size={20} />
                {unreadMsgCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadMsgCount}
                  </span>
                )}
              </button>

              {/* Messages Modal Popover */}
              {msgOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Conversations</h3>
                    <button
                      onClick={() => {
                        setMsgOpen(false);
                        navigate('/messages');
                      }}
                      className="text-[11px] text-indigo-600 hover:underline font-semibold"
                    >
                      View All
                    </button>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {conversationsData && conversationsData.length > 0 ? (
                      conversationsData.map((c: any) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setMsgOpen(false);
                            navigate('/messages');
                          }}
                          className="p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors flex items-start gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {c.participant?.name?.charAt(0) || 'U'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-slate-900">{c.participant?.name}</p>
                              {c.unreadCount > 0 && (
                                <span className="w-2 h-2 bg-indigo-600 rounded-full" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">{c.lastMessage?.text || 'No messages'}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 text-center py-4">No recent conversations</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notifications Bell */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setMsgOpen(false);
                  setUserMenuOpen(false);
                }}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors relative"
                title="Notifications"
              >
                <Bell size={20} />
                {unreadNotifCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {/* Notifications Popover */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Notifications</h3>
                    <button
                      onClick={async () => {
                        try {
                          await apiClient.patch('/notifications/read-all');
                          queryClient.invalidateQueries({ queryKey: ['notifications'] });
                          showToast({ type: 'success', message: 'All notifications marked as read' });
                        } catch (err) {}
                      }}
                      className="text-[11px] text-indigo-600 hover:underline font-semibold"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {notificationsData && notificationsData.length > 0 ? (
                      notificationsData.map((n: any) => {
                        const targetUrl = n.task_id ? `/tasks/${n.task_id}` : '/tasks';
                        return (
                          <Link
                            key={n.id}
                            to={targetUrl}
                            state={{ from: location.pathname + location.search }}
                            onClick={async () => {
                              setNotifOpen(false);
                              if (!n.is_read) {
                                try {
                                  await apiClient.patch(`/notifications/${n.id}/read`);
                                  queryClient.invalidateQueries({ queryKey: ['notifications'] });
                                } catch (e) {}
                              }
                            }}
                            className={`p-3 rounded-xl border text-left transition-colors cursor-pointer hover:bg-slate-100 block text-inherit group ${
                              n.is_read ? 'bg-slate-50 border-slate-100' : 'bg-indigo-50/50 border-indigo-100 font-semibold'
                            }`}
                          >
                            <p className="text-xs font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{n.title}</p>
                            <p className="text-[11px] text-slate-600 mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </Link>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500 text-center py-4">No notifications</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Avatar Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setUserMenuOpen(!userMenuOpen);
                  setNotifOpen(false);
                  setMsgOpen(false);
                }}
                className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center border-2 border-indigo-500 shadow-xs">
                  {user?.name.charAt(0) || 'U'}
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50">
                  {/* User Profile Summary */}
                  <div className="pb-3 border-b border-slate-100 mb-3">
                    <p className="text-xs font-bold text-slate-900">{user?.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${user ? roleBadgeStyles[user.role] : ''}`}>
                        {user?.role}
                      </span>
                      <span className="text-[10px] text-slate-500">Level {user?.hierarchy_level}</span>
                    </div>
                  </div>



                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Outlet */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 mb-16 md:mb-0">
          <Outlet />
        </main>

        {/* Admin-only AI assistant (renders nothing for other roles) */}
        <AdminAssistant />
      </div>

      {/* Mobile Bottom Navigation (< 768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 text-white border-t border-slate-800 flex items-center justify-around py-2 z-40 shadow-lg">
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 px-3 py-1 text-[10px] font-medium transition-colors ${
                isActive ? 'text-indigo-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
