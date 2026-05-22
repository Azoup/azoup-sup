import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchKanbanBoard } from '@/lib/fetchKanbanBoard';
import { readKanbanBoardCache, writeKanbanBoardCache } from '@/lib/kanbanBoardCache';

const KANBAN_STALE_MS = 5 * 60 * 1000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function useKanbanBoard(enabled: boolean) {
  const { session } = useAuth();
  const cached = readKanbanBoardCache();

  return useQuery({
    queryKey: ['kanban-board'],
    queryFn: async () => {
      const board = await fetchKanbanBoard(session?.access_token);
      return writeKanbanBoardCache(board);
    },
    enabled: enabled && !!session?.access_token,
    initialData: cached,
    initialDataUpdatedAt: cached?.cachedAt,
    staleTime: KANBAN_STALE_MS,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function invalidateKanbanBoard(
  queryClient: ReturnType<typeof useQueryClient>,
  delayMs = 1200,
) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void queryClient.invalidateQueries({ queryKey: ['kanban-board'], refetchType: 'active' });
  }, delayMs);
}

export function flushKanbanBoardRefresh(queryClient: ReturnType<typeof useQueryClient>) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  void queryClient.invalidateQueries({ queryKey: ['kanban-board'], refetchType: 'active' });
}
