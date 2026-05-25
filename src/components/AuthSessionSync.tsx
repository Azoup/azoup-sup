import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fetchAppBootstrap } from '@/lib/fetchAppBootstrap';
import { applyAppBootstrapToQueryClient } from '@/lib/applyAppBootstrap';
import { readUserAccessCache } from '@/lib/userAccessCache';
import { readKanbanBoardCache } from '@/lib/kanbanBoardCache';

/** Alinha o cliente Supabase com a sessão React (sem refetch em massa no login). */
export function AuthSessionSync() {
  const { session, user, loading } = useAuth();
  const queryClient = useQueryClient();
  const lastTokenRef = useRef<string | null>(null);
  const bootstrapRef = useRef(false);

  useEffect(() => {
    if (loading) return;

    if (!session?.access_token) {
      lastTokenRef.current = null;
      bootstrapRef.current = false;
      return;
    }

    if (lastTokenRef.current === session.access_token) return;
    lastTokenRef.current = session.access_token;
    bootstrapRef.current = false;

    void supabase.auth.getSession().then(({ data: { session: clientSession } }) => {
      if (clientSession?.access_token === session.access_token) return;
      void supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token ?? '',
      });
    });

    const userId = user?.id;
    if (!userId || bootstrapRef.current) return;

    const needsAccess = !readUserAccessCache(userId);
    const needsKanban = !readKanbanBoardCache();
    if (!needsAccess && !needsKanban) return;

    bootstrapRef.current = true;
    void fetchAppBootstrap(session.access_token, userId)
      .then((bootstrap) => applyAppBootstrapToQueryClient(queryClient, bootstrap))
      .catch(() => {
        bootstrapRef.current = false;
      });
  }, [session?.access_token, session?.refresh_token, loading, queryClient, user?.id]);

  return null;
}
