import { clearAllSupabaseAuthStorage } from '@/lib/supabaseProject';
import { clearKanbanBoardCache } from '@/lib/kanbanBoardCache';
import { clearUserAccessCache } from '@/lib/userAccessCache';

export const LOGOUT_FLAG_KEY = 'azoup-signed-out';

export function hasLogoutFlag(): boolean {
  try {
    return sessionStorage.getItem(LOGOUT_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function consumeLogoutFlag(): boolean {
  try {
    if (sessionStorage.getItem(LOGOUT_FLAG_KEY) !== '1') return false;
    sessionStorage.removeItem(LOGOUT_FLAG_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Limpa sessão local imediatamente (sem await). */
export function clearLocalSession(): void {
  clearUserAccessCache();
  clearKanbanBoardCache();
  clearAllSupabaseAuthStorage();
}

/** Redireciona para login e reinicia o app (logout mais rápido que SPA navigate). */
export function redirectToLogin(): void {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  const authPath = `${base}/auth`.replace(/\/+/g, '/');
  window.location.replace(authPath);
}

/** Logout síncrono: marca flag, limpa storage e recarrega em /auth. */
export function performLogout(): void {
  try {
    sessionStorage.setItem(LOGOUT_FLAG_KEY, '1');
  } catch {
    /* ignore */
  }
  clearLocalSession();
  redirectToLogin();
}
