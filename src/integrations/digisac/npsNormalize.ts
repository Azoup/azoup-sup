export type NpsCategoryStats = {
  count: number;
  percent: number;
  label: string;
  scoreRange: string;
};

export type NpsOverview = {
  total: number;
  npsScore: number | null;
  promoters: NpsCategoryStats;
  neutrals: NpsCategoryStats;
  detractors: NpsCategoryStats;
};

export type NpsAnalystRow = {
  userId: string;
  name: string;
  total: number;
  overview: NpsOverview;
};

export type NpsApiDebugAttempt = {
  endpoint: string;
  query: string;
  status: number;
  ok: boolean;
  mappedTotal: number;
  sampleKeys: string[];
};

export type DigisacNpsDashboardResponse = {
  departmentId: string;
  departmentName: string;
  overview: NpsOverview;
  analysts: NpsAnalystRow[];
  dataSource?: string;
  answersRowCount?: number;
  period?: { from: string; to: string };
  scoredAnswerCount?: number;
  _debug?: {
    hint?: string;
    bestAttempt?: NpsApiDebugAttempt | null;
    attempts?: NpsApiDebugAttempt[];
    sampleRowKeys?: string[];
  };
};

export const EMPTY_NPS_OVERVIEW: NpsOverview = {
  total: 0,
  npsScore: null,
  promoters: { count: 0, percent: 0, label: 'Promotores', scoreRange: '9 - 10' },
  neutrals: { count: 0, percent: 0, label: 'Neutros', scoreRange: '7 - 8' },
  detractors: { count: 0, percent: 0, label: 'Detratores', scoreRange: '0 - 6' },
};

const asNumber = (...values: unknown[]): number => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = Number(value.replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
};

const firstObject = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object') return {};
  const root = payload as Record<string, unknown>;
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
    return root.data as Record<string, unknown>;
  }
  return root;
};

const readCategoryNode = (
  source: Record<string, unknown>,
  keys: string[],
): { count: number; percent: number } => {
  for (const key of keys) {
    const node = source[key];
    if (!node || typeof node !== 'object') continue;
    const obj = node as Record<string, unknown>;
    return {
      count: asNumber(obj.count, obj.quantity, obj.quantidade, obj.total, obj.value, obj.amount),
      percent: asNumber(obj.percent, obj.percentage, obj.porcentagem, obj.rate, obj.pct),
    };
  }
  return { count: 0, percent: 0 };
};

const readFromArrayBuckets = (
  source: Record<string, unknown>,
  matcher: (name: string) => boolean,
): { count: number; percent: number } => {
  const arrays = ['items', 'categories', 'breakdown', 'groups', 'segments', 'data'];
  for (const key of arrays) {
    const value = source[key];
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (!row || typeof row !== 'object') continue;
      const obj = row as Record<string, unknown>;
      const name = String(obj.name ?? obj.label ?? obj.type ?? obj.key ?? '').toLowerCase();
      if (!matcher(name)) continue;
      return {
        count: asNumber(obj.count, obj.quantity, obj.total, obj.value),
        percent: asNumber(obj.percent, obj.percentage, obj.rate),
      };
    }
  }
  return { count: 0, percent: 0 };
};

const withPercents = (
  promoters: { count: number; percent: number },
  neutrals: { count: number; percent: number },
  detractors: { count: number; percent: number },
  total: number,
): NpsOverview => {
  const sum = promoters.count + neutrals.count + detractors.count;
  const effectiveTotal = total > 0 ? total : sum;

  const pct = (count: number, explicit: number) => {
    if (explicit > 0) return Math.round(explicit * 100) / 100;
    if (effectiveTotal <= 0) return 0;
    return Math.round((count / effectiveTotal) * 10000) / 100;
  };

  return {
    total: effectiveTotal,
    npsScore:
      effectiveTotal > 0
        ? Math.round(((promoters.count - detractors.count) / effectiveTotal) * 10000) / 100
        : null,
    promoters: {
      count: promoters.count,
      percent: pct(promoters.count, promoters.percent),
      label: 'Promotores',
      scoreRange: '9 - 10',
    },
    neutrals: {
      count: neutrals.count,
      percent: pct(neutrals.count, neutrals.percent),
      label: 'Neutros',
      scoreRange: '7 - 8',
    },
    detractors: {
      count: detractors.count,
      percent: pct(detractors.count, detractors.percent),
      label: 'Detratores',
      scoreRange: '0 - 6',
    },
  };
};

import { aggregateAnswerRows, countsToNpsScore, emptyNpsCounts } from '@/lib/digisacNpsAggregate';
import { flattenAnswersPayload } from '@/lib/digisacNpsAggregate';

function countsToOverviewFromAggregate(counts: ReturnType<typeof emptyNpsCounts>): NpsOverview {
  const total = counts.total;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);
  return {
    total,
    npsScore: countsToNpsScore(counts),
    promoters: { count: counts.promoters, percent: pct(counts.promoters), label: 'Promotores', scoreRange: '9 - 10' },
    neutrals: { count: counts.neutrals, percent: pct(counts.neutrals), label: 'Neutros', scoreRange: '7 - 8' },
    detractors: { count: counts.detractors, percent: pct(counts.detractors), label: 'Detratores', scoreRange: '0 - 6' },
  };
}

function isPreMappedOverview(root: Record<string, unknown>): boolean {
  const total = asNumber(root.total);
  const promoters = root.promoters;
  return total > 0 && promoters != null && typeof promoters === 'object';
}

