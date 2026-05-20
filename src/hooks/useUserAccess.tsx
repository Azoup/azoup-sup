import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { loadAndCacheUserAccess } from '@/lib/userAccessLoad';
import { readUserAccessCache, type CachedUserAccess } from '@/lib/userAccessCache';

export type { CachedUserAccess };

const ACCESS_STALE_MS = 10 * 60 * 1000;

export function useUserAccess() {
  const { session, user } = useAuth();
  const userId = user?.id;
  const cached = readUserAccessCache(userId);

  return useQuery({
    queryKey: ['user-access', userId],
    queryFn: async () => {
      if (!session?.access_token || !userId) {
        throw new Error('missing_session');
      }
      return loadAndCacheUserAccess(session.access_token, userId);
    },
    enabled: !!userId && !!session?.access_token,
    initialData: cached,
    initialDataUpdatedAt: cached?.cachedAt,
    staleTime: ACCESS_STALE_MS,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useAccessReady(): boolean {
  const { user } = useAuth();
  const { data } = useUserAccess();
  return Boolean(user?.id && data?.userId === user.id);
}
