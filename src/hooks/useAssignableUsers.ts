import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { User } from '../types';

interface AssignableResponse {
  userId: string;
  totalCount: number;
  assignable: User[];
}

/**
 * Users the current user may assign/delegate to, org-wide: any peer at their own hierarchy
 * level (any department) plus anyone at a lower level (any department) — not limited to
 * their own reporting subtree. Mirrors canAssignTask in src/permissions.ts.
 */
export function useAssignableUsers(enabled: boolean) {
  const currentUser = useAuthStore((state) => state.user);

  const { data, isLoading } = useQuery<AssignableResponse>({
    queryKey: ['assignable-users', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { userId: '', totalCount: 0, assignable: [] };
      const res: any = await apiClient.get(`/users/${currentUser.id}/assignable`);
      return res.data || { userId: currentUser.id, totalCount: 0, assignable: [] };
    },
    enabled: !!currentUser?.id && enabled,
  });

  return {
    assignableUsers: Array.isArray(data?.assignable) ? data!.assignable : [],
    isLoading,
  };
}
