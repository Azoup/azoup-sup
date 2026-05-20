import { isPermissionAllowed } from '@/lib/fetchUserAccess';
import { loadAndCacheUserAccess } from '@/lib/userAccessLoad';
import { fetchKanbanBoard } from '@/lib/fetchKanbanBoard';
import { writeKanbanBoardCache, type KanbanBoardData } from '@/lib/kanbanBoardCache';
import { writeUserAccessCache, type CachedUserAccess } from '@/lib/userAccessCache';

const BOOTSTRAP_TIMEOUT_MS = 10_000;

export type AppBootstrapResult = {
  access: CachedUserAccess;
  kanban: KanbanBoardData;
};

export async function fetchAppBootstrap(
  accessToken: string,
  userId: string,
): Promise<AppBootstrapResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BOOTSTRAP_TIMEOUT_MS);

  try {
    const res = await fetch('/api/app-bootstrap', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (res.ok) {
      const data = (await res.json()) as {
        userId?: string;
        role?: string;
        permissions?: Record<string, unknown> | null;
        kanban?: Omit<KanbanBoardData, 'cachedAt'>;
      };

      const permissions = data.permissions
        ? Object.fromEntries(
            Object.entries(data.permissions).map(([k, v]) => [k, isPermissionAllowed(v)]),
          )
        : null;

      const access: CachedUserAccess = {
        role: data.role || 'user',
        permissions,
        userId: data.userId || userId,
        cachedAt: Date.now(),
      };
      writeUserAccessCache(access);

      const kanban = writeKanbanBoardCache({
        columns: data.kanban?.columns ?? [],
        analysts: data.kanban?.analysts ?? [],
        cards: data.kanban?.cards ?? [],
        labels: data.kanban?.labels ?? [],
        cardLabels: data.kanban?.cardLabels ?? [],
        cardImages: data.kanban?.cardImages ?? [],
      });

      return { access, kanban };
    }
  } catch {
    /* fallback abaixo */
  } finally {
    window.clearTimeout(timeoutId);
  }

  const [access, kanban] = await Promise.all([
    loadAndCacheUserAccess(accessToken, userId),
    fetchKanbanBoard(accessToken).then((b) => writeKanbanBoardCache(b)),
  ]);

  return { access, kanban };
}
