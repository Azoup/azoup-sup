import {
  aggregateAnswerRows,
  countsToMappedOverview,
  extractAnswerUserId,
  flattenAnswersPayload,
} from "./digisacNpsAggregate.ts";

/**
 * GET /api/v1/answers/overview e GET /api/v1/answers
 */

export type DigisacAnswersQueryBase = {
  from: string;
  to: string;
  departmentId: string;
  userId?: string;
  type?: "nps" | "csat";
  periodType?: "all" | "close" | "open";
  serviceId?: string;
};

export function buildDigisacAnswersFromToParams(input: DigisacAnswersQueryBase): URLSearchParams {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
    departmentId: input.departmentId && input.departmentId !== "all" ? input.departmentId : "all",
  });
  if (input.periodType) params.set("periodType", input.periodType);
  if (input.type) params.set("type", input.type);
  if (input.userId && input.userId !== "all") params.set("userId", input.userId);
  if (input.serviceId?.trim()) params.set("serviceId", input.serviceId.trim());
  return params;
}

export function buildDigisacAnswersPeriodParams(input: DigisacAnswersQueryBase): URLSearchParams {
  const params = new URLSearchParams({
    startPeriod: input.from,
    endPeriod: input.to,
    periodType: input.periodType ?? "all",
    departmentId: input.departmentId && input.departmentId !== "all" ? input.departmentId : "all",
  });
  if (input.type) params.set("type", input.type);
  if (input.userId && input.userId !== "all") params.set("userId", input.userId);
  if (input.serviceId?.trim()) params.set("serviceId", input.serviceId.trim());
  return params;
}

/** Filtro estilo legado Digisac (where[field]). */
export function buildDigisacAnswersWhereParams(input: DigisacAnswersQueryBase): URLSearchParams {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
    periodType: input.periodType ?? "all",
  });
  if (input.departmentId && input.departmentId !== "all") {
    params.set("where[departmentId]", input.departmentId);
    params.set("departmentId", input.departmentId);
  }
  if (input.type) params.set("type", input.type);
  if (input.userId && input.userId !== "all") {
    params.set("where[userId]", input.userId);
    params.set("userId", input.userId);
  }
  return params;
}

/** Variantes alinhadas à doc Postman Digisac (overview por dept: from/to + type, sem periodType). */
export function buildDigisacDocOverviewParams(base: DigisacAnswersQueryBase): URLSearchParams[] {
  const list: URLSearchParams[] = [];
  const dept = base.departmentId && base.departmentId !== "all" ? base.departmentId : "";
  const uid = base.userId && base.userId !== "all" ? base.userId : "";

  if (dept) {
    const p = new URLSearchParams({ from: base.from, to: base.to, departmentId: dept, type: "nps" });
    if (uid) p.set("userId", uid);
    list.push(p);
  }

  if (uid && dept) {
    list.push(new URLSearchParams({
      from: base.from,
      to: base.to,
      departmentId: dept,
      userId: uid,
      type: "nps",
    }));
  }

  const periodDept = new URLSearchParams({ startPeriod: base.from, endPeriod: base.to });
  if (dept) periodDept.set("departmentId", dept);
  if (uid) periodDept.set("userId", uid);
  periodDept.set("type", "nps");
  list.push(periodDept);

  return list;
}

export function buildAllNpsOverviewVariants(base: DigisacAnswersQueryBase): URLSearchParams[] {
  const seen = new Set<string>();
  const list: URLSearchParams[] = [];
  const add = (p: URLSearchParams) => {
    const k = p.toString();
    if (!k || seen.has(k)) return;
    seen.add(k);
    list.push(p);
  };

  for (const p of buildDigisacDocOverviewParams(base)) add(p);

  add(buildDigisacAnswersFromToParams({ ...base, type: "nps" }));
  add(buildDigisacAnswersFromToParams({ ...base, type: undefined }));
  add(buildDigisacAnswersPeriodParams({ ...base, type: "nps" }));
  add(buildDigisacAnswersPeriodParams({ ...base, type: undefined }));
  add(buildDigisacAnswersWhereParams({ ...base, type: "nps" }));
  add(buildDigisacAnswersWhereParams({ ...base, type: undefined }));

  if (base.serviceId?.trim()) {
    const full = new URLSearchParams({
      from: base.from,
      to: base.to,
      type: "nps",
      periodType: base.periodType ?? "all",
      serviceId: base.serviceId.trim(),
    });
    if (base.departmentId && base.departmentId !== "all") full.set("departmentId", base.departmentId);
    if (base.userId && base.userId !== "all") full.set("userId", base.userId);
    add(full);
  }

  return list;
}

