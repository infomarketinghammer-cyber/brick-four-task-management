import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { User } from '../types';

interface SubordinatesResponse {
  managerId: string;
  totalCount: number;
  subordinates: User[];
}

/**
 * Users the current user may assign/delegate to:
 * - their reporting subtree, and
 * - for department heads, every other department head (cross-department requests).
 */
export function useAssignableUsers(enabled: boolean) {
  const currentUser = useAuthStore((state) => state.user);
  const isDeptHead = currentUser?.role === 'DEPT_HEAD';

  const { data: subData, isLoading: isLoadingSubordinates } = useQuery<SubordinatesResponse>({
    queryKey: ['subordinates', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { managerId: '', totalCount: 0, subordinates: [] };
      const res: any = await apiClient.get(`/users/${currentUser.id}/subordinates`);
      return res.data || { managerId: currentUser.id, totalCount: 0, subordinates: [] };
    },
    enabled: !!currentUser?.id && enabled,
  });

  const { data: headsData, isLoading: isLoadingHeads } = useQuery<User[]>({
    queryKey: ['peer-dept-heads'],
    queryFn: async () => {
      const res: any = await apiClient.get('/users?scope=all&role=DEPT_HEAD');
      return res.data?.users || [];
    },
    enabled: isDeptHead && enabled,
  });

  const subordinates = Array.isArray(subData?.subordinates) ? subData!.subordinates : [];
  const peerHeads = isDeptHead ? (headsData || []).filter((u) => u.id !== currentUser?.id && u.is_active !== false) : [];

  return {
    subordinates,
    peerHeads,
    isLoading: isLoadingSubordinates || (isDeptHead && isLoadingHeads),
  };
}
