import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchKanbanBoard } from '@/lib/fetchKanbanBoard';
import { readKanbanBoardCache, writeKanbanBoardCache } from '@/lib/kanbanBoardCache';

const KANBAN_STALE_MS = 2 * 60 * 1000;

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

export function invalidateKanbanBoard(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['kanban-board'], refetchType: 'active' });
}
