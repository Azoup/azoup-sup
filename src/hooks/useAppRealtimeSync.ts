import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { APP_REALTIME_TABLES, handleAppRealtimeTableChange } from '@/lib/appRealtimeSync';

/**
 * Sincroniza dados entre usuários logados via Supabase Realtime + invalidação React Query.
 * Montado uma vez no AppLayout (todas as telas autenticadas).
 */
export function useAppRealtimeSync(): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const accessToken = session?.access_token;

  useEffect(() => {
    if (!accessToken) return;

    void supabase.realtime.setAuth(accessToken);

    let channel: RealtimeChannel | null = null;

    const setup = () => {
      channel = supabase.channel('app-realtime-sync', {
        config: { broadcast: { self: false } },
      });

      for (const table of APP_REALTIME_TABLES) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => handleAppRealtimeTableChange(table, queryClient),
        );
      }

      channel.subscribe();
    };

    setup();

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [accessToken, queryClient]);
}
