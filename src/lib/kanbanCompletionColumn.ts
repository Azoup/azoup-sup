/** Colunas do Kanban (suporte ou DEV). */
export type KanbanColumnRef = {
  slug: string;
  title?: string;
  position?: number;
};

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

/** Slugs canônicos de coluna de conclusão por board. */
const DEV_DONE_SLUGS = new Set(['finalizados', 'concluidos', 'concluido']);
const SUPPORT_DONE_SLUGS = new Set(['done', 'concluidos', 'concluido', 'finalizados']);

const DEV_DONE_TITLES = new Set(['finalizados', 'concluidos', 'concluido']);
const SUPPORT_DONE_TITLES = new Set(['finalizados', 'concluidos', 'concluido', 'concluidos']);

function matchesDoneSlug(slug: string, allowed: Set<string>): boolean {
  const s = normalizeKey(slug);
  return allowed.has(s);
}

function matchesDoneTitle(title: string | undefined, allowed: Set<string>): boolean {
  if (!title?.trim()) return false;
  return allowed.has(normalizeKey(title));
}

/**
 * Identifica a coluna de conclusão real do board (ex.: "Finalizados", não "Para atualizar").
 * @param board 'dev' | 'support'
 */
export function resolveCompletionColumnSlug(
  columns: KanbanColumnRef[],
  board: 'dev' | 'support' = 'dev',
): string | null {
  if (!columns?.length) return null;

  const doneSlugs = board === 'dev' ? DEV_DONE_SLUGS : SUPPORT_DONE_SLUGS;
  const doneTitles = board === 'dev' ? DEV_DONE_TITLES : SUPPORT_DONE_TITLES;

  const explicit = columns.find(
    (c) => matchesDoneSlug(c.slug, doneSlugs) || matchesDoneTitle(c.title, doneTitles),
  );
  if (explicit) return explicit.slug;

  return board === 'dev' ? 'finalizados' : 'done';
}

export function isKanbanCompletionSlug(
  slug: string | null | undefined,
  completionSlug: string | null | undefined,
): boolean {
  if (!slug || !completionSlug) return false;
  return normalizeKey(slug) === normalizeKey(completionSlug);
}
