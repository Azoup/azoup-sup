import {
  aggregateAnswerRows,
  countsToMappedOverview,
  flattenAnswersPayload,
} from "./digisacNpsAggregate.ts";

/**
 * GET /api/v1/answers/overview e GET /api/v1/answers
 * Doc: from/to OU startPeriod/endPeriod (não misturar na mesma query).
 */

export type DigisacAnswersQueryBase = {
  from: string;
  to: string;
  departmentId: string;
  userId?: string;
  type: "nps" | "csat";
  periodType: "all" | "close" | "open";
  serviceId?: string;
};

/** Filtro completo (doc: departamento / usuário / conexão). */
export function buildDigisacAnswersFromToParams(input: DigisacAnswersQueryBase): URLSearchParams {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
    type: input.type,
    periodType: input.periodType,
    departmentId: input.departmentId && input.departmentId !== "all" ? input.departmentId : "all",
  });
  if (input.userId && input.userId !== "all") params.set("userId", input.userId);
  if (input.serviceId?.trim()) params.set("serviceId", input.serviceId.trim());
  return params;
}

/** Variante por período (doc: startPeriod + endPeriod). */
export function buildDigisacAnswersPeriodParams(
  input: DigisacAnswersQueryBase,
): URLSearchParams {
  const params = new URLSearchParams({
    startPeriod: input.from,
    endPeriod: input.to,
    type: input.type,
    periodType: input.periodType,
    departmentId: input.departmentId && input.departmentId !== "all" ? input.departmentId : "all",
  });
  if (input.userId && input.userId !== "all") params.set("userId", input.userId);
  if (input.serviceId?.trim()) params.set("serviceId", input.serviceId.trim());
  return params;
}

/** @deprecated use buildDigisacAnswersFromToParams */
export function buildDigisacAnswersOverviewParams(input: DigisacAnswersQueryBase): URLSearchParams {
  return buildDigisacAnswersFromToParams(input);
}

export function buildDigisacAnswersPeriodOverviewParams(
  startPeriod: string,
  endPeriod: string,
  type: "nps" | "csat" = "nps",
): URLSearchParams {
  return new URLSearchParams({ startPeriod, endPeriod, type });
}

const asNumber = (...values: unknown[]): number => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(String(value).replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
};

const readCountPercent = (node: unknown): { count: number; percent: number } => {
  if (!node || typeof node !== "object") return { count: 0, percent: 0 };
  const o = node as Record<string, unknown>;
  return {
    count: asNumber(o.count, o.quantity, o.quantidade, o.total, o.value, o.amount, o.qty),
    percent: asNumber(o.percent, o.percentage, o.porcentagem, o.rate, o.pct),
  };
};

const readCategoryNode = (
  source: Record<string, unknown>,
  keys: string[],
): { count: number; percent: number } => {
  for (const key of keys) {
    if (!(key in source)) continue;
    const parsed = readCountPercent(source[key]);
    if (parsed.count > 0 || parsed.percent > 0) return parsed;
  }
  return { count: 0, percent: 0 };
};

const readFromArrayBuckets = (
  source: Record<string, unknown>,
  matcher: (name: string) => boolean,
): { count: number; percent: number } => {
  for (const key of ["items", "categories", "breakdown", "groups", "segments", "data", "rows", "series"]) {
    const value = source[key];
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (!row || typeof row !== "object") continue;
      const obj = row as Record<string, unknown>;
      const name = String(
        obj.name ?? obj.label ?? obj.type ?? obj.key ?? obj.tipo ?? obj.category ?? "",
      ).toLowerCase();
      if (!matcher(name)) continue;
      return readCountPercent(obj);
    }
  }
  return { count: 0, percent: 0 };
};

