import { buildAuthPath } from '@/lib/authPaths';
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

export function setLogoutFlag(): void {
  try {
    sessionStorage.setItem(LOGOUT_FLAG_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Limpa sessão local imediatamente (sem await). */
export function clearLocalSession(): void {
  clearUserAccessCache();
  clearKanbanBoardCache();
  clearAllSupabaseAuthStorage();
}

/** Redireciona para login com recarga completa. */
export function redirectToLogin(): void {
  window.location.replace(buildAuthPath('logout=1'));
}

/**
 * Logout: marca flag e navega na hora (antes de React re-renderizar).
 * A limpeza do localStorage ocorre no script inline do index.html e no AuthProvider.
 */
export function performLogout(): void {
  setLogoutFlag();
  window.location.assign(buildAuthPath('logout=1'));
}
