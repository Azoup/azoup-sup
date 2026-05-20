import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fetchUserAccess } from '@/lib/fetchUserAccess';
import { clearUserAccessCache, readUserAccessCache, writeUserAccessCache } from '@/lib/userAccessCache';

/** Mantém o cliente Supabase alinhado com a sessão do React e refaz queries após login. */
export function AuthSessionSync() {
  const { session, user, loading } = useAuth();
  const queryClient = useQueryClient();
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!session?.access_token) {
      lastTokenRef.current = null;
      clearUserAccessCache();
      queryClient.removeQueries({ queryKey: ['user-access'] });
      return;
    }

    void supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token ?? '',
    });

    if (lastTokenRef.current !== session.access_token) {
      lastTokenRef.current = session.access_token;
      if (user?.id) {
        const cached = readUserAccessCache(user.id);
        void queryClient.prefetchQuery({
          queryKey: ['user-access', user.id],
          queryFn: async () => {
            const result = await fetchUserAccess(session.access_token, user.id);
            const entry = {
              ...result,
              userId: user.id,
              cachedAt: Date.now(),
            };
            writeUserAccessCache(entry);
            return entry;
          },
          initialData: cached,
          staleTime: 5 * 60 * 1000,
        });
      }
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== 'user-access',
      });
    }
  }, [session?.access_token, session?.refresh_token, loading, queryClient, user?.id]);

  return null;
}
