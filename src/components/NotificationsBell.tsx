import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, MapPin, Trash2, Eraser, AlertTriangle, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  slaNotificationDetail,
  slaNotificationTitle,
} from '@/integrations/digisac/slaNormalize';
import type { DigisacSlaNotification } from '@/integrations/digisac/slaTypes';

const ACTION_LABEL: Record<string, string> = {
  edit: 'Edição',
  comment: 'Comentário',
  attachment: 'Anexo',
  status: 'Status',
  assignee: 'Responsável',
};

const BOARD_LABEL: Record<string, string> = {
  dev: 'Kanban DEV',
  support: 'Kanban Pendências',
};

type KanbanNotification = {
  id: string;
  read: boolean;
  created_at: string;
  action_type: string;
  message: string;
  card_type: string;
  card_id: string;
};

type UnifiedNotification =
  | { kind: 'kanban'; data: KanbanNotification }
  | { kind: 'sla'; data: DigisacSlaNotification };

export function NotificationsBell() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const { canView } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<null | 'read' | 'all'>(null);

  const { data: kanbanNotifications = [] } = useQuery({
    queryKey: ['dev-notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from('dev_kanban_notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      return (data || []) as KanbanNotification[];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const { data: slaNotifications = [] } = useQuery({
    queryKey: ['digisac-sla-notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('digisac_sla_notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      return (data || []) as DigisacSlaNotification[];
    },
    enabled: !!user && isAdmin,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dev-notifications-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dev_kanban_notifications', filter: `recipient_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ['dev-notifications', user.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const channel = supabase
      .channel('digisac-sla-notifications-rt')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'digisac_sla_notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['digisac-sla-notifications', user.id] });
          const row = payload.new as DigisacSlaNotification;
          if (row?.protocol) {
            toast.warning(slaNotificationTitle(row), {
              description: slaNotificationDetail(row),
              duration: 12_000,
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin, queryClient]);

  const notifications: UnifiedNotification[] = useMemo(() => {
    const merged: UnifiedNotification[] = [
      ...kanbanNotifications.map((n) => ({ kind: 'kanban' as const, data: n })),
      ...slaNotifications.map((n) => ({ kind: 'sla' as const, data: n })),
    ];
    merged.sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime());
    return merged.slice(0, 40);
  }, [kanbanNotifications, slaNotifications]);

  const unreadCount = notifications.filter((n) => !n.data.read).length;

  const handleKanbanClick = async (n: KanbanNotification) => {
    const isSupport = n.card_type === 'support';
    const screen = isSupport ? 'kanban' : 'kanban_dev';
    if (!canView(screen)) {
      toast.error('Você não possui acesso a este ticket');
      return;
    }
    setOpen(false);
    if (!n.read) {
      await (supabase as any).from('dev_kanban_notifications').update({ read: true }).eq('id', n.id);
      queryClient.invalidateQueries({ queryKey: ['dev-notifications', user?.id] });
    }
    const route = isSupport ? '/kanban' : '/kanban-dev';
    navigate(`${route}?card=${n.card_id}`);
  };

  const handleSlaClick = async (n: DigisacSlaNotification) => {
    setOpen(false);
    if (!n.read) {
      await supabase.from('digisac_sla_notifications').update({ read: true }).eq('id', n.id);
      queryClient.invalidateQueries({ queryKey: ['digisac-sla-notifications', user?.id] });
    }
    if (canView('digisac_dashboard')) {
      navigate('/digisac-dashboard');
    }
  };

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    await Promise.all([
      (supabase as any)
        .from('dev_kanban_notifications')
        .update({ read: true })
        .eq('recipient_id', user.id)
        .eq('read', false),
      isAdmin
        ? supabase
          .from('digisac_sla_notifications')
          .update({ read: true })
          .eq('recipient_id', user.id)
          .eq('read', false)
        : Promise.resolve(),
    ]);
    queryClient.invalidateQueries({ queryKey: ['dev-notifications', user.id] });
    queryClient.invalidateQueries({ queryKey: ['digisac-sla-notifications', user.id] });
  };

  const readCount = notifications.length - unreadCount;

  const copyProtocol = async (protocol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(protocol);
      toast.success('Protocolo copiado');
    } catch {
      toast.error('Não foi possível copiar o protocolo');
    }
  };

  const performClear = async (mode: 'read' | 'all') => {
    if (!user) return;
    let kanbanQ = (supabase as any)
      .from('dev_kanban_notifications')
      .delete()
      .eq('recipient_id', user.id);
    let slaQ = supabase
      .from('digisac_sla_notifications')
      .delete()
      .eq('recipient_id', user.id);

    if (mode === 'read') {
      kanbanQ = kanbanQ.eq('read', true);
      slaQ = slaQ.eq('read', true);
    }

    const results = await Promise.all([
      kanbanQ,
      isAdmin ? slaQ : Promise.resolve({ error: null }),
    ]);
    if (results.some((r) => r.error)) {
      toast.error('Erro ao limpar notificações');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['dev-notifications', user.id] });
    queryClient.invalidateQueries({ queryKey: ['digisac-sla-notifications', user.id] });
    toast.success(mode === 'read' ? 'Notificações lidas removidas' : 'Notificações removidas');
    setConfirmMode(null);
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-1 px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notificações</span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={markAllRead}>
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
              </Button>
            )}
            {readCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 px-2"
                onClick={() => setConfirmMode('read')}
                title="Limpar notificações lidas"
              >
                <Eraser className="h-3.5 w-3.5" /> Limpar lidas
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setConfirmMode('all')}
                title="Limpar todas"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">
              Nenhuma notificação ainda.
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.map((item) => {
                if (item.kind === 'sla') {
                  const n = item.data;
                  return (
                    <li key={`sla-${n.id}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSlaClick(n)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSlaClick(n);
                          }
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2.5 hover:bg-accent transition-colors cursor-pointer',
                          !n.read && 'bg-amber-500/10',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 truncate flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            SLA Digisac
                          </span>
                          {!n.read && <span className="h-2 w-2 rounded-full bg-amber-500 mt-1 shrink-0" />}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium break-words leading-snug">
                            Protocolo {n.protocol}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                            title="Copiar protocolo"
                            aria-label={`Copiar protocolo ${n.protocol}`}
                            onClick={(e) => copyProtocol(n.protocol, e)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">
                          {slaNotificationDetail(n)}
                        </p>
                        <div className="flex items-center justify-end gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                }

                const n = item.data;
                return (
                  <li key={`kanban-${n.id}`}>
                    <button
                      onClick={() => handleKanbanClick(n)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 hover:bg-accent transition-colors',
                        !n.read && 'bg-accent/40',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-primary truncate">
                          {ACTION_LABEL[n.action_type] || n.action_type}
                        </span>
                        {!n.read && <span className="h-2 w-2 rounded-full bg-primary mt-1 shrink-0" />}
                      </div>
                      <p className="text-sm break-words leading-snug">{n.message}</p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          <MapPin className="h-2.5 w-2.5" />
                          {BOARD_LABEL[n.card_type] || 'Kanban'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>

      <AlertDialog open={confirmMode !== null} onOpenChange={(o) => !o && setConfirmMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === 'all' ? 'Limpar todas as notificações?' : 'Limpar notificações lidas?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === 'all'
                ? 'Todas as notificações (lidas e não lidas) serão removidas. Esta ação não pode ser desfeita.'
                : 'Apenas as notificações já lidas serão removidas. Esta ação não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmMode && performClear(confirmMode)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}
