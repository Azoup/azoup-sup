import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, MapPin, Trash2, Eraser } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
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

export function NotificationsBell() {
  const { user } = useAuth();
  const { canView } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<null | 'read' | 'all'>(null);

  const { data: notifications = [] } = useQuery({
    queryKey: ['dev-notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from('dev_kanban_notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!user,
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

  const unreadCount = notifications.filter((n: any) => !n.read).length;

  const handleClick = async (n: any) => {
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

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    await (supabase as any)
      .from('dev_kanban_notifications')
      .update({ read: true })
      .eq('recipient_id', user.id)
      .eq('read', false);
    queryClient.invalidateQueries({ queryKey: ['dev-notifications', user.id] });
  };

  const readCount = notifications.length - unreadCount;

  const performClear = async (mode: 'read' | 'all') => {
    if (!user) return;
    let q = (supabase as any)
      .from('dev_kanban_notifications')
      .delete()
      .eq('recipient_id', user.id);
    if (mode === 'read') q = q.eq('read', true);
    const { error } = await q;
    if (error) {
      toast.error('Erro ao limpar notificações');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['dev-notifications', user.id] });
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
        <ScrollArea className="max-h-96">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">
              Nenhuma notificação ainda.
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.map((n: any) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
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
              ))}
            </ul>
          )}
        </ScrollArea>
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
