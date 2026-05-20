import { useUserAccess } from '@/hooks/useUserAccess';

export function useRole() {
  const { data } = useUserAccess();
  const resolvedRole = data?.role || 'user';

  return {
    role: resolvedRole,
    isAdmin: resolvedRole === 'admin',
    isLoading: false,
  };
}
