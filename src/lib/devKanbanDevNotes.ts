import { supabase } from '@/integrations/supabase/client';

/** Comentário reservado quando a coluna dev_notes ainda não existe no banco. */
export const DEV_NOTES_SYSTEM_EMAIL = '__dev_notes__@system.local';

export function isDevNotesSchemaError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes('dev_notes') && (m.includes('schema cache') || m.includes('column'));
}

export async function loadDevKanbanDevNotes(
  cardId: string,
  fromColumn?: string | null,
): Promise<string> {
  if (fromColumn?.trim()) return fromColumn.trim();

  const { data, error } = await supabase
    .from('dev_kanban_card_comments')
    .select('content')
    .eq('card_id', cardId)
    .eq('user_email', DEV_NOTES_SYSTEM_EMAIL)
    .maybeSingle();

  if (error) throw error;
  return (data?.content || '').trim();
}

async function clearDevNotesCommentFallback(cardId: string): Promise<void> {
  await supabase
    .from('dev_kanban_card_comments')
    .delete()
    .eq('card_id', cardId)
    .eq('user_email', DEV_NOTES_SYSTEM_EMAIL);
}

async function persistDevNotesCommentFallback(
  cardId: string,
  notes: string | null,
  userId: string,
  userEmail: string,
): Promise<void> {
  const trimmed = notes?.trim() || null;

  const { data: existing, error: findErr } = await supabase
    .from('dev_kanban_card_comments')
    .select('id')
    .eq('card_id', cardId)
    .eq('user_email', DEV_NOTES_SYSTEM_EMAIL)
    .maybeSingle();

  if (findErr) throw findErr;

  if (!trimmed) {
    if (existing?.id) {
      const { error } = await supabase.from('dev_kanban_card_comments').delete().eq('id', existing.id);
      if (error) throw error;
    }
    return;
  }

  if (existing?.id) {
    const { error } = await supabase
      .from('dev_kanban_card_comments')
      .update({ content: trimmed })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('dev_kanban_card_comments').insert({
    card_id: cardId,
    user_id: userId,
    user_email: DEV_NOTES_SYSTEM_EMAIL,
    content: trimmed,
  });
  if (error) throw error;
}

/** Salva observações DEV na coluna dev_notes ou, se ausente no banco, em comentário reservado. */
export async function saveDevKanbanDevNotes(
  cardId: string,
  notes: string | null,
  userId: string,
  userEmail: string,
): Promise<'column' | 'comment'> {
  const trimmed = notes?.trim() || null;

  const { error } = await supabase
    .from('dev_kanban_cards')
    .update({ dev_notes: trimmed })
    .eq('id', cardId);

  if (!error) {
    await clearDevNotesCommentFallback(cardId);
    return 'column';
  }

  if (!isDevNotesSchemaError(error.message)) throw error;

  await persistDevNotesCommentFallback(cardId, trimmed, userId, userEmail);
  return 'comment';
}
