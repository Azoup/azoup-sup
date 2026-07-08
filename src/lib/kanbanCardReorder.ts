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

/** Mantém apenas cards cujo status ou position realmente mudou. */
export function filterChangedPositionUpdates(
  allCards: KanbanCardLike[],
  updates: KanbanCardPositionUpdate[],
): KanbanCardPositionUpdate[] {
  const byId = new Map(allCards.map((card) => [card.id, card]));
  return updates.filter((update) => {
    const current = byId.get(update.id);
    if (!current) return true;
    return (
      current.status !== update.status ||
      (current.position ?? 0) !== update.position
    );
  });
}

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

/** Reordena cards visíveis mantendo cards ocultos (por filtro) nas posições relativas. */
export function applyVisibleReorderToColumn(
  allInColumn: KanbanCardLike[],
  visibleInColumn: KanbanCardLike[],
  sourceVisibleIndex: number,
  destVisibleIndex: number,
): KanbanCardLike[] {
  const visible = [...visibleInColumn];
  const [moved] = visible.splice(sourceVisibleIndex, 1);
  visible.splice(destVisibleIndex, 0, moved);

  const visibleIds = new Set(visibleInColumn.map((c) => c.id));
  const queue = [...visible];
  return sortKanbanCardsByPosition(allInColumn).map((card) => {
    if (visibleIds.has(card.id)) return queue.shift()!;
    return card;
  });
}

/** Converte índice na lista filtrada para índice na lista completa da coluna. */
export function mapVisibleDestIndexToFull(
  allColumnCards: KanbanCardLike[],
  visibleColumnCards: KanbanCardLike[],
  visibleDestIndex: number,
  draggableId: string,
  sourceColumn: string,
  destColumn: string,
): number {
  const sortedAll = sortKanbanCardsByPosition(allColumnCards);
  const visible =
    sourceColumn === destColumn
      ? visibleColumnCards
      : visibleColumnCards.filter((c) => c.id !== draggableId);

  if (visibleDestIndex <= 0) {
    if (visible.length === 0) return 0;
    const idx = sortedAll.findIndex((c) => c.id === visible[0].id);
    return idx === -1 ? 0 : idx;
  }

  if (visibleDestIndex >= visible.length) {
    if (visible.length === 0) return sortedAll.length;
    const lastId = visible[visible.length - 1].id;
    const idx = sortedAll.findIndex((c) => c.id === lastId);
    return idx === -1 ? sortedAll.length : idx + 1;
  }

  const beforeId = visible[visibleDestIndex].id;
  const idx = sortedAll.findIndex((c) => c.id === beforeId);
  return idx === -1 ? sortedAll.length : idx;
}

/**
 * Calcula updates de drag quando a UI mostra apenas um subconjunto de cards (filtros ativos).
 */
export function computeKanbanDragPositionUpdatesWithVisible(
  allCards: KanbanCardLike[],
  visibleByColumn: Record<string, KanbanCardLike[]>,
  draggableId: string,
  sourceColumn: string,
  destColumn: string,
  sourceVisibleIndex: number,
  destVisibleIndex: number,
): KanbanCardPositionUpdate[] {
  if (sourceColumn === destColumn) {
    const allInCol = allCards.filter((c) => c.status === sourceColumn);
    const visible = visibleByColumn[sourceColumn] || [];
    const reordered = applyVisibleReorderToColumn(
      allInCol,
      visible,
      sourceVisibleIndex,
      destVisibleIndex,
    );
    return reordered.map((card, position) => ({
      id: card.id,
      status: sourceColumn,
      position,
    }));
  }

  const destAll = allCards.filter((c) => c.status === destColumn);
  const visibleDest = visibleByColumn[destColumn] || [];
  const destFullIndex = mapVisibleDestIndexToFull(
    destAll,
    visibleDest,
    destVisibleIndex,
    draggableId,
    sourceColumn,
    destColumn,
  );
  const sourceAll = allCards.filter((c) => c.status === sourceColumn);
  const sourceFullIndex = sortKanbanCardsByPosition(sourceAll).findIndex((c) => c.id === draggableId);
  if (sourceFullIndex === -1) return [];

  return computeKanbanDragPositionUpdates(
    allCards,
    draggableId,
    sourceColumn,
    destColumn,
    sourceFullIndex,
    destFullIndex,
  );
}
