import { supabase } from '@/integrations/supabase/client';
import { assertSupabaseData } from '@/lib/supabaseQuery';
import { dedupeCardLabelRows } from '@/lib/kanbanCardLabels';
import type { DevKanbanBoardData } from '@/lib/devKanbanBoardPatch';

const API_TIMEOUT_MS = 10_000;

async function fetchDevKanbanBoardViaApi(accessToken: string): Promise<DevKanbanBoardData | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch('/api/dev-kanban-board', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Omit<DevKanbanBoardData, 'cachedAt'>;
    return { ...data, cachedAt: Date.now() };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchDevKanbanBoardViaProxy(): Promise<DevKanbanBoardData | null> {
  try {
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
  } catch {
    return null;
  }
}

export async function fetchDevKanbanBoard(accessToken?: string): Promise<DevKanbanBoardData> {
  if (accessToken) {
    const fromApi = await fetchDevKanbanBoardViaApi(accessToken);
    if (fromApi) return fromApi;
  }
  const fromProxy = await fetchDevKanbanBoardViaProxy();
  if (fromProxy) return fromProxy;
  return {
    columns: [],
    analysts: [],
    developers: [],
    cards: [],
    labels: [],
    cardLabels: [],
    cardImages: [],
    cachedAt: Date.now(),
  };
}
