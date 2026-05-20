/** Caminho da tela de login (respeita BASE_URL do Vite). */
export function buildAuthPath(query = ''): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  const path = `${base}/auth`.replace(/\/+/g, '/');
  if (!query) return path;
  const q = query.startsWith('?') ? query : `?${query}`;
  return `${path}${q}`;
}

export function isLogoutQuery(search = ''): boolean {
  try {
    return new URLSearchParams(search).has('logout');
  } catch {
    return search.includes('logout=1');
  }
}

export function isAuthPathname(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  const authPath = buildAuthPath().replace(/\/$/, '') || '/auth';
  return path === authPath || path.endsWith('/auth');
}

export function isAuthPath(): boolean {
  if (typeof window === 'undefined') return false;
  return isAuthPathname(window.location.pathname);
}
