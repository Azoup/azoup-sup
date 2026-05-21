import { profilePhotoSrc } from '@/lib/profilePhotoUrl';
import { resolvePhotoDisplayUrl } from '@/lib/profilePhotoUpload';

const cache = new Map<string, string>();

/** URL estável para <img> (cache em memória por URL pública do banco). */
export async function getPhotoDisplaySrc(
  photoUrl: string | null | undefined,
): Promise<string | undefined> {
  const normalized = profilePhotoSrc(photoUrl);
  if (!normalized) return undefined;

  const cached = cache.get(normalized);
  if (cached) return cached;

  const display = await resolvePhotoDisplayUrl(normalized);
  const src = display ?? normalized;
  cache.set(normalized, src);
  return src;
}

export function primePhotoDisplayCache(photoUrl: string, displaySrc: string): void {
  const key = profilePhotoSrc(photoUrl);
  if (key) cache.set(key, displaySrc);
}

export function clearPhotoDisplayCache(photoUrl?: string | null): void {
  if (!photoUrl) {
    cache.clear();
    return;
  }
  const key = profilePhotoSrc(photoUrl);
  if (key) cache.delete(key);
}

/** Testa se o navegador consegue carregar a imagem. */
export function canLoadImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}
