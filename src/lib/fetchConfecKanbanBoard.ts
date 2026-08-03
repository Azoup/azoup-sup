import { supabase } from '@/integrations/supabase/client';
import { shouldRejectEmptyBoardFetch } from '@/lib/boardFetchSafety';
import { assertSupabaseData } from '@/lib/supabaseQuery';
import { dedupeCardLabelRows } from '@/lib/kanbanCardLabels';
import type { ConfecKanbanBoardData } from '@/lib/confecKanbanBoardPatch';
import { readConfecKanbanBoardCache } from '@/lib/confecKanbanBoardCache';

const API_TIMEOUT_MS = 10_000;

async function fetchConfecKanbanBoardViaApi(accessToken: string): Promise<ConfecKanbanBoardData | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch('/api/confec-kanban-board', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Omit<ConfecKanbanBoardData, 'cachedAt'>;
    return { ...data, cachedAt: Date.now() };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchConfecKanbanBoardViaProxy(): Promise<ConfecKanbanBoardData | null> {
  try {
    const [columnsRes, analystsRes, developersRes, cardsRes, labelsRes, cardLabelsRes, cardImagesRes] =
      await Promise.all([
        supabase.from('confec_kanban_columns').select('*').order('position'),
        supabase.from('analysts').select('*').eq('status', 'active').order('name'),
        supabase.from('developers').select('*').eq('status', 'active').order('name'),
        supabase.from('confec_kanban_cards').select('*').order('position'),
        supabase.from('confec_kanban_labels').select('*').order('name'),
        supabase.from('confec_kanban_card_labels').select('*, confec_kanban_labels(*)'),
        supabase.from('confec_kanban_card_images').select('*').order('created_at'),
      ]);

    return {
      columns: assertSupabaseData(columnsRes.data, columnsRes.error, 'confec_kanban_columns'),
      analysts: assertSupabaseData(analystsRes.data, analystsRes.error, 'analysts'),
      developers: assertSupabaseData(developersRes.data, developersRes.error, 'developers'),
      cards: assertSupabaseData(cardsRes.data, cardsRes.error, 'confec_kanban_cards'),
      labels: assertSupabaseData(labelsRes.data, labelsRes.error, 'confec_kanban_labels'),
      cardLabels: dedupeCardLabelRows(
        assertSupabaseData(cardLabelsRes.data, cardLabelsRes.error, 'confec_kanban_card_labels') as {
          card_id: string;
          label_id: string;
        }[],
      ),
      cardImages: assertSupabaseData(cardImagesRes.data, cardImagesRes.error, 'confec_kanban_card_images'),
      cachedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function fetchConfecKanbanBoard(accessToken?: string): Promise<ConfecKanbanBoardData> {
  const fallback = readConfecKanbanBoardCache();

  if (accessToken) {
    const fromApi = await fetchConfecKanbanBoardViaApi(accessToken);
    if (fromApi && !shouldRejectEmptyBoardFetch(fromApi, fallback)) return fromApi;
  }
  const fromProxy = await fetchConfecKanbanBoardViaProxy();
  if (fromProxy && !shouldRejectEmptyBoardFetch(fromProxy, fallback)) return fromProxy;

  if (fallback) return fallback;

  throw new Error('Não foi possível carregar o quadro Confec. Verifique a conexão e tente novamente.');
}
