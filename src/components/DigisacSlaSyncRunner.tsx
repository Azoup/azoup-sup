import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Dispara sincronização de SLA Digisac periodicamente enquanto o app está aberto.
 * Complementa o cron no Supabase; apenas administradores disparam manualmente.
 */
export function DigisacSlaSyncRunner() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const runSync = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;

        await supabase.functions.invoke('digisac-sla-cron', {
          method: 'POST',
          body: {},
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.warn('[DigisacSlaSyncRunner] sync failed:', e);
      } finally {
        runningRef.current = false;
      }
    };

    void runSync();
    const id = window.setInterval(runSync, SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user, isAdmin]);

  return null;
}
