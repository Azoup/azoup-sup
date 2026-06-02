import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { handleAppRealtimeTableChange } from './appRealtimeSync';

vi.mock('@/lib/boardRefreshGuard', () => ({
  consumeBoardRealtimeSkip: vi.fn(() => false),
}));

vi.mock('@/hooks/useKanbanBoard', () => ({
  invalidateKanbanBoard: vi.fn(),
}));

vi.mock('@/hooks/useDevKanbanBoard', () => ({
  refreshDevKanbanBoard: vi.fn(),
}));

import { consumeBoardRealtimeSkip } from '@/lib/boardRefreshGuard';
import { invalidateKanbanBoard } from '@/hooks/useKanbanBoard';
import { refreshDevKanbanBoard } from '@/hooks/useDevKanbanBoard';

describe('handleAppRealtimeTableChange', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.clearAllMocks();
    vi.mocked(consumeBoardRealtimeSkip).mockReturnValue(false);
  });

  it('invalida board de suporte em mudança de card', () => {
    handleAppRealtimeTableChange('kanban_cards', queryClient);
    expect(invalidateKanbanBoard).toHaveBeenCalledWith(queryClient);
  });

  it('invalida board dev em mudança de card dev', () => {
    handleAppRealtimeTableChange('dev_kanban_cards', queryClient);
    expect(refreshDevKanbanBoard).toHaveBeenCalledWith(queryClient);
  });

  it('invalida lançamentos em doubt_records', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    handleAppRealtimeTableChange('doubt_records', queryClient);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['doubt-records'] });
  });

  it('ignora board quando skip local está ativo', () => {
    vi.mocked(consumeBoardRealtimeSkip).mockReturnValue(true);
    handleAppRealtimeTableChange('kanban_cards', queryClient);
    expect(invalidateKanbanBoard).not.toHaveBeenCalled();
  });

  it('não recarrega board inteiro em mudança de checklist', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    handleAppRealtimeTableChange('kanban_card_checklist', queryClient);
    expect(invalidateKanbanBoard).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['card-checklist'] });
  });
});
