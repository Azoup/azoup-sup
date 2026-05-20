import { supabase } from '@/integrations/supabase/client';
import { clearSupabaseAuthStorageExcept, getConfiguredSupabaseProjectRef } from '@/lib/supabaseProject';
import { clearKanbanBoardCache } from '@/lib/kanbanBoardCache';
import { clearUserAccessCache } from '@/lib/userAccessCache';

/** Limpa sessão local imediatamente (sem await). */
export function clearLocalSession(): void {
  clearUserAccessCache();
  clearKanbanBoardCache();
  clearSupabaseAuthStorageExcept(getConfiguredSupabaseProjectRef());
  void supabase.auth.signOut({ scope: 'local' });
}

/** Redireciona para login e reinicia o app (logout mais rápido que SPA navigate). */
export function redirectToLogin(): void {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  const authPath = `${base}/auth`.replace(/\/+/g, '/');
  window.location.replace(authPath);
}
