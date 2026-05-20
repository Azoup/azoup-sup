import { useAuth } from '@/hooks/useAuth';
import { useUserAccess, useAccessReady } from '@/hooks/useUserAccess';

export function useRole() {
  const { user } = useAuth();

  if (!user?.id) {
    return { role: 'user', isAdmin: false, isLoading: false };
  }

  const accessReady = useAccessReady();
  const { data, isError } = useUserAccess();
  const resolvedRole = !accessReady || isError ? 'user' : (data?.role || 'user');

  return {
    role: resolvedRole,
    isAdmin: accessReady && resolvedRole === 'admin',
    isLoading: !accessReady,
  };
}
