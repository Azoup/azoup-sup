/**
 * Base URL usada em redirects do Supabase (reset de senha, confirmação de email).
 * Defina VITE_SITE_URL no deploy (ex.: https://app.seudominio.com) para que os links
 * do e-mail apontem sempre para o domínio correto — deve estar em Authentication → URL Configuration no Supabase.
 */
export function getSiteUrl(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.replace(/\/$/, '');
  return window.location.origin;
}
