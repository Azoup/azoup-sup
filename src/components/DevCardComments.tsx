import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { notifyDevAndAnalyst } from '@/hooks/useDevNotifications';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Send, Loader2 } from 'lucide-react';
import { QueryLoadState } from '@/components/QueryLoadState';
import { toast } from 'sonner';
import { DEV_NOTES_SYSTEM_EMAIL } from '@/lib/devKanbanDevNotes';
import { devTicketLabel } from '@/lib/devKanbanTicketNumber';
import { fetchCommentAuthorProfiles } from '@/lib/commentAuthorProfiles';
import { actorNameFromUser } from '@/lib/actorName';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DevCardCommentsProps {
  cardId: string;
}

type DevCommentRow = {
  id: string;
  card_id: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
  display_name: string;
  photo_url: string;
};

async function fetchDevCardComments(cardId: string): Promise<DevCommentRow[]> {
  const { data, error } = await supabase
    .from('dev_kanban_card_comments')
    .select('*')
    .eq('card_id', cardId)
    .neq('user_email', DEV_NOTES_SYSTEM_EMAIL)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const profileMap = await fetchCommentAuthorProfiles(rows.map((c) => c.user_id));

  return rows.map((c) => ({
    ...c,
    display_name: profileMap[c.user_id]?.name || c.user_email?.split('@')[0] || '?',
    photo_url: profileMap[c.user_id]?.photo_url || '',
  }));
}

export function DevCardComments({ cardId }: DevCardCommentsProps) {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const { data: comments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['dev-card-comments', cardId],
    queryFn: () => fetchDevCardComments(cardId),
    enabled: !!cardId,
    staleTime: 30_000,
    retry: 1,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`dev-comments-${cardId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'dev_kanban_card_comments',
        filter: `card_id=eq.${cardId}`,
      }, () => {
        void queryClient.invalidateQueries({ queryKey: ['dev-card-comments', cardId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cardId, queryClient]);

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await supabase
        .from('dev_kanban_card_comments')
        .insert({
          card_id: cardId,
          user_id: user!.id,
          user_email: user!.email || '',
          content,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async (content: string) => {
      await queryClient.cancelQueries({ queryKey: ['dev-card-comments', cardId] });
      const previous = queryClient.getQueryData<DevCommentRow[]>(['dev-card-comments', cardId]);
      const optimistic: DevCommentRow = {
        id: `optimistic-${Date.now()}`,
        card_id: cardId,
        user_id: user!.id,
        user_email: user!.email || '',
        content,
        created_at: new Date().toISOString(),
        display_name: actorNameFromUser(user),
        photo_url: (user?.user_metadata as { avatar_url?: string })?.avatar_url || '',
      };
      queryClient.setQueryData<DevCommentRow[]>(['dev-card-comments', cardId], (old = []) => [
        optimistic,
        ...old,
      ]);
      setText('');
      return { previous, content };
    },
    onError: (_err, _content, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['dev-card-comments', cardId], ctx.previous);
      }
      if (ctx?.content) setText(ctx.content);
      toast.error('Erro ao adicionar comentário');
    },
    onSuccess: (inserted, _content, ctx) => {
      if (inserted) {
        queryClient.setQueryData<DevCommentRow[]>(['dev-card-comments', cardId], (old = []) => {
          const withoutOptimistic = old.filter((c) => !c.id.startsWith('optimistic-'));
          const profileMap = queryClient.getQueryData<Record<string, { name: string; photo_url: string }>>(
            ['dev-card-comment-author', user?.id],
          );
          const row: DevCommentRow = {
            ...inserted,
            display_name: profileMap?.[inserted.user_id]?.name || actorNameFromUser(user),
            photo_url: profileMap?.[inserted.user_id]?.photo_url || '',
          };
          return [row, ...withoutOptimistic];
        });
      }
      void (async () => {
        try {
          const { data: card } = await supabase
            .from('dev_kanban_cards')
            .select('title, ticket_number, developer_id, analyst_id')
            .eq('id', cardId)
            .maybeSingle();
          if (!card || (!card.developer_id && !card.analyst_id)) return;
          const actorName = actorNameFromUser(user);
          await notifyDevAndAnalyst({
            cardId,
            cardTitle: card.title,
            developerId: card.developer_id,
            analystId: card.analyst_id,
            actionType: 'comment',
            actorId: user?.id,
            actorName,
            message: `${actorName} comentou no ticket ${devTicketLabel(card.ticket_number, card.title)}`,
          });
        } catch (e) {
          console.warn('[DevCardComments] notify failed:', e);
        }
      })();
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dev_kanban_card_comments').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<DevCommentRow[]>(['dev-card-comments', cardId], (old = []) =>
        old.filter((c) => c.id !== id),
      );
      toast.success('Comentário excluído');
    },
    onError: () => toast.error('Erro ao excluir comentário'),
  });

  const handleSubmit = () => {
    const content = text.trim();
    if (!content || addComment.isPending) return;
    addComment.mutate(content);
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

      <QueryLoadState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">Nenhum comentário ainda.</p>
      ) : (
        <ScrollArea className="max-h-60">
          <div className="space-y-3 pr-2">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2 group">
                <ProfileAvatar
                  className="h-7 w-7 shrink-0 mt-0.5"
                  photoUrl={c.photo_url}
                  fallbackLabel={c.display_name}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{c.display_name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </span>
                    {(c.user_id === user?.id || isAdmin) && !c.id.startsWith('optimistic-') && (
                      <button
                        type="button"
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
