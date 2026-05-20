import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_USER_ACCESS, fetchUserAccess } from '@/lib/fetchUserAccess';

export function useUserAccess() {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: ['user-access', user?.id],
    queryFn: async () => {
      if (!session?.access_token) {
        return DEFAULT_USER_ACCESS;
      }
      return fetchUserAccess(session.access_token);
    },
    enabled: !!user && !!session?.access_token,
    staleTime: 60 * 1000,
    retry: 0,
    placeholderData: DEFAULT_USER_ACCESS,
  });
}
