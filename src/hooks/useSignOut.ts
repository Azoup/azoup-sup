import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { clearKanbanBoardCache } from '@/lib/kanbanBoardCache';
import { clearUserAccessCache } from '@/lib/userAccessCache';

/** Logout imediato: limpa sessão, cache e vai para /auth sem esperar rede. */
export function useSignOut() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(() => {
    signOut();
    clearUserAccessCache();
    clearKanbanBoardCache();
    queryClient.cancelQueries();
    navigate('/auth', { replace: true });
    queueMicrotask(() => {
      queryClient.clear();
    });
  }, [signOut, navigate, queryClient]);
}
