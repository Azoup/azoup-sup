import { useAuth } from '@/hooks/useAuth';
import { useUserAccess, useAccessReady } from '@/hooks/useUserAccess';

export function useRole() {
  const { user } = useAuth();
  const accessReady = useAccessReady();
  const { data } = useUserAccess();

  if (!user?.id) {
    return { role: 'user', isAdmin: false, isLoading: false };
  }

  const resolvedRole = !accessReady ? 'user' : (data?.role || 'user');

  return {
    role: resolvedRole,
    isAdmin: accessReady && resolvedRole === 'admin',
    isLoading: !accessReady,
  };
}
