import { supabase } from '@/integrations/supabase/client';
import type { KanbanCardLike, KanbanCardPositionUpdate } from '@/lib/kanbanCardReorder';
import { filterChangedPositionUpdates } from '@/lib/kanbanCardReorder';

type PersistOptions = {
  draggableId: string;
  completedAtOnMove?: string | null;
};

async function updateCardPosition(
  id: string,
  status: string,
  position: number,
  completedAt?: string | null,
): Promise<void> {
  const payload: Record<string, unknown> = { status, position };
  if (completedAt !== undefined) payload.completed_at = completedAt;

  let { error } = await supabase.from('dev_kanban_cards').update(payload).eq('id', id);
  if (error && `${error.message}`.toLowerCase().includes('completed_at')) {
    const retry = await supabase.from('dev_kanban_cards').update({ status, position }).eq('id', id);
    error = retry.error;
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
      ),
    ),
  );
}
