export type KanbanCardLike = {
  id: string;
  status: string;
  position?: number | null;
};

export type KanbanCardPositionUpdate = {
  id: string;
  status: string;
  position: number;
};

/** Cards de uma coluna ordenados por position. */
export function sortKanbanCardsByPosition<T extends KanbanCardLike>(cards: T[]): T[] {
  return [...cards].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** Recalcula status/position de todos os cards afetados por um drag-and-drop. */
export function computeKanbanDragPositionUpdates(
  allCards: KanbanCardLike[],
  draggableId: string,
  sourceColumn: string,
  destColumn: string,
  sourceIndex: number,
  destIndex: number,
): KanbanCardPositionUpdate[] {
  const byColumn: Record<string, KanbanCardLike[]> = {};
  for (const card of allCards) {
    if (!byColumn[card.status]) byColumn[card.status] = [];
    byColumn[card.status].push(card);
  }
  for (const slug of Object.keys(byColumn)) {
    byColumn[slug] = sortKanbanCardsByPosition(byColumn[slug]);
  }

  const sourceCards = [...(byColumn[sourceColumn] || [])];
  const fromIdx = sourceCards.findIndex((c) => c.id === draggableId);
  if (fromIdx === -1) return [];

  const [moved] = sourceCards.splice(fromIdx, 1);

  if (sourceColumn === destColumn) {
    sourceCards.splice(destIndex, 0, moved);
    return sourceCards.map((card, position) => ({
      id: card.id,
      status: sourceColumn,
      position,
    }));
  }

  const destCards = [...(byColumn[destColumn] || [])];
  destCards.splice(destIndex, 0, moved);

  const updates: KanbanCardPositionUpdate[] = [];
  sourceCards.forEach((card, position) => {
    updates.push({ id: card.id, status: sourceColumn, position });
  });
  destCards.forEach((card, position) => {
    updates.push({
      id: card.id,
      status: destColumn,
      position,
    });
  });
  return updates;
}
