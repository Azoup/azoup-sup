import type { DevKanbanBoardData } from '@/lib/devKanbanBoardPatch';

const CACHE_KEY = 'dev-kanban-board-cache:v2';

const LEGACY_CACHE_KEYS = ['dev-kanban-board-cache:v1'] as const;

export function readDevKanbanBoardCache(): DevKanbanBoardData | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    for (const legacyKey of LEGACY_CACHE_KEYS) {
      sessionStorage.removeItem(legacyKey);
    }
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as DevKanbanBoardData;
    if (!parsed.cachedAt) return undefined;
    const cards = parsed.cards as { ticket_number?: number | null }[];
    if (cards.length > 0 && !cards.some((c) => c.ticket_number != null)) {
      sessionStorage.removeItem(CACHE_KEY);
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeDevKanbanBoardCache(
  data: Omit<DevKanbanBoardData, 'cachedAt'>,
): DevKanbanBoardData {
  const entry: DevKanbanBoardData = { ...data, cachedAt: Date.now() };
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {
      /* ignore */
    }
  }
  return entry;
}

export function clearDevKanbanBoardCache(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
    for (const legacyKey of LEGACY_CACHE_KEYS) {
      sessionStorage.removeItem(legacyKey);
    }
  } catch {
    /* ignore */
  }
}
