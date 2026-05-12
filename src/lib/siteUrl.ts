/**
 * URLs públicas usadas em redirects do Supabase (redefinição de senha, confirmação de e-mail).
 *
 * IMPORTANTE — se o link do e-mail ainda abrir outro site (ex.: Lovable) ou pedir “permissão” lá:
 * 1) No Supabase (projeto ligado a VITE_SUPABASE_URL): Authentication → URL Configuration
 *    - Site URL: https://azoup-sup.vercel.app (ou o domínio definitivo do app)
 *    - Redirect URLs: inclua exatamente:
 *        https://azoup-sup.vercel.app/**
 *        https://azoup-sup.vercel.app/reset-password
 *      (e http://localhost:8080/** se usar o dev server nesta porta)
 * 2) Authentication → Providers: desative qualquer login social que não use mais (ex.: se houve OAuth ligado ao preview Lovable).
 * 3) Authentication → Email Templates → “Reset password”: o botão deve usar {{ .ConfirmationURL }} (padrão).
 *    Se alguém trocou por {{ .SiteURL }}, o link ignora o redirect do app e volta ao Site URL antigo — corrija o template.
 *
 * Defina VITE_SITE_URL no arquivo `.env` na raiz do projeto (domínio público do app, sem barra final).
 * Em produção na Vercel: inclua a mesma variável em Environment Variables **ou** faça commit do `.env`
 * se a equipe aceitar esse fluxo (cuidado: `.env` costuma conter outros segredos).
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

/** URL completa da tela de nova senha (redirectTo do resetPasswordForEmail). */
export function getPasswordResetRedirectUrl(): string {
  return `${getSiteUrl()}/reset-password`;
}