/** Formato Digisac: `data.nps` = [promotores, neutros, detratores, não avaliados, inválidos]. */
function mapNpsVectorOverview(payload: unknown): NpsOverview | null {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  if (!root?.data || typeof root.data !== 'object' || Array.isArray(root.data)) return null;
  const npsArr = (root.data as Record<string, unknown>).nps;
  if (!Array.isArray(npsArr) || npsArr.length < 3) return null;
  const promoters = asNumber(npsArr[0]);
  const neutrals = asNumber(npsArr[1]);
  const detractors = asNumber(npsArr[2]);
  const total = promoters + neutrals + detractors;
  if (total <= 0) return null;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);
  const npsScore = Math.round(((promoters - detractors) / total) * 10000) / 100;
  return {
    total,
    npsScore,
    promoters: { count: promoters, percent: pct(promoters), label: 'Promotores', scoreRange: '9 - 10' },
    neutrals: { count: neutrals, percent: pct(neutrals), label: 'Neutros', scoreRange: '7 - 8' },
    detractors: { count: detractors, percent: pct(detractors), label: 'Detratores', scoreRange: '0 - 6' },
  };
}

export function normalizeNpsOverviewPayload(payload: unknown): NpsOverview {
  const vector = mapNpsVectorOverview(payload);
  if (vector) return vector;

  const root = firstObject(payload);

  if (isPreMappedOverview(root)) {
    const p = root.promoters as Record<string, unknown>;
    const n = root.neutrals as Record<string, unknown>;
    const d = root.detractors as Record<string, unknown>;
    return {
      total: asNumber(root.total),
      npsScore: typeof root.npsScore === 'number' ? root.npsScore : null,
      promoters: {
        count: asNumber(p.count),
        percent: asNumber(p.percent),
        label: 'Promotores',
        scoreRange: '9 - 10',
      },
      neutrals: {
        count: asNumber(n.count),
        percent: asNumber(n.percent),
        label: 'Neutros',
        scoreRange: '7 - 8',
      },
      detractors: {
        count: asNumber(d.count),
        percent: asNumber(d.percent),
        label: 'Detratores',
        scoreRange: '0 - 6',
      },
    };
  }

  const rows = flattenAnswersPayload(payload);
  if (rows.length > 0) {
    const counts = aggregateAnswerRows(rows);
    if (counts.total > 0) return countsToOverviewFromAggregate(counts);
  }
  const totals =
    root.totals && typeof root.totals === 'object'
      ? (root.totals as Record<string, unknown>)
      : root;

  const total = asNumber(
    totals.count,
    totals.total,
    totals.answers,
    totals.answersCount,
    totals.totalAnswers,
    root.count,
    root.total,
    root.answersCount,
  );

  let promoters = readCategoryNode(root, ['promoters', 'promoter', 'Promoters', 'promotores', 'promotor']);
  let neutrals = readCategoryNode(root, ['neutrals', 'neutral', 'passive', 'passives', 'Neutrals', 'neutros', 'neutro', 'passivos']);
  let detractors = readCategoryNode(root, ['detractors', 'detractor', 'Detractors', 'detratores', 'detrator']);

  if (!promoters.count && !neutrals.count && !detractors.count) {
    promoters = readFromArrayBuckets(root, (n) => n.includes('promot'));
    neutrals = readFromArrayBuckets(
      root,
      (n) => n.includes('neutr') || n.includes('passiv'),
    );
    detractors = readFromArrayBuckets(root, (n) => n.includes('detrat'));
  }

  const apiNps = asNumber(root.nps, root.npsScore, root.score, totals.nps, totals.npsScore);
  const overview = withPercents(promoters, neutrals, detractors, total);
  if (apiNps !== 0 || (root.nps != null || root.npsScore != null)) {
    overview.npsScore = apiNps;
  }
  return overview;
}

export function normalizeNpsDashboardResponse(payload: unknown): DigisacNpsDashboardResponse {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const analystsRaw = Array.isArray(root.analysts) ? root.analysts : [];
  const analysts: NpsAnalystRow[] = analystsRaw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const userId = String(r.userId ?? r.id ?? '').trim();
      const name = String(r.name ?? r.userName ?? 'Analista').trim();
      const overview = normalizeNpsOverviewPayload(r.overview ?? r);
      return {
        userId,
        name,
        total: overview.total,
        overview,
      };
    })
    .filter((row): row is NpsAnalystRow => !!row?.userId);

  const overview = normalizeNpsOverviewPayload(root.overview ?? root);

  const analystsWithSafeOverview = analysts.map((row) => ({
    ...row,
    overview: normalizeNpsOverviewPayload(row.overview ?? row),
  }));

  const debug = root._debug && typeof root._debug === 'object' ? root._debug as DigisacNpsDashboardResponse['_debug'] : undefined;

  return {
    departmentId: String(root.departmentId ?? ''),
    departmentName: String(root.departmentName ?? 'Suporte'),
    overview,
    analysts: analystsWithSafeOverview,
    dataSource: typeof root.dataSource === 'string' ? root.dataSource : undefined,
    answersRowCount: typeof root.answersRowCount === 'number' ? root.answersRowCount : undefined,
    scoredAnswerCount: typeof root.scoredAnswerCount === 'number' ? root.scoredAnswerCount : undefined,
    period: root.period && typeof root.period === 'object'
      ? {
          from: String((root.period as Record<string, unknown>).from ?? ''),
          to: String((root.period as Record<string, unknown>).to ?? ''),
        }
      : undefined,
    _debug: debug,
  };
}
