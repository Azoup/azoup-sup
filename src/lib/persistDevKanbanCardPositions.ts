import { supabase } from '@/integrations/supabase/client';
import type { KanbanCardLike, KanbanCardPositionUpdate } from '@/lib/kanbanCardReorder';
import { filterChangedPositionUpdates } from '@/lib/kanbanCardReorder';

type PersistOptions = {
  draggableId: string;
  completedAtOnMove?: string | null;
  releasedAtOnMove?: string | null;
};

async function updateCardPosition(
  id: string,
  status: string,
  position: number,
  completedAt?: string | null,
  releasedAt?: string | null,
): Promise<void> {
  const payload: Record<string, unknown> = { status, position };
  if (completedAt !== undefined) payload.completed_at = completedAt;
  if (releasedAt !== undefined) payload.released_at = releasedAt;

  let { error } = await supabase.from('dev_kanban_cards').update(payload).eq('id', id);
  if (error) {
    const message = `${error.message}`.toLowerCase();
    const retryPayload = { ...payload };
    let shouldRetry = false;
    if (message.includes('completed_at')) {
      delete retryPayload.completed_at;
      shouldRetry = true;
    }
    if (message.includes('released_at')) {
      delete retryPayload.released_at;
      shouldRetry = true;
    }
    if (shouldRetry) {
      const retry = await supabase.from('dev_kanban_cards').update(retryPayload).eq('id', id);
      error = retry.error;
    }
  }
  if (error) throw error;
}

/** Persiste apenas as posições que mudaram (menos requisições, mais rápido). */
export async function persistDevKanbanCardPositions(
  allCards: KanbanCardLike[],
  updates: KanbanCardPositionUpdate[],
  options: PersistOptions,
): Promise<void> {
  const changed = filterChangedPositionUpdates(allCards, updates);
  if (changed.length === 0) return;

  await Promise.all(
    changed.map(({ id, status, position }) =>
      updateCardPosition(
        id,
        status,
        position,
        id === options.draggableId ? options.completedAtOnMove : undefined,
        id === options.draggableId ? options.releasedAtOnMove : undefined,
      ),
    ),
  );
}
