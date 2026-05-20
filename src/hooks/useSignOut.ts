import { useCallback } from 'react';
import { performLogout } from '@/lib/signOutLocal';

/** Logout instantâneo: limpa storage e recarrega a tela de login. */
export function useSignOut() {
  return useCallback(() => {
    performLogout();
  }, []);
}
