import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';
import { queryClient } from '../lib/queryClient';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  updateUser: (partialUser: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) => {
        // Cleared synchronously here (not in a useEffect reacting to the state change) so
        // whichever page the app navigates to next mounts with an empty cache instead of
        // briefly rendering the previous session's cached (wrongly-scoped) query results.
        queryClient.clear();
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        });
      },

      updateUser: (partialUser) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...partialUser } : null,
        }));
      },

      logout: () => {
        queryClient.clear();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'task_management_auth',
    }
  )
);
