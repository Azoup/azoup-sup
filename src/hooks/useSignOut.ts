import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { redirectToLogin } from '@/lib/signOutLocal';

/** Logout instantâneo: limpa tudo e recarrega a tela de login. */
export function useSignOut() {
  const { signOut } = useAuth();

  return useCallback(() => {
    signOut();
    redirectToLogin();
  }, [signOut]);
}
