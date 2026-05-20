import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchUserAccess } from '@/lib/fetchUserAccess';
import {
  readUserAccessCache,
  writeUserAccessCache,
  type CachedUserAccess,
} from '@/lib/userAccessCache';

export type { CachedUserAccess };

async function loadUserAccess(
  accessToken: string,
  userId: string,
): Promise<CachedUserAccess> {
  const result = await fetchUserAccess(accessToken, userId);
  const cached: CachedUserAccess = {
    ...result,
    userId,
    cachedAt: Date.now(),
  };
  writeUserAccessCache(cached);
  return cached;
}

export function useUserAccess() {
  const { session, user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user-access', userId],
    queryFn: async () => {
      if (!session?.access_token || !userId) {
        throw new Error('missing_session');
      }
      return loadUserAccess(session.access_token, userId);
    },
    enabled: !!userId && !!session?.access_token,
    initialData: () => readUserAccessCache(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Dados de acesso válidos para o utilizador atual (cache ou rede). */
export function useAccessReady(): boolean {
  const { user } = useAuth();
  const { data } = useUserAccess();
  return Boolean(user?.id && data?.userId === user.id);
}
