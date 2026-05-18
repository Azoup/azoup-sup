import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Send, Loader2 } from 'lucide-react';
import { QueryLoadState } from '@/components/QueryLoadState';
import { runTimedQuery } from '@/lib/supabaseTimedQuery';
import { toast } from 'sonner';
import { notifySupportResponsible } from '@/hooks/useDevNotifications';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CardCommentsProps {
  cardId: string;
}

export function CardComments({ cardId }: CardCommentsProps) {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const { data: comments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['card-comments', cardId],
    queryFn: async () =>
      runTimedQuery(async () => {
        const { data, error } = await supabase
          .from('kanban_card_comments')
          .select('*')
          .eq('card_id', cardId)
          .order('created_at', { ascending: false });
        if (error) throw error;

        const userIds = [...new Set((data || []).map((c: any) => c.user_id))];
        let profileMap: Record<string, { name: string; photo_url: string }> = {};
        if (userIds.length > 0) {
          const [{ data: profiles }, { data: analysts }, { data: developers }] = await Promise.all([
            supabase.from('profiles').select('id, display_name, photo_url').in('id', userIds),
            supabase.from('analysts').select('name, photo_url'),
            supabase.from('developers').select('name, photo_url'),
          ]);
          const byName: Record<string, string> = {};
          (analysts || []).forEach((a: any) => { if (a.name && a.photo_url) byName[a.name.toLowerCase()] = a.photo_url; });
          (developers || []).forEach((d: any) => { if (d.name && d.photo_url) byName[d.name.toLowerCase()] = d.photo_url; });
          (profiles || []).forEach((p: any) => {
            const name = p.display_name || '';
            const photo = p.photo_url || byName[name.toLowerCase()] || '';
            profileMap[p.id] = { name, photo_url: photo };
          });
        }

        return (data || []).map((c: any) => ({
          ...c,
          display_name: profileMap[c.user_id]?.name || c.user_email?.split('@')[0] || '?',
          photo_url: profileMap[c.user_id]?.photo_url || '',
        }));
      }),
    enabled: !!cardId,
    retry: 1,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`comments-${cardId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'kanban_card_comments',
        filter: `card_id=eq.${cardId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['card-comments', cardId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cardId, queryClient]);

  const addComment = useMutation({
    mutationFn: async () => {
      const content = text.trim();
      const { error } = await supabase.from('kanban_card_comments').insert({
        card_id: cardId,
        user_id: user!.id,
        user_email: user!.email || '',
        content,
      });
      if (error) throw error;

      // Fire support notification using the same pattern as DEV, preserving the original helper.
      try {
        const { data: card } = await supabase
          .from('kanban_cards')
          .select('title, analyst_id')
          .eq('id', cardId)
          .maybeSingle();
        if (card?.analyst_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user!.id)
            .maybeSingle();
          const actorName = profile?.display_name || user!.email?.split('@')[0] || 'Alguém';
          const notificationPayload = {
            cardId,
            cardTitle: card.title,
            analystId: card.analyst_id,
            actionType: 'comment' as const,
            actorId: user!.id,
            actorName,
            message: `${actorName} comentou no ticket "${card.title}" 📍 Kanban Pendências`,
          };

          await notifySupportResponsible(notificationPayload);
        }
      } catch (e) {
        console.warn('[CardComments] notify failed:', e);
      }
    },
    onSuccess: () => {
      setText('');
      queryClient.invalidateQueries({ queryKey: ['card-comments', cardId] });
    },
    onError: () => toast.error('Erro ao adicionar comentário'),
  });

  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kanban_card_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card-comments', cardId] });
      toast.success('Comentário excluído');
    },
    onError: () => toast.error('Erro ao excluir comentário'),
  });

  const handleSubmit = () => {
    if (!text.trim()) return;
    addComment.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Comentários e Atividade</p>

      {/* Input */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Escrever um comentário..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[60px] text-sm flex-1"
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!text.trim() || addComment.isPending}
          className="shrink-0 self-end"
        >
          {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {/* List */}
      <QueryLoadState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">Nenhum comentário ainda.</p>
      ) : (
        <ScrollArea className="max-h-60">
          <div className="space-y-3 pr-2">
            {comments.map((c: any) => (
              <div key={c.id} className="flex gap-2 group">
                <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                  {c.photo_url && <AvatarImage src={c.photo_url} alt={c.display_name} />}
                  <AvatarFallback className="text-[10px] bg-muted">
                    {(c.display_name || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{c.display_name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </span>
                    {(c.user_id === user?.id || isAdmin) && (
                      <button
                        onClick={() => deleteComment.mutate(c.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity ml-auto"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      </QueryLoadState>
    </div>
  );
}