/** Varre JSON (até 6 níveis) procurando blocos NPS. */
const deepExtractNps = (
  node: unknown,
  depth = 0,
  visited = new Set<unknown>(),
): { promoters: { count: number; percent: number }; neutrals: { count: number; percent: number }; detractors: { count: number; percent: number } } | null => {
  if (depth > 8 || !node || typeof node !== "object" || visited.has(node)) {
    return null;
  }
  visited.add(node);

  const obj = node as Record<string, unknown>;
  let promoters = readCategoryNode(obj, [
    "promoters", "promoter", "Promoters", "promotores", "promotor", "PROMOTERS",
  ]);
  let neutrals = readCategoryNode(obj, [
    "neutrals", "neutral", "passive", "passives", "Neutrals", "neutros", "neutro", "passivos",
  ]);
  let detractors = readCategoryNode(obj, [
    "detractors", "detractor", "Detractors", "detratores", "detrator", "DETRACTORS",
  ]);

  if (!promoters.count && !neutrals.count && !detractors.count) {
    promoters = readFromArrayBuckets(obj, (n) => n.includes("promot"));
    neutrals = readFromArrayBuckets(obj, (n) => n.includes("neutr") || n.includes("passiv"));
    detractors = readFromArrayBuckets(obj, (n) => n.includes("detrat"));
  }

  const sum = promoters.count + neutrals.count + detractors.count;
  if (sum > 0) return { promoters, neutrals, detractors };

  for (const value of Object.values(obj)) {
    if (!value || typeof value !== "object") continue;
    const found = deepExtractNps(value, depth + 1, visited);
    if (found) return found;
  }
  return null;
};

const collectPayloadRoots = (payload: unknown): Record<string, unknown>[] => {
  const roots: Record<string, unknown>[] = [];
  if (!payload || typeof payload !== "object") return roots;
  const top = payload as Record<string, unknown>;
  roots.push(top);
  if (top.data && typeof top.data === "object") {
    if (Array.isArray(top.data)) {
      for (const row of top.data) {
        if (row && typeof row === "object") roots.push(row as Record<string, unknown>);
      }
    } else {
      roots.push(top.data as Record<string, unknown>);
    }
  }
  if (top.overview && typeof top.overview === "object") {
    roots.push(top.overview as Record<string, unknown>);
  }
  if (top.result && typeof top.result === "object") {
    roots.push(top.result as Record<string, unknown>);
  }
  return roots;
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

  for (const root of collectPayloadRoots(payload)) {
    const deep = deepExtractNps(root);
    if (deep) {
      const total = deep.promoters.count + deep.neutrals.count + deep.detractors.count;
      const pct = (n: number, explicit: number) => {
        if (explicit > 0) return Math.round(explicit * 100) / 100;
        return total > 0 ? Math.round((n / total) * 10000) / 100 : 0;
      };
      const apiNps = asNumber(root.nps, root.npsScore, root.score, root.indiceNps);
      const npsScore = apiNps !== 0 || root.nps != null
        ? apiNps
        : total > 0
        ? Math.round(((deep.promoters.count - deep.detractors.count) / total) * 10000) / 100
        : null;
      return {
        total,
        npsScore,
        promoters: { count: deep.promoters.count, percent: pct(deep.promoters.count, deep.promoters.percent) },
        neutrals: { count: deep.neutrals.count, percent: pct(deep.neutrals.count, deep.neutrals.percent) },
        detractors: { count: deep.detractors.count, percent: pct(deep.detractors.count, deep.detractors.percent) },
      };
    }
  }

  const empty = countsToMappedOverview({ total: 0, promoters: 0, neutrals: 0, detractors: 0 });
  return empty;
};

export const pickSuporteDepartmentId = (
  departments: Array<{ id: string; name: string }>,
): string | undefined => {
  const exact = departments.find((d) => d.name.trim().toLowerCase() === "suporte");
  if (exact) return exact.id;
  return departments.find((d) => /suporte/i.test(d.name.trim()))?.id;
};

export type DigisacAnswersOverviewParams = DigisacAnswersQueryBase;
