import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchConfecKanbanBoard } from '@/lib/fetchConfecKanbanBoard';
import { readConfecKanbanBoardCache, writeConfecKanbanBoardCache } from '@/lib/confecKanbanBoardCache';
import { CONFEC_KANBAN_BOARD_QUERY_KEY } from '@/lib/confecKanbanBoardPatch';

const CONFEC_KANBAN_STALE_MS = 90 * 1000;
const CONFEC_KANBAN_REALTIME_REFETCH_MS = 800;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export async function fetchConfecKanbanBoardQuery(accessToken?: string) {
  const board = await fetchConfecKanbanBoard(accessToken);
  return writeConfecKanbanBoardCache(board);
}

export function useConfecKanbanBoard(enabled: boolean) {
  const { session } = useAuth();
  const cached = readConfecKanbanBoardCache();

  return useQuery({
    queryKey: CONFEC_KANBAN_BOARD_QUERY_KEY,
    queryFn: () => fetchConfecKanbanBoardQuery(session?.access_token),
    enabled: enabled && !!session?.access_token,
    initialData: cached,
    initialDataUpdatedAt: cached?.cachedAt,
    staleTime: CONFEC_KANBAN_STALE_MS,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: 2,
    placeholderData: (prev) => prev,
  });
}

export function refreshConfecKanbanBoard(
  queryClient: ReturnType<typeof useQueryClient>,
  delayMs = CONFEC_KANBAN_REALTIME_REFETCH_MS,
) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void queryClient.invalidateQueries({
      queryKey: CONFEC_KANBAN_BOARD_QUERY_KEY,
      refetchType: 'active',
    });
  }, delayMs);
}

export function flushConfecKanbanBoardRefresh(queryClient: ReturnType<typeof useQueryClient>) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  void queryClient.invalidateQueries({
    queryKey: CONFEC_KANBAN_BOARD_QUERY_KEY,
    refetchType: 'active',
  });
}
