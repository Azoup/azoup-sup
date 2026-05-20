import { fetchUserAccess } from '@/lib/fetchUserAccess';
import { writeUserAccessCache, type CachedUserAccess } from '@/lib/userAccessCache';

export async function loadAndCacheUserAccess(
  accessToken: string,
  userId: string,
): Promise<CachedUserAccess> {
  const result = await fetchUserAccess(accessToken, userId);
  const cached: CachedUserAccess = {
    ...result,
    userId,
    cachedAt: Date.now(),
  };
  writeUserAccessCache(cached);
  return cached;
}
