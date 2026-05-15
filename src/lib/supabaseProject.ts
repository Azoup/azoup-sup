/** Extrai o project ref da URL do Supabase (ex.: `https://abc.supabase.co` → `abc`). */
export function projectRefFromSupabaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.trim().match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i);
  return m?.[1]?.toLowerCase() ?? null;
}

/** Project ref embutido no JWT de sessão (`ref` no payload). */
export function projectRefFromAccessToken(accessToken: string): string | null {
  try {
    const part = accessToken.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { ref?: string };
    return typeof payload.ref === 'string' ? payload.ref.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Mensagem quando o browser aponta para um projeto e a sessão pertence a outro. */
export function formatSupabaseProjectMismatchMessage(urlRef: string, tokenRef: string): string {
  return (
    `O app está ligado ao projeto Supabase "${urlRef}", mas a sua sessão é do projeto "${tokenRef}". ` +
    'Faça logout, confirme VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (e as mesmas variáveis na Vercel) ' +
    'para o projeto onde a Edge Function "admin-user-actions" está publicada, e entre novamente.'
  );
}
