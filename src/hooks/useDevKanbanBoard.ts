import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchDevKanbanBoard } from '@/lib/fetchDevKanbanBoard';
import { readDevKanbanBoardCache, writeDevKanbanBoardCache } from '@/lib/devKanbanBoardCache';
import { DEV_KANBAN_BOARD_QUERY_KEY } from '@/lib/devKanbanBoardPatch';

const DEV_KANBAN_STALE_MS = 5 * 60 * 1000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export async function fetchDevKanbanBoardQuery(accessToken?: string) {
  const board = await fetchDevKanbanBoard(accessToken);
  return writeDevKanbanBoardCache(board);
}

export function useDevKanbanBoard(enabled: boolean) {
  const { session } = useAuth();
  const cached = readDevKanbanBoardCache();

  return useQuery({
    queryKey: DEV_KANBAN_BOARD_QUERY_KEY,
    queryFn: () => fetchDevKanbanBoardQuery(session?.access_token),
    enabled: enabled && !!session?.access_token,
    initialData: cached,
    initialDataUpdatedAt: cached?.cachedAt,
    staleTime: DEV_KANBAN_STALE_MS,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function refreshDevKanbanBoard(
  queryClient: ReturnType<typeof useQueryClient>,
  delayMs = 1200,
) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void queryClient.invalidateQueries({
      queryKey: DEV_KANBAN_BOARD_QUERY_KEY,
      refetchType: 'active',
    });
  }, delayMs);
}

export function flushDevKanbanBoardRefresh(queryClient: ReturnType<typeof useQueryClient>) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  void queryClient.invalidateQueries({
    queryKey: DEV_KANBAN_BOARD_QUERY_KEY,
    refetchType: 'active',
  });
}
