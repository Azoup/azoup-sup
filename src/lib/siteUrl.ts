/**
 * URLs públicas usadas em redirects do Supabase (ex.: confirmação de e-mail no cadastro).
 *
 * Defina VITE_SITE_URL no `.env` (origem pública do app, sem barra final).
 * Em produção, replique no painel do host (ex. Vercel) nas Environment Variables.
 */
const DEFAULT_PUBLIC_ORIGIN = 'https://azoup-sup.vercel.app';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/** Origem pública do app (sem barra final). */
export function getSiteUrl(): string {
  const fromEnv = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  if (fromEnv) return trimTrailingSlash(fromEnv);

  if (typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }

  return DEFAULT_PUBLIC_ORIGIN;
}
