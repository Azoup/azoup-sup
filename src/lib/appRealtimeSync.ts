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
  'digisac_sla_notifications',
  'doubt_records',
] as const;

/** Mudanças que não precisam recarregar o board inteiro (só queries do card). */
const SUPPORT_CARD_SCOPED_TABLES = new Set([
  'kanban_card_files',
  'kanban_card_checklist',
]);

const DEV_CARD_SCOPED_TABLES = new Set(['dev_kanban_card_files']);

const SUPPORT_BOARD_TABLES = new Set([
  'kanban_cards',
  'kanban_card_images',
  'kanban_columns',
  'kanban_labels',
  'kanban_card_labels',
]);

const DEV_BOARD_TABLES = new Set([
  'dev_kanban_cards',
  'dev_kanban_card_images',
  'dev_kanban_columns',
  'dev_kanban_labels',
  'dev_kanban_card_labels',
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

function invalidateChecklistQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['card-checklist'] });
  void queryClient.invalidateQueries({ queryKey: ['checklist-progress-map'] });
  void queryClient.invalidateQueries({ queryKey: ['card-checklist-progress'] });
}

function invalidateSupportCardScoped(queryClient: QueryClient, table: string): void {
  if (table === 'kanban_card_checklist') {
    invalidateChecklistQueries(queryClient);
    return;
  }
  if (table === 'kanban_card_files') {
    void queryClient.invalidateQueries({ queryKey: ['card-files'] });
  }
}

function invalidateDevCardScoped(queryClient: QueryClient, table: string): void {
  if (table === 'dev_kanban_card_files') {
    void queryClient.invalidateQueries({ queryKey: ['dev-card-files'] });
  }
}

/** Reage a um evento Realtime e invalida caches React Query afetados. */
export function handleAppRealtimeTableChange(
  table: string,
  queryClient: QueryClient,
): void {
  if (SUPPORT_CARD_SCOPED_TABLES.has(table)) {
    invalidateSupportCardScoped(queryClient, table);
    return;
  }

  if (DEV_CARD_SCOPED_TABLES.has(table)) {
    invalidateDevCardScoped(queryClient, table);
    return;
  }

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
    return;
  }

  if (table === 'digisac_sla_notifications') {
    void queryClient.invalidateQueries({ queryKey: ['digisac-sla-notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['digisac-sla-alerts-history'] });
  }
}
