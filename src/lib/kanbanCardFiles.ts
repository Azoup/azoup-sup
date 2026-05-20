import { supabase } from '@/integrations/supabase/client';

export type KanbanCardFileRow = {
  id: string;
  card_id: string;
  file_url: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

function isBenignFilesError(error: { code?: string; message?: string }): boolean {
  const msg = error.message || '';
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST301' ||
    /does not exist|relation.*not found|permission denied/i.test(msg)
  );
}

/** Lista anexos do card; falhas benignas → lista vazia (sem UI de erro). */
export async function fetchKanbanCardFiles(cardId: string): Promise<KanbanCardFileRow[]> {
  const { data, error } = await supabase
    .from('kanban_card_files')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });

  if (error) {
    if (!isBenignFilesError(error)) {
      console.warn('[kanban_card_files]', error.message);
    }
    return [];
  }
  return (data ?? []) as KanbanCardFileRow[];
}
