import type { QueryClient } from '@tanstack/react-query';
import type { KanbanBoardData } from '@/lib/kanbanBoardCache';
import { writeKanbanBoardCache } from '@/lib/kanbanBoardCache';

export const KANBAN_BOARD_QUERY_KEY = ['kanban-board'] as const;

export function updateKanbanBoardCache(
  queryClient: QueryClient,
  updater: (board: KanbanBoardData) => KanbanBoardData,
): void {
  queryClient.setQueryData<KanbanBoardData>(KANBAN_BOARD_QUERY_KEY, (old) => {
    if (!old) return old;
    const next = { ...updater(old), cachedAt: Date.now() };
    writeKanbanBoardCache(next);
    return next;
  });
}

export function patchKanbanBoardCards(
  queryClient: QueryClient,
  updater: (cards: unknown[]) => unknown[],
): void {
  updateKanbanBoardCache(queryClient, (b) => ({
    ...b,
    cards: updater(b.cards),
  }));
}

export function patchKanbanBoardCardLabels(
  queryClient: QueryClient,
  updater: (cardLabels: unknown[]) => unknown[],
): void {
  updateKanbanBoardCache(queryClient, (b) => ({
    ...b,
    cardLabels: updater(b.cardLabels),
  }));
}

export function patchKanbanBoardColumns(
  queryClient: QueryClient,
  updater: (columns: unknown[]) => unknown[],
): void {
  updateKanbanBoardCache(queryClient, (b) => ({
    ...b,
    columns: updater(b.columns),
  }));
}

export function patchKanbanBoardCardImages(
  queryClient: QueryClient,
  updater: (cardImages: unknown[]) => unknown[],
): void {
  updateKanbanBoardCache(queryClient, (b) => ({
    ...b,
    cardImages: updater(b.cardImages),
  }));
}
