import {
  aggregateAnswerRows,
  countsToMappedOverview,
  flattenAnswersPayload,
} from "./digisacNpsAggregate.ts";

/**
 * Query oficial: GET /api/v1/answers/overview
 * Parâmetros: from, to, departmentId, userId, type, periodType, serviceId
 */

export type DigisacAnswersOverviewParams = {
  from: string;
  to: string;
  departmentId: string;
  userId?: string;
  type: "nps" | "csat";
  periodType: "all" | "close" | "open";
  serviceId?: string;
};

export function buildDigisacAnswersOverviewParams(input: DigisacAnswersOverviewParams): URLSearchParams {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
    startPeriod: input.from,
    endPeriod: input.to,
    type: input.type,
    periodType: input.periodType,
    departmentId: input.departmentId && input.departmentId !== "all" ? input.departmentId : "all",
  });
  if (input.userId && input.userId !== "all") {
    params.set("userId", input.userId);
  }
  if (input.serviceId?.trim()) {
    params.set("serviceId", input.serviceId.trim());
  }
  return params;
}

/** Variante documentada: overview só com startPeriod/endPeriod. */
export function buildDigisacAnswersPeriodOverviewParams(
  startPeriod: string,
  endPeriod: string,
  type: "nps" | "csat" = "nps",
): URLSearchParams {
  return new URLSearchParams({
    startPeriod,
    endPeriod,
    type,
  });
}

const asNumber = (...values: unknown[]): number => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
};

const firstObject = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
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
    if (!node || typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    return {
      count: asNumber(obj.count, obj.quantity, obj.total, obj.value, obj.amount),
      percent: asNumber(obj.percent, obj.percentage, obj.rate, obj.pct),
    };
  }
  return { count: 0, percent: 0 };
};

const readFromArrayBuckets = (
  source: Record<string, unknown>,
  matcher: (name: string) => boolean,
): { count: number; percent: number } => {
  for (const key of ["items", "categories", "breakdown", "groups", "segments", "data"]) {
    const value = source[key];
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (!row || typeof row !== "object") continue;
      const obj = row as Record<string, unknown>;
      const name = String(obj.name ?? obj.label ?? obj.type ?? obj.key ?? "").toLowerCase();
      if (!matcher(name)) continue;
      return {
        count: asNumber(obj.count, obj.quantity, obj.total, obj.value),
        percent: asNumber(obj.percent, obj.percentage, obj.rate),
      };
    }
  }
  return { count: 0, percent: 0 };
};

export type MappedNpsOverview = {
  total: number;
  npsScore: number | null;
  promoters: { count: number; percent: number };
  neutrals: { count: number; percent: number };
  detractors: { count: number; percent: number };
};

export const mapDigisacAnswersOverview = (payload: unknown): MappedNpsOverview => {
  const rows = flattenAnswersPayload(payload);
  if (rows.length > 0) {
    return countsToMappedOverview(aggregateAnswerRows(rows));
  }

  const root = firstObject(payload);
  const totals =
    root.totals && typeof root.totals === "object"
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

  let promoters = readCategoryNode(root, ["promoters", "promoter", "Promoters"]);
  let neutrals = readCategoryNode(root, ["neutrals", "neutral", "passive", "passives", "Neutrals"]);
  let detractors = readCategoryNode(root, ["detractors", "detractor", "Detractors"]);

  if (!promoters.count && !neutrals.count && !detractors.count) {
    promoters = readFromArrayBuckets(root, (n) => n.includes("promot"));
    neutrals = readFromArrayBuckets(root, (n) => n.includes("neutr") || n.includes("passiv"));
    detractors = readFromArrayBuckets(root, (n) => n.includes("detrat"));
  }

  const sum = promoters.count + neutrals.count + detractors.count;
  const effectiveTotal = total > 0 ? total : sum;

  const pct = (count: number, explicit: number) => {
    if (explicit > 0) return Math.round(explicit * 100) / 100;
    if (effectiveTotal <= 0) return 0;
    return Math.round((count / effectiveTotal) * 10000) / 100;
  };

  const apiNps = asNumber(root.nps, root.npsScore, root.score, totals.nps, totals.npsScore);
  const npsScore =
    apiNps !== 0 || root.nps != null || root.npsScore != null
      ? apiNps
      : effectiveTotal > 0
      ? Math.round(((promoters.count - detractors.count) / effectiveTotal) * 10000) / 100
      : null;

  return {
    total: effectiveTotal,
    npsScore,
    promoters: { count: promoters.count, percent: pct(promoters.count, promoters.percent) },
    neutrals: { count: neutrals.count, percent: pct(neutrals.count, neutrals.percent) },
    detractors: { count: detractors.count, percent: pct(detractors.count, detractors.percent) },
  };
};

export const pickSuporteDepartmentId = (
  departments: Array<{ id: string; name: string }>,
): string | undefined => departments.find((d) => /suporte/i.test(d.name.trim()))?.id;
