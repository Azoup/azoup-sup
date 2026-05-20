import { useUserAccess, useAccessReady } from '@/hooks/useUserAccess';

export function useRole() {
  const accessReady = useAccessReady();
  const { data, isError } = useUserAccess();
  const resolvedRole = !accessReady || isError ? 'user' : (data?.role || 'user');

  return {
    role: resolvedRole,
    isAdmin: accessReady && resolvedRole === 'admin',
    isLoading: !accessReady,
  };
}
