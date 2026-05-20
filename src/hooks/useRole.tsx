import { useUserAccess } from '@/hooks/useUserAccess';

export function useRole() {
  const { data, isPending, isFetching, isError } = useUserAccess();
  const resolvedRole = isError ? 'user' : (data?.role || 'user');

  return {
    role: resolvedRole,
    isAdmin: resolvedRole === 'admin',
    isLoading: isPending || isFetching,
  };
}
