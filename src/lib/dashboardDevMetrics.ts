import { endOfDay, format, parseISO, startOfDay } from 'date-fns';
import { isKanbanCompletionSlug } from '@/lib/kanbanCompletionColumn';

export type DashboardDevCard = {
  id: string;
  status: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
  analyst_id?: string | null;
  developer_id?: string | null;
};

export function isInLocalDateRange(
  isoDate: string | null | undefined,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (!isoDate) return false;
  const d = parseISO(isoDate);
  if (dateFrom && d < startOfDay(parseISO(dateFrom))) return false;
  if (dateTo && d > endOfDay(parseISO(dateTo))) return false;
  return true;
}

export function matchesPeopleFilter(
  card: Pick<DashboardDevCard, 'analyst_id' | 'developer_id'>,
  filterAnalystId: string,
  filterDevId: string,
): boolean {
  if (filterAnalystId && filterAnalystId !== 'all' && card.analyst_id !== filterAnalystId) return false;
  if (filterDevId && filterDevId !== 'all' && card.developer_id !== filterDevId) return false;
  return true;
}

/** Data usada para saber se o ticket foi concluído no período. */
export function getCardCompletionDate(card: DashboardDevCard): string | null {
  if (card.completed_at) return card.completed_at;
  if (card.updated_at) return card.updated_at;
  return null;
}

/**
 * Tickets na coluna de conclusão finalizados no período (mesma lógica da lista Concluídos do Kanban).
 */
export function countCompletedInPeriod(
  cards: DashboardDevCard[],
  dateFrom: string,
  dateTo: string,
  completionColumnSlug: string | null,
  filterAnalystId: string,
  filterDevId: string,
): number {
  return cards.filter((card) => {
    if (!isKanbanCompletionSlug(card.status, completionColumnSlug)) return false;
    if (!matchesPeopleFilter(card, filterAnalystId, filterDevId)) return false;
    const completionDate = getCardCompletionDate(card);
    return isInLocalDateRange(completionDate, dateFrom, dateTo);
  }).length;
}

export function filterCardsCreatedInPeriod(
  cards: DashboardDevCard[],
  dateFrom: string,
  dateTo: string,
  filterAnalystId: string,
  filterDevId: string,
): DashboardDevCard[] {
  return cards.filter((card) => {
    if (!isInLocalDateRange(card.created_at, dateFrom, dateTo)) return false;
    if (!matchesPeopleFilter(card, filterAnalystId, filterDevId)) return false;
    return true;
  });
}

export function filterCardsForDashboard(
  cards: DashboardDevCard[],
  dateFrom: string,
  dateTo: string,
  filterAnalystId: string,
  filterDevId: string,
): DashboardDevCard[] {
  if (!dateFrom && !dateTo) {
    return cards.filter((card) => matchesPeopleFilter(card, filterAnalystId, filterDevId));
  }
  return filterCardsCreatedInPeriod(cards, dateFrom, dateTo, filterAnalystId, filterDevId);
}

export function buildStatusChartRows(
  columns: { slug: string; title: string }[],
  cards: DashboardDevCard[],
  filteredCards: DashboardDevCard[],
  options: {
    hasDateFilter: boolean;
    dateFrom: string;
    dateTo: string;
    completionColumnSlug: string | null;
    filterAnalystId: string;
    filterDevId: string;
  },
): { name: string; cards: number }[] {
  const colSlugs = new Set(columns.map((col) => col.slug));
  const rows = columns.map((col) => {
    const isCompletionCol = isKanbanCompletionSlug(col.slug, options.completionColumnSlug);
    let count: number;

    if (options.hasDateFilter && isCompletionCol) {
      count = countCompletedInPeriod(
        cards,
        options.dateFrom,
        options.dateTo,
        options.completionColumnSlug,
        options.filterAnalystId,
        options.filterDevId,
      );
    } else if (options.hasDateFilter) {
      count = filteredCards.filter((c) => c.status === col.slug).length;
    } else {
      count = filteredCards.filter((c) => c.status === col.slug).length;
    }

    return { name: col.title, cards: count };
  });

  const orphanCards = filteredCards.filter((c) => !colSlugs.has(c.status)).length;
  if (orphanCards > 0) {
    rows.push({ name: 'Sem lista correspondente', cards: orphanCards });
  }

  return rows;
}

export function collectDashboardMonths(cards: DashboardDevCard[]): string[] {
  const set = new Set<string>();
  cards.forEach((card) => {
    set.add(format(parseISO(card.created_at), 'yyyy-MM'));
    const completionDate = getCardCompletionDate(card);
    if (completionDate) {
      set.add(format(parseISO(completionDate), 'yyyy-MM'));
    }
  });
  return [...set].sort().reverse();
}
