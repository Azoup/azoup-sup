import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { clearUserAccessCache } from '@/lib/userAccessCache';

/** Alinha o cliente Supabase com a sessão React (sem refetch em massa no login). */
export function AuthSessionSync() {
  const { session, loading } = useAuth();
  const queryClient = useQueryClient();
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!session?.access_token) {
      lastTokenRef.current = null;
      clearUserAccessCache();
      queryClient.clear();
      return;
    }

    if (lastTokenRef.current === session.access_token) return;
    lastTokenRef.current = session.access_token;

    void supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token ?? '',
    });
  }, [session?.access_token, session?.refresh_token, loading, queryClient]);

  return null;
}
