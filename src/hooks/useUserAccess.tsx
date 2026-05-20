import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchUserAccess } from '@/lib/fetchUserAccess';

export function useUserAccess() {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: ['user-access', user?.id],
    queryFn: async () => {
      if (!session?.access_token || !user?.id) {
        throw new Error('missing_session');
      }
      return fetchUserAccess(session.access_token, user.id);
    },
    enabled: !!user && !!session?.access_token,
    staleTime: 60 * 1000,
    retry: 1,
  });
}
