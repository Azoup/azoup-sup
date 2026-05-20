export type KanbanBoardData = {
  columns: unknown[];
  analysts: unknown[];
  cards: unknown[];
  labels: unknown[];
  cardLabels: unknown[];
  cardImages: unknown[];
  cachedAt: number;
};

const CACHE_KEY = 'kanban-board-cache:v1';

export function readKanbanBoardCache(): KanbanBoardData | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as KanbanBoardData;
    if (!parsed.cachedAt) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeKanbanBoardCache(data: Omit<KanbanBoardData, 'cachedAt'>): KanbanBoardData {
  const entry: KanbanBoardData = { ...data, cachedAt: Date.now() };
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {
      /* ignore */
    }
  }
  return entry;
}

export function clearKanbanBoardCache(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
