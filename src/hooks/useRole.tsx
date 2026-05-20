import { useUserAccess } from '@/hooks/useUserAccess';

export function useRole() {
  const { data, isLoading, isError } = useUserAccess();

  const resolvedRole = isError ? 'user' : (data?.role || 'user');

  return {
    role: resolvedRole,
    isAdmin: resolvedRole === 'admin',
    isLoading: isLoading && !isError,
  };
}
