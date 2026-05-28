import type { QueryClient } from '@tanstack/react-query';
import { consumeBoardRealtimeSkip } from '@/lib/boardRefreshGuard';
import { invalidateKanbanBoard } from '@/hooks/useKanbanBoard';
import { refreshDevKanbanBoard } from '@/hooks/useDevKanbanBoard';
/** Tabelas com postgres_changes na publicação Supabase Realtime. */
export const APP_REALTIME_TABLES = [
  'kanban_cards',
  'kanban_card_images',
  'kanban_columns',
  'kanban_labels',
  'kanban_card_labels',
  'kanban_card_files',
  'kanban_card_checklist',
  'kanban_card_comments',
  'dev_kanban_cards',
  'dev_kanban_card_images',
  'dev_kanban_columns',
  'dev_kanban_labels',
  'dev_kanban_card_labels',
  'dev_kanban_card_files',
  'dev_kanban_card_comments',
  'dev_kanban_notifications',
  'doubt_records',
] as const;

const SUPPORT_BOARD_TABLES = new Set([
  'kanban_cards',
  'kanban_card_images',
  'kanban_columns',
  'kanban_labels',
  'kanban_card_labels',
  'kanban_card_files',
  'kanban_card_checklist',
]);

const DEV_BOARD_TABLES = new Set([
  'dev_kanban_cards',
  'dev_kanban_card_images',
  'dev_kanban_columns',
  'dev_kanban_labels',
  'dev_kanban_card_labels',
  'dev_kanban_card_files',
  'dev_kanban_card_checklist',
]);

function invalidateSupportKanbanViews(queryClient: QueryClient): void {
  invalidateKanbanBoard(queryClient);
  void queryClient.invalidateQueries({ queryKey: ['kanban-columns'] });
  void queryClient.invalidateQueries({ queryKey: ['kanban-cards'] });
  void queryClient.invalidateQueries({ queryKey: ['kanban-card-labels'] });
  void queryClient.invalidateQueries({ queryKey: ['kanban-labels'] });
  void queryClient.invalidateQueries({ queryKey: ['checklist-progress-map', 'kanban'] });
  void queryClient.invalidateQueries({ queryKey: ['card-files'] });
}

function invalidateDevKanbanViews(queryClient: QueryClient): void {
  refreshDevKanbanBoard(queryClient);
  void queryClient.invalidateQueries({ queryKey: ['dev-kanban-columns'] });
  void queryClient.invalidateQueries({ queryKey: ['dev-kanban-cards-dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['dev-kanban-card-labels-dash'] });
  void queryClient.invalidateQueries({ queryKey: ['checklist-progress-map', 'dev'] });
  void queryClient.invalidateQueries({ queryKey: ['dev-card-files'] });
}

function invalidateDoubtRecords(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['doubt-records'] });
  void queryClient.invalidateQueries({ queryKey: ['doubt-records-all'] });
  void queryClient.invalidateQueries({ queryKey: ['bu-records'] });
  void queryClient.invalidateQueries({ queryKey: ['bu-records-dashboard'] });
}

/** Reage a um evento Realtime e invalida caches React Query afetados. */
export function handleAppRealtimeTableChange(
  table: string,
  queryClient: QueryClient,
): void {
  if (SUPPORT_BOARD_TABLES.has(table)) {
    if (consumeBoardRealtimeSkip()) return;
    invalidateSupportKanbanViews(queryClient);
    return;
  }

  if (DEV_BOARD_TABLES.has(table)) {
    if (consumeBoardRealtimeSkip()) return;
    invalidateDevKanbanViews(queryClient);
    return;
  }

  if (table === 'doubt_records') {
    invalidateDoubtRecords(queryClient);
    return;
  }

  if (table === 'kanban_card_comments') {
    void queryClient.invalidateQueries({ queryKey: ['card-comments'] });
    return;
  }

  if (table === 'dev_kanban_card_comments') {
    void queryClient.invalidateQueries({ queryKey: ['dev-card-comments'] });
    return;
  }

  if (table === 'dev_kanban_notifications') {
    void queryClient.invalidateQueries({ queryKey: ['dev-notifications'] });
  }
}
