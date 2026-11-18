import { QueryClient } from '@tanstack/react-query';

// Shared singleton so authStore can clear it synchronously on login/logout (see authStore.ts) —
// it must live outside App.tsx to avoid a circular import between the store and the app shell.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
