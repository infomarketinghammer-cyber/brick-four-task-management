import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';

export interface UserCapabilities {
  can_assign: boolean;
  subordinate_count: number;
  is_leaf_node: boolean;
}

export function useCapabilities() {
  const user = useAuthStore((state) => state.user);

  const { data, isLoading, error } = useQuery<UserCapabilities>({
    queryKey: ['user-capabilities', user?.id],
    queryFn: async () => {
      const res: any = await apiClient.get('/users/me/capabilities');
      return res.data;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  return {
    capabilities: data || { can_assign: false, subordinate_count: 0, is_leaf_node: true },
    can_assign: data?.can_assign ?? false,
    subordinate_count: data?.subordinate_count ?? 0,
    is_leaf_node: data?.is_leaf_node ?? true,
    isLoading,
    error,
  };
}
