import { supabase } from '@/integrations/supabase/client';
import { shouldRejectEmptyBoardFetch } from '@/lib/boardFetchSafety';
import { assertSupabaseData } from '@/lib/supabaseQuery';
import { dedupeCardLabelRows } from '@/lib/kanbanCardLabels';
import type { KanbanBoardData } from '@/lib/kanbanBoardCache';
import { readKanbanBoardCache } from '@/lib/kanbanBoardCache';

const API_TIMEOUT_MS = 8_000;

async function fetchKanbanBoardViaApi(accessToken: string): Promise<KanbanBoardData | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch('/api/kanban-board', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Omit<KanbanBoardData, 'cachedAt'>;
    return { ...data, cachedAt: Date.now() };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchKanbanBoardViaProxy(): Promise<KanbanBoardData | null> {
  try {
    const [columnsRes, analystsRes, cardsRes, labelsRes, cardLabelsRes, cardImagesRes] =
      await Promise.all([
        supabase.from('kanban_columns').select('*').order('position'),
        supabase.from('analysts').select('*').eq('status', 'active').order('name'),
        supabase.from('kanban_cards').select('*').order('position'),
        supabase.from('kanban_labels').select('*').order('name'),
        supabase.from('kanban_card_labels').select('*, kanban_labels(*)'),
        supabase.from('kanban_card_images').select('*').order('created_at'),
      ]);

    return {
      columns: assertSupabaseData(columnsRes.data, columnsRes.error, 'kanban_columns'),
      analysts: assertSupabaseData(analystsRes.data, analystsRes.error, 'analysts'),
      cards: assertSupabaseData(cardsRes.data, cardsRes.error, 'kanban_cards'),
      labels: assertSupabaseData(labelsRes.data, labelsRes.error, 'kanban_labels'),
      cardLabels: dedupeCardLabelRows(
        assertSupabaseData(cardLabelsRes.data, cardLabelsRes.error, 'kanban_card_labels') as {
          card_id: string;
          label_id: string;
        }[],
      ),
      cardImages: assertSupabaseData(cardImagesRes.data, cardImagesRes.error, 'kanban_card_images'),
      cachedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function fetchKanbanBoard(accessToken?: string): Promise<KanbanBoardData> {
  const fallback = readKanbanBoardCache();

  if (accessToken) {
    const fromApi = await fetchKanbanBoardViaApi(accessToken);
    if (fromApi && !shouldRejectEmptyBoardFetch(fromApi, fallback)) return fromApi;
  }
  const fromProxy = await fetchKanbanBoardViaProxy();
  if (fromProxy && !shouldRejectEmptyBoardFetch(fromProxy, fallback)) return fromProxy;

  if (fallback) return fallback;

  throw new Error('Não foi possível carregar o quadro Kanban. Verifique a conexão e tente novamente.');
}
