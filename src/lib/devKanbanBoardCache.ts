import type { DevKanbanBoardData } from '@/lib/devKanbanBoardPatch';

const CACHE_KEY = 'dev-kanban-board-cache:v1';

export function readDevKanbanBoardCache(): DevKanbanBoardData | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as DevKanbanBoardData;
    if (!parsed.cachedAt) return undefined;
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
  } catch {
    /* ignore */
  }
}
