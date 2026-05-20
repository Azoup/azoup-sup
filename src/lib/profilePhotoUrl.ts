const LEGACY_STORAGE_HOST = 'ffvgrvrkuiypjzfdcfyw.supabase.co';

/** Corrige URLs de storage de projeto antigo e remove espaços. */
export function normalizeProfilePhotoUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  let normalized = url.trim();
  if (normalized.includes(LEGACY_STORAGE_HOST)) {
    const current = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (current) {
      try {
        const host = new URL(current).host;
        normalized = normalized.replace(LEGACY_STORAGE_HOST, host);
      } catch {
        normalized = normalized.replace(
          LEGACY_STORAGE_HOST,
          'ittmglvkympbyeowgucl.supabase.co',
        );
      }
    }
  }
  return normalized;
}

/** URL para <img> / Avatar com cache-bust opcional (após novo upload). */
export function profilePhotoSrc(
  url: string | null | undefined,
  bust?: string | number,
): string | undefined {
  const base = normalizeProfilePhotoUrl(url);
  if (!base) return undefined;
  if (bust == null) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}t=${bust}`;
}

/** Extrai o path dentro do bucket profile-photos (para signed URL). */
export function profilePhotoStoragePath(url: string): string | null {
  const normalized = normalizeProfilePhotoUrl(url);
  if (!normalized) return null;
  const marker = '/profile-photos/';
  const idx = normalized.indexOf(marker);
  if (idx < 0) return null;
  const path = normalized.slice(idx + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}
