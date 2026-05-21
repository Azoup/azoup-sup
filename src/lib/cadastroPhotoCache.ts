import { normalizeProfilePhotoUrl } from '@/lib/profilePhotoUrl';

const STORAGE_KEY = 'cadastro-photo-urls-v1';

type PhotoCacheMap = Record<string, string>;

function cacheKey(table: 'analysts' | 'developers', id: string): string {
  return `${table}:${id}`;
}

function readCache(): PhotoCacheMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PhotoCacheMap) : {};
  } catch {
    return {};
  }
}

function writeCache(map: PhotoCacheMap): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function rememberCadastroPhoto(
  table: 'analysts' | 'developers',
  id: string,
  photoUrl: string,
): void {
  const normalized = normalizeProfilePhotoUrl(photoUrl);
  if (!normalized) return;
  const map = readCache();
  map[cacheKey(table, id)] = normalized;
  writeCache(map);
}

export function getRememberedCadastroPhoto(
  table: 'analysts' | 'developers',
  id: string,
): string | undefined {
  return readCache()[cacheKey(table, id)];
}

/** Mescla URLs lembradas e normaliza — evita perder foto após refetch vazio do proxy. */
export function mergeCadastroRowsWithPhotoCache<T extends { id: string; photo_url?: string | null }>(
  table: 'analysts' | 'developers',
  rows: T[],
): T[] {
  const map = readCache();
  return rows.map((row) => {
    const fromDb = normalizeProfilePhotoUrl(row.photo_url) ?? row.photo_url ?? null;
    const remembered = map[cacheKey(table, row.id)];
    const photo_url = fromDb || remembered || null;
    if (fromDb && remembered !== fromDb) {
      map[cacheKey(table, row.id)] = fromDb;
    }
    return { ...row, photo_url };
  });
}
