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

function doneColumnScore(column: KanbanColumnRef, doneSlugs: Set<string>, doneTitles: Set<string>): number {
  const slug = normalizeKey(column.slug);
  const title = column.title ? normalizeKey(column.title) : '';
  if (slug === 'concluidos' || title === 'concluidos') return 3;
  if (slug === 'concluido' || title === 'concluido') return 2;
  if (slug === 'finalizados' || title === 'finalizados' || slug === 'done' || title === 'done') return 1;
  if (matchesDoneSlug(column.slug, doneSlugs) || matchesDoneTitle(column.title, doneTitles)) return 0;
  return -1;
}

export function isKanbanCompletionColumn(
  column: KanbanColumnRef | undefined | null,
  board: 'dev' | 'support' = 'dev',
): boolean {
  if (!column) return false;
  const doneSlugs = board === 'dev' ? DEV_DONE_SLUGS : SUPPORT_DONE_SLUGS;
  const doneTitles = board === 'dev' ? DEV_DONE_TITLES : SUPPORT_DONE_TITLES;
  return matchesDoneSlug(column.slug, doneSlugs) || matchesDoneTitle(column.title, doneTitles);
}

/** True se o slug aponta para qualquer lista de conclusão do board (Concluídos / Finalizados). */
export function isKanbanCompletionDestination(
  slug: string | null | undefined,
  columns: KanbanColumnRef[],
  board: 'dev' | 'support' = 'dev',
): boolean {
  if (!slug) return false;
  const column = columns.find((c) => normalizeKey(c.slug) === normalizeKey(slug));
  if (column) return isKanbanCompletionColumn(column, board);
  const doneSlugs = board === 'dev' ? DEV_DONE_SLUGS : SUPPORT_DONE_SLUGS;
  return matchesDoneSlug(slug, doneSlugs);
}

/**
 * Identifica a coluna de conclusão real do board (ex.: "Finalizados", não "Para atualizar").
 * Prefere "Concluídos" quando as duas listas existem.
 * @param board 'dev' | 'support'
 */
export function resolveCompletionColumnSlug(
  columns: KanbanColumnRef[],
  board: 'dev' | 'support' = 'dev',
): string | null {
  if (!columns?.length) return null;

  const doneSlugs = board === 'dev' ? DEV_DONE_SLUGS : SUPPORT_DONE_SLUGS;
  const doneTitles = board === 'dev' ? DEV_DONE_TITLES : SUPPORT_DONE_TITLES;

  let best: { slug: string; score: number } | null = null;
  for (const column of columns) {
    const score = doneColumnScore(column, doneSlugs, doneTitles);
    if (score < 0) continue;
    if (!best || score > best.score) best = { slug: column.slug, score };
  }
  if (best) return best.slug;

  return board === 'dev' ? 'finalizados' : 'done';
}

function isParaAtualizarKey(value: string): boolean {
  const key = normalizeKey(value).replace(/[_-]+/g, ' ').replace(/\s+\d+$/, '').trim();
  return key === 'para atualizar';
}

/**
 * Coluna "Para atualizar" do Kanban DEV (tickets liberados na versão nova).
 */
export function resolveParaAtualizarColumnSlug(columns: KanbanColumnRef[]): string | null {
  if (!columns?.length) return null;

  let best: { slug: string; score: number } | null = null;
  for (const column of columns) {
    const slugKey = normalizeKey(column.slug).replace(/[_-]+/g, ' ').trim();
    const titleKey = column.title ? normalizeKey(column.title).replace(/[_-]+/g, ' ').trim() : '';
    let score = -1;
    if (titleKey === 'para atualizar') score = 3;
    else if (isParaAtualizarKey(column.slug) || slugKey === 'para atualizar') score = 2;
    else if (titleKey.startsWith('para atualizar') || slugKey.startsWith('para atualizar')) score = 1;
    if (score < 0) continue;
    if (!best || score > best.score) best = { slug: column.slug, score };
  }
  return best?.slug ?? null;
}

export function kanbanColumnSlugsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) return false;
  return normalizeKey(left) === normalizeKey(right);
}

export function isEnteringColumn(
  fromSlug: string | null | undefined,
  toSlug: string | null | undefined,
  targetSlug: string | null | undefined,
): boolean {
  if (!targetSlug) return false;
  return !kanbanColumnSlugsMatch(fromSlug, targetSlug) && kanbanColumnSlugsMatch(toSlug, targetSlug);
}

export function isLeavingColumn(
  fromSlug: string | null | undefined,
  toSlug: string | null | undefined,
  targetSlug: string | null | undefined,
): boolean {
  if (!targetSlug) return false;
  return kanbanColumnSlugsMatch(fromSlug, targetSlug) && !kanbanColumnSlugsMatch(toSlug, targetSlug);
}

export function isKanbanCompletionSlug(
  slug: string | null | undefined,
  completionSlug: string | null | undefined,
): boolean {
  if (!slug || !completionSlug) return false;
  return normalizeKey(slug) === normalizeKey(completionSlug);
}
