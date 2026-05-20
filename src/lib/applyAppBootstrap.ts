import type { QueryClient } from '@tanstack/react-query';
import type { AppBootstrapResult } from '@/lib/fetchAppBootstrap';

export function applyAppBootstrapToQueryClient(
  queryClient: QueryClient,
  bootstrap: AppBootstrapResult,
): void {
  queryClient.setQueryData(['user-access', bootstrap.access.userId], bootstrap.access);
  queryClient.setQueryData(['kanban-board'], bootstrap.kanban);
}
