import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/** Mantém o cliente Supabase alinhado com a sessão do React e refaz queries após login. */
export function AuthSessionSync() {
  const { session, loading } = useAuth();
  const queryClient = useQueryClient();
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!session?.access_token) {
      lastTokenRef.current = null;
      return;
    }

    void supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token ?? '',
    });

    if (lastTokenRef.current !== session.access_token) {
      lastTokenRef.current = session.access_token;
      void queryClient.invalidateQueries();
    }
  }, [session?.access_token, session?.refresh_token, loading, queryClient]);

  return null;
}
