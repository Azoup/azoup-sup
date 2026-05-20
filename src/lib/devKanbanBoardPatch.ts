import type { QueryClient } from '@tanstack/react-query';

export type DevKanbanBoardData = {
  columns: unknown[];
  analysts: unknown[];
  developers: unknown[];
  cards: unknown[];
  labels: unknown[];
  cardLabels: unknown[];
  cardImages: unknown[];
  cachedAt: number;
};

export const DEV_KANBAN_BOARD_QUERY_KEY = ['dev-kanban-board'] as const;

export function updateDevKanbanBoardCache(
  queryClient: QueryClient,
  updater: (board: DevKanbanBoardData) => DevKanbanBoardData,
): void {
  queryClient.setQueryData<DevKanbanBoardData>(DEV_KANBAN_BOARD_QUERY_KEY, (old) => {
    if (!old) return old;
    return { ...updater(old), cachedAt: Date.now() };
  });
}

export function patchDevKanbanBoardCards(
  queryClient: QueryClient,
  updater: (cards: unknown[]) => unknown[],
): void {
  updateDevKanbanBoardCache(queryClient, (b) => ({
    ...b,
    cards: updater(b.cards),
  }));
}

export function patchDevKanbanBoardCardLabels(
  queryClient: QueryClient,
  updater: (cardLabels: unknown[]) => unknown[],
): void {
  updateDevKanbanBoardCache(queryClient, (b) => ({
    ...b,
    cardLabels: updater(b.cardLabels),
  }));
}

export function patchDevKanbanBoardColumns(
  queryClient: QueryClient,
  updater: (columns: unknown[]) => unknown[],
): void {
  updateDevKanbanBoardCache(queryClient, (b) => ({
    ...b,
    columns: updater(b.columns),
  }));
}
