import type { ConfecKanbanBoardData } from '@/lib/confecKanbanBoardPatch';

const CACHE_KEY = 'confec-kanban-board-cache:v2';

const LEGACY_CACHE_KEYS = ['confec-kanban-board-cache:v1'] as const;

export function readConfecKanbanBoardCache(): ConfecKanbanBoardData | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    for (const legacyKey of LEGACY_CACHE_KEYS) {
      sessionStorage.removeItem(legacyKey);
    }
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ConfecKanbanBoardData;
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

export function writeConfecKanbanBoardCache(
  data: Omit<ConfecKanbanBoardData, 'cachedAt'>,
): ConfecKanbanBoardData {
  const entry: ConfecKanbanBoardData = { ...data, cachedAt: Date.now() };
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {
      /* ignore */
    }
  }
  return entry;
}

export function clearConfecKanbanBoardCache(): void {
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
