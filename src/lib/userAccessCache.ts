import type { UserAccessResult } from '@/lib/fetchUserAccess';

const CACHE_PREFIX = 'user-access-cache:v1:';

export type CachedUserAccess = UserAccessResult & {
  userId: string;
  cachedAt: number;
};

function storageKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

export function readUserAccessCache(userId: string | undefined): CachedUserAccess | undefined {
  if (!userId || typeof window === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedUserAccess;
    if (parsed.userId !== userId) return undefined;
    if (!parsed.role) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeUserAccessCache(access: CachedUserAccess): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(access.userId), JSON.stringify(access));
  } catch {
    /* quota / private mode */
  }
}

export function clearUserAccessCache(userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      sessionStorage.removeItem(storageKey(userId));
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
