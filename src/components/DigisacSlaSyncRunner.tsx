import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import {
  describeSlaSyncResult,
  slaSyncPreviewLines,
  syncDigisacSlaAlerts,
} from '@/integrations/digisac/slaSync';
import { toast } from 'sonner';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Dispara sincronização de SLA Digisac periodicamente enquanto o app está aberto.
 * Na primeira execução exibe resumo para validação.
 */
export function DigisacSlaSyncRunner() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const firstRunRef = useRef(true);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const runSync = async (showToast: boolean) => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const result = await syncDigisacSlaAlerts();
        queryClient.invalidateQueries({ queryKey: ['digisac-sla-notifications', user.id] });

        if (showToast) {
          const preview = slaSyncPreviewLines(result);
          if (result.errors?.length) {
            toast.error('SLA Digisac: erro na sincronização', {
              description: result.errors.join(' · '),
            });
          } else if (result.notified > 0) {
            toast.warning('Alertas SLA enviados', {
              description: describeSlaSyncResult(result),
              duration: 15_000,
            });
          } else {
            toast.info('SLA Digisac verificado', {
              description: preview.length
                ? `${describeSlaSyncResult(result)}\n${preview.join('\n')}`
                : describeSlaSyncResult(result),
              duration: 12_000,
            });
          }
        }
      } catch (e) {
        if (showToast) {
          toast.error('Não foi possível sincronizar SLA Digisac', {
            description: e instanceof Error ? e.message : String(e),
          });
        } else {
          console.warn('[DigisacSlaSyncRunner] sync failed:', e);
        }
      } finally {
        runningRef.current = false;
      }
    };

    void runSync(firstRunRef.current);
    firstRunRef.current = false;

    const id = window.setInterval(() => void runSync(false), SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user, isAdmin, queryClient]);

  return null;
}
