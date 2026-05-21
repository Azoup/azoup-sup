import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { assertSupabaseData } from '@/lib/supabaseQuery';
import { dedupeCardLabelRows } from '@/lib/kanbanCardLabels';
import type { DevKanbanBoardData } from '@/lib/devKanbanBoardPatch';
import { DEV_KANBAN_BOARD_QUERY_KEY } from '@/lib/devKanbanBoardPatch';

const DEV_KANBAN_STALE_MS = 2 * 60 * 1000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export async function fetchDevKanbanBoard(): Promise<DevKanbanBoardData> {
  const [columnsRes, analystsRes, developersRes, cardsRes, labelsRes, cardLabelsRes, cardImagesRes] =
    await Promise.all([
      supabase.from('dev_kanban_columns').select('*').order('position'),
      supabase.from('analysts').select('*').eq('status', 'active').order('name'),
      supabase.from('developers').select('*').eq('status', 'active').order('name'),
      supabase.from('dev_kanban_cards').select('*').order('position'),
      supabase.from('dev_kanban_labels').select('*').order('name'),
      supabase.from('dev_kanban_card_labels').select('*, dev_kanban_labels(*)'),
      supabase.from('dev_kanban_card_images').select('*').order('created_at'),
    ]);

  return {
    columns: assertSupabaseData(columnsRes.data, columnsRes.error, 'dev_kanban_columns'),
    analysts: assertSupabaseData(analystsRes.data, analystsRes.error, 'analysts'),
    developers: assertSupabaseData(developersRes.data, developersRes.error, 'developers'),
    cards: assertSupabaseData(cardsRes.data, cardsRes.error, 'dev_kanban_cards'),
    labels: assertSupabaseData(labelsRes.data, labelsRes.error, 'dev_kanban_labels'),
    cardLabels: dedupeCardLabelRows(
      assertSupabaseData(cardLabelsRes.data, cardLabelsRes.error, 'dev_kanban_card_labels') as {
        card_id: string;
        label_id: string;
      }[],
    ),
    cardImages: assertSupabaseData(cardImagesRes.data, cardImagesRes.error, 'dev_kanban_card_images'),
    cachedAt: Date.now(),
  };
}

export function useDevKanbanBoard(enabled: boolean) {
  const { session } = useAuth();

  return useQuery({
    queryKey: DEV_KANBAN_BOARD_QUERY_KEY,
    queryFn: fetchDevKanbanBoard,
    enabled: enabled && !!session?.access_token,
    staleTime: DEV_KANBAN_STALE_MS,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/** Atualiza o board com atraso — evita dezenas de refetch em paralelo (lock do Supabase). */
export function refreshDevKanbanBoard(
  queryClient: ReturnType<typeof useQueryClient>,
  delayMs = 400,
): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void queryClient.invalidateQueries({
      queryKey: DEV_KANBAN_BOARD_QUERY_KEY,
      refetchType: 'active',
    });
  }, delayMs);
}

/** Refetch imediato (ex.: erro ao mover card — reverter UI). */
export function flushDevKanbanBoardRefresh(queryClient: ReturnType<typeof useQueryClient>): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  void queryClient.invalidateQueries({
    queryKey: DEV_KANBAN_BOARD_QUERY_KEY,
    refetchType: 'active',
  });
}