/** @deprecated use buildAllNpsOverviewVariants */
export function buildAllNpsQueryVariants(base: DigisacAnswersQueryBase): URLSearchParams[] {
  return buildAllNpsOverviewVariants(base);
}

export function buildAnswersListParamVariants(base: DigisacAnswersQueryBase): URLSearchParams[] {
  const seen = new Set<string>();
  const list: URLSearchParams[] = [];
  const add = (p: URLSearchParams) => {
    const k = p.toString();
    if (seen.has(k)) return;
    seen.add(k);
    list.push(p);
  };

  add(new URLSearchParams());

  if (base.departmentId && base.departmentId !== "all") {
    const p = new URLSearchParams({
      from: base.from,
      to: base.to,
      departmentId: base.departmentId,
      type: "nps",
    });
    add(p);

    const where = new URLSearchParams({
      from: base.from,
      to: base.to,
      type: "nps",
    });
    where.set("where[departmentId]", base.departmentId);
    add(where);
  }

  add(buildDigisacAnswersFromToParams({ ...base, type: "nps" }));

  return list;
}

/** @deprecated */
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
  for (const key of ["items", "categories", "breakdown", "groups", "segments", "data", "rows", "series", "result"]) {
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

const isCategoryBucketRow = (row: Record<string, unknown>): boolean => {
  if (extractAnswerUserId(row) || String(row.userName ?? row.attendantName ?? "").trim()) return false;
  const name = String(row.name ?? row.label ?? row.category ?? row.tipo ?? "").toLowerCase();
  if (!name) return false;
  const isBucket = name.includes("promot") || name.includes("neutr") || name.includes("passiv") || name.includes("detrat");
  if (!isBucket) return false;
  const tipo = String(row.type ?? "").toLowerCase();
  if (tipo === "nps" || tipo === "csat") return false;
  const score = asNumber(row.score, row.rating, row.nota, row.notaAtribuida, row.value);
  return !(score != null && score >= 0 && score <= 10);
};

const deepExtractNps = (
  node: unknown,
  depth = 0,
  visited = new Set<unknown>(),
): { promoters: { count: number; percent: number }; neutrals: { count: number; percent: number }; detractors: { count: number; percent: number } } | null => {
  if (depth > 10 || !node || typeof node !== "object" || visited.has(node)) return null;
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
  if (Array.isArray(top)) {
    return (top as unknown[]).filter((r) => r && typeof r === "object") as Record<string, unknown>[];
  }
  if (top.data && typeof top.data === "object") {
    if (Array.isArray(top.data)) {
      for (const row of top.data) {
        if (row && typeof row === "object") roots.push(row as Record<string, unknown>);
      }
    } else {
      roots.push(top.data as Record<string, unknown>);
    }
  }
  for (const key of ["overview", "result", "stats", "totals"]) {
    if (top[key] && typeof top[key] === "object" && !Array.isArray(top[key])) {
      roots.push(top[key] as Record<string, unknown>);
    }
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
  const allRows = flattenAnswersPayload(payload);
  const answerRows = allRows.filter((r) => !isCategoryBucketRow(r));

  if (answerRows.length > 0) {
    return countsToMappedOverview(aggregateAnswerRows(answerRows));
  }

  if (allRows.length >= 2 && allRows.every(isCategoryBucketRow)) {
    let promoters = { count: 0, percent: 0 };
    let neutrals = { count: 0, percent: 0 };
    let detractors = { count: 0, percent: 0 };
    for (const row of allRows) {
      const name = String(row.name ?? row.label ?? row.type ?? row.tipo ?? "").toLowerCase();
      const cp = readCountPercent(row);
      if (name.includes("promot")) promoters = cp;
      else if (name.includes("neutr") || name.includes("passiv")) neutrals = cp;
      else if (name.includes("detrat")) detractors = cp;
    }
    const total = promoters.count + neutrals.count + detractors.count;
    if (total > 0) {
      return countsToMappedOverview({ total, promoters: promoters.count, neutrals: neutrals.count, detractors: detractors.count });
    }
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

  return countsToMappedOverview({ total: 0, promoters: 0, neutrals: 0, detractors: 0 });
};

export const pickSuporteDepartmentId = (
  departments: Array<{ id: string; name: string }>,
): string | undefined => {
  const exact = departments.find((d) => d.name.trim().toLowerCase() === "suporte");
  if (exact) return exact.id;
  return departments.find((d) => /suporte/i.test(d.name.trim()))?.id;
};

export type DigisacAnswersOverviewParams = DigisacAnswersQueryBase;
