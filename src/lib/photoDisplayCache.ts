import { normalizeProfilePhotoUrl, profilePhotoSrc } from '@/lib/profilePhotoUrl';

const cache = new Map<string, string>();

/** URL para exibir no avatar — buckets públicos usam link direto (sem async). */
export function getPhotoDisplaySrc(photoUrl: string | null | undefined): string | undefined {
  const normalized = normalizeProfilePhotoUrl(photoUrl);
  if (!normalized) return undefined;

  const cached = cache.get(normalized);
  if (cached) return cached;

  cache.set(normalized, normalized);
  return normalized;
}

export function primePhotoDisplayCache(photoUrl: string, displaySrc?: string): void {
  const key = normalizeProfilePhotoUrl(photoUrl);
  if (key) cache.set(key, displaySrc ?? key);
}

export function clearPhotoDisplayCache(photoUrl?: string | null): void {
  if (!photoUrl) {
    cache.clear();
    return;
  }
  const key = normalizeProfilePhotoUrl(photoUrl);
  if (key) cache.delete(key);
}
