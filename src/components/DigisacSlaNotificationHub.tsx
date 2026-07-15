import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { usePermissions } from '@/hooks/usePermissions';
import { DigisacSlaAlertDialog } from '@/components/DigisacSlaAlertDialog';
import { Button } from '@/components/ui/button';
import type { DigisacSlaNotification } from '@/integrations/digisac/slaTypes';
import {
  slaNotificationDesktopBody,
  slaNotificationDetail,
  slaNotificationTitle,
} from '@/integrations/digisac/slaNormalize';
import {
  getDesktopNotificationSupport,
  requestDesktopNotificationPermission,
  showDesktopNotification,
} from '@/lib/desktopNotifications';

/**
 * Pop-up na tela + notificação do sistema (Windows/macOS) para alertas SLA Digisac.
 */
export function DigisacSlaNotificationHub() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const { canView } = usePermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<DigisacSlaNotification[]>([]);
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const current = queue[0] ?? null;

  const dequeue = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const handleIncoming = useCallback((row: DigisacSlaNotification) => {
    if (!row?.id || seenIdsRef.current.has(row.id)) return;
    seenIdsRef.current.add(row.id);

    setQueue((prev) => [...prev, row]);

    const desktopShown = showDesktopNotification({
      title: slaNotificationTitle(row),
      body: slaNotificationDesktopBody(row),
      tag: `sla-${row.alert_id}`,
      onClick: () => {
        if (canView('digisac_dashboard')) navigate('/digisac-dashboard');
      },
    });

    if (!desktopShown) {
      toast.warning(slaNotificationTitle(row), {
        description: slaNotificationDetail(row),
        duration: 20_000,
      });
    }
  }, [canView, navigate]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const support = getDesktopNotificationSupport();
    if (support === 'default') {
      setShowPermissionBanner(true);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const channel = supabase
      .channel(`digisac-sla-popup-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'digisac_sla_notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as DigisacSlaNotification;
          queryClient.invalidateQueries({ queryKey: ['digisac-sla-notifications', user.id] });
          handleIncoming(row);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin, queryClient, handleIncoming]);

  const enableDesktopNotifications = async () => {
    const result = await requestDesktopNotificationPermission();
    if (result === 'granted') {
      setShowPermissionBanner(false);
      toast.success('Notificações do sistema ativadas');
    } else if (result === 'denied') {
      toast.error('Permissão negada. Ative nas configurações do navegador para receber alertas com o app minimizado.');
    }
  };

  const openDashboard = () => {
    dequeue();
    if (canView('digisac_dashboard')) navigate('/digisac-dashboard');
  };

  if (!user || !isAdmin) return null;

  return (
    <>
      {showPermissionBanner && getDesktopNotificationSupport() !== 'granted' && (
        <div className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-amber-500/50 bg-card p-3 shadow-lg">
          <div className="flex items-start gap-2">
            <BellRing className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-sm font-medium">Alertas SLA no computador</p>
              <p className="text-xs text-muted-foreground">
                Ative para receber pop-up do Windows mesmo com o app minimizado.
              </p>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={enableDesktopNotifications}>
                  Ativar notificações
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setShowPermissionBanner(false)}
                >
                  Agora não
                </Button>
              </div>
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setShowPermissionBanner(false)}
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <DigisacSlaAlertDialog
        notification={current}
        open={!!current}
        onOpenChange={(open) => { if (!open) dequeue(); }}
        onOpenDashboard={canView('digisac_dashboard') ? openDashboard : undefined}
      />
    </>
  );
}
