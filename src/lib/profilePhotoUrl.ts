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

export function isSignedStorageUrl(url: string): boolean {
  return url.includes('/object/sign/');
}

export function isExternalPhotoUrl(url: string): boolean {
  const n = normalizeProfilePhotoUrl(url);
  if (!n) return false;
  if (n.startsWith('blob:') || n.startsWith('data:')) return true;
  try {
    const u = new URL(n);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** URL para <img> / Avatar com cache-bust opcional (após novo upload). */
export function profilePhotoSrc(
  url: string | null | undefined,
  bust?: string | number,
): string | undefined {
  const base = normalizeProfilePhotoUrl(url);
  if (!base) return undefined;
  if (isSignedStorageUrl(base) || bust == null) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}t=${bust}`;
}

const PHOTO_BUCKETS = ['profile-photos', 'analyst-photos', 'developer-photos'] as const;

/** Extrai bucket e path de uma URL pública do Storage (para signed URL). */
export function storageObjectFromPublicUrl(
  url: string,
): { bucket: (typeof PHOTO_BUCKETS)[number]; path: string } | null {
  const normalized = normalizeProfilePhotoUrl(url);
  if (!normalized || isSignedStorageUrl(normalized)) return null;

  if (normalized.includes('/object/public/')) {
    for (const bucket of PHOTO_BUCKETS) {
      const marker = `/object/public/${bucket}/`;
      const idx = normalized.indexOf(marker);
      if (idx < 0) continue;
      const path = normalized.slice(idx + marker.length).split('?')[0];
      if (path) return { bucket, path: decodeURIComponent(path) };
    }
  }

  for (const bucket of PHOTO_BUCKETS) {
    const marker = `/${bucket}/`;
    const idx = normalized.indexOf(marker);
    if (idx < 0) continue;
    const path = normalized.slice(idx + marker.length).split('?')[0];
    if (path) {
      return { bucket, path: decodeURIComponent(path) };
    }
  }
  return null;
}

/** @deprecated Use storageObjectFromPublicUrl */
export function profilePhotoStoragePath(url: string): string | null {
  return storageObjectFromPublicUrl(url)?.path ?? null;
}
