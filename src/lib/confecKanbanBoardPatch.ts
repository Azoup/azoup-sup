import type { QueryClient } from '@tanstack/react-query';
import { writeConfecKanbanBoardCache } from '@/lib/confecKanbanBoardCache';

export type ConfecKanbanBoardData = {
  columns: unknown[];
  analysts: unknown[];
  developers: unknown[];
  cards: unknown[];
  labels: unknown[];
  cardLabels: unknown[];
  cardImages: unknown[];
  cachedAt: number;
};

export const CONFEC_KANBAN_BOARD_QUERY_KEY = ['confec-kanban-board'] as const;

export function updateConfecKanbanBoardCache(
  queryClient: QueryClient,
  updater: (board: ConfecKanbanBoardData) => ConfecKanbanBoardData,
): void {
  queryClient.setQueryData<ConfecKanbanBoardData>(CONFEC_KANBAN_BOARD_QUERY_KEY, (old) => {
    if (!old) return old;
    const next = { ...updater(old), cachedAt: Date.now() };
    writeConfecKanbanBoardCache(next);
    return next;
  });
}

export function patchConfecKanbanBoardCards(
  queryClient: QueryClient,
  updater: (cards: unknown[]) => unknown[],
): void {
  updateConfecKanbanBoardCache(queryClient, (b) => ({
    ...b,
    cards: updater(b.cards),
  }));
}

export function patchConfecKanbanBoardCardLabels(
  queryClient: QueryClient,
  updater: (cardLabels: unknown[]) => unknown[],
): void {
  updateConfecKanbanBoardCache(queryClient, (b) => ({
    ...b,
    cardLabels: updater(b.cardLabels),
  }));
}

export function patchConfecKanbanBoardColumns(
  queryClient: QueryClient,
  updater: (columns: unknown[]) => unknown[],
): void {
  updateConfecKanbanBoardCache(queryClient, (b) => ({
    ...b,
    columns: updater(b.columns),
  }));
}

export function patchConfecKanbanBoardCardImages(
  queryClient: QueryClient,
  updater: (cardImages: unknown[]) => unknown[],
): void {
  updateConfecKanbanBoardCache(queryClient, (b) => ({
    ...b,
    cardImages: updater(b.cardImages),
  }));
}
