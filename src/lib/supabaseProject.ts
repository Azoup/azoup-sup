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
    'A sessão antiga foi limpa — faça login novamente. Confirme que VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY ' +
    '(e as mesmas variáveis na Vercel) apontam para o projeto onde a sua conta existe.'
  );
}

const AUTH_STORAGE_PREFIXES = ['sb-', 'supabase.auth.'];

/** Remove sessões guardadas de outros projetos Supabase (evita logout/login instável ao mudar .env). */
export function clearSupabaseAuthStorageExcept(activeProjectRef: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const keepSuffix = activeProjectRef ? `-${activeProjectRef}-` : null;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    const isAuthKey = AUTH_STORAGE_PREFIXES.some((p) => key.startsWith(p) || key.includes('auth-token'));
    if (!isAuthKey) continue;
    if (keepSuffix && key.includes(keepSuffix)) continue;
    keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => window.localStorage.removeItem(k));
}

export function getConfiguredSupabaseProjectRef(): string | null {
  return projectRefFromSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
}
