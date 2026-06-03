import {
  buildAllNpsOverviewVariants,
  buildAnswersListParamVariants,
  mapDigisacAnswersOverview,
  type DigisacAnswersQueryBase,
  type MappedNpsOverview,
} from "./digisacAnswersOverview.ts";
import {
  aggregateAnswerRows,
  countScoredAnswerRows,
  countsToMappedOverview,
  emptyNpsCounts,
  flattenAnswersPayload,
  readAnswersPagination,
} from "./digisacNpsAggregate.ts";

export type FetchDigisacFn = (
  endpoint: string,
  params?: URLSearchParams,
) => Promise<{ ok: boolean; status: number; data: unknown; url?: string }>;

export type NpsFetchAttempt = {
  endpoint: string;
  query: string;
  status: number;
  ok: boolean;
  mappedTotal: number;
  sampleKeys: string[];
};

export type NpsFetchResult = {
  overview: MappedNpsOverview;
  attempts: NpsFetchAttempt[];
  answerRows: Record<string, unknown>[];
};

const sampleKeys = (data: unknown): string[] => {
  if (!data || typeof data !== "object") return [];
  const keys = Object.keys(data as Record<string, unknown>);
  const dataVal = (data as Record<string, unknown>).data;
  if (dataVal && typeof dataVal === "object") {
    if (Array.isArray(dataVal) && dataVal[0] && typeof dataVal[0] === "object") {
      return [...keys, "data[]", ...Object.keys(dataVal[0] as Record<string, unknown>)].slice(0, 24);
    }
    return [...keys, "data", ...Object.keys(dataVal as Record<string, unknown>)].slice(0, 24);
  }
  return keys.slice(0, 24);
};

export async function fetchDigisacNpsOverviewWithProbe(
  fetchDigisac: FetchDigisacFn,
  base: DigisacAnswersQueryBase,
  endpoint = "/api/v1/answers/overview",
): Promise<{ overview: MappedNpsOverview; attempts: NpsFetchAttempt[] }> {
  const empty = countsToMappedOverview(emptyNpsCounts());
  const attempts: NpsFetchAttempt[] = [];
  let best = empty;

  for (const params of buildAllNpsOverviewVariants(base)) {
    const r = await fetchDigisac(endpoint, params);
    const mapped = r.ok ? mapDigisacAnswersOverview(r.data) : empty;
    attempts.push({
      endpoint,
      query: params.toString(),
      status: r.status,
      ok: r.ok,
      mappedTotal: mapped.total,
      sampleKeys: r.ok ? sampleKeys(r.data) : [],
    });
    if (r.ok && mapped.total > best.total) {
      best = mapped;
      console.log("[Digisac NPS] overview total=", mapped.total, params.toString().slice(0, 120));
    }
    if (mapped.total > 0 && mapped.total >= 100) break;
  }

  return { overview: best, attempts };
}

export async function fetchDigisacAnswersRows(
  fetchDigisac: FetchDigisacFn,
  base: DigisacAnswersQueryBase,
): Promise<{ rows: Record<string, unknown>[]; attempts: NpsFetchAttempt[] }> {
  const attempts: NpsFetchAttempt[] = [];
  const collected: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const pushUnique = (batch: Record<string, unknown>[]) => {
    for (const row of batch) {
      const id = String(row.id ?? row._id ?? row.protocol ?? row.protocolo ?? "").trim();
      const key = id || JSON.stringify(row).slice(0, 160);
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(row);
    }
  };

  for (const baseParams of buildAnswersListParamVariants(base)) {
    let page = 1;
    let pageCount = 1;
    let scoredOnFirstPage = 0;

    while (page <= Math.max(pageCount, 1) && page <= 120) {
      const params = new URLSearchParams(baseParams);
      params.set("limit", "200");
      params.set("page", String(page));
      const r = await fetchDigisac("/api/v1/answers", params);
      const batch = r.ok ? flattenAnswersPayload(r.data) : [];

      if (r.ok) {
        const pg = readAnswersPagination(r.data);
        pageCount = Math.max(pageCount, pg.pageCount);
      }

      if (page === 1) {
        scoredOnFirstPage = countScoredAnswerRows(batch);
        attempts.push({
          endpoint: "/api/v1/answers",
          query: params.toString().slice(0, 220),
          status: r.status,
          ok: r.ok,
          mappedTotal: scoredOnFirstPage,
          sampleKeys: r.ok ? sampleKeys(r.data) : [],
        });
      }

      if (!r.ok || !batch.length) break;
      pushUnique(batch);
      if (batch.length < 200 && page >= pageCount) break;
      page += 1;
    }

    if (countScoredAnswerRows(collected) > 0) break;
    if (collected.length > 0 && scoredOnFirstPage > 0) break;
  }

  return { rows: collected, attempts };
}

export async function fetchDigisacNpsDashboardData(
  fetchDigisac: FetchDigisacFn,
  base: DigisacAnswersQueryBase,
): Promise<NpsFetchResult> {
  const chartUserId = base.userId;
  const deptBase = { ...base, userId: undefined };

  const deptOverview = await fetchDigisacNpsOverviewWithProbe(fetchDigisac, deptBase);
  const answersPack = await fetchDigisacAnswersRows(fetchDigisac, deptBase);

  let overview = deptOverview.overview;
  const attempts = [...deptOverview.attempts, ...answersPack.attempts];

  if (overview.total <= 0 && answersPack.rows.length > 0) {
    overview = countsToMappedOverview(aggregateAnswerRows(answersPack.rows));
    console.log("[Digisac NPS] overview via /answers agregado:", overview.total);
  }

  if (chartUserId) {
    const one = await fetchDigisacNpsOverviewWithProbe(fetchDigisac, { ...base, userId: chartUserId });
    attempts.push(...one.attempts);
    if (one.overview.total > 0) overview = one.overview;
  }

  return { overview, attempts, answerRows: answersPack.rows };
}

export async function fetchDigisacNpsOverview(
  fetchDigisac: FetchDigisacFn,
  base: DigisacAnswersQueryBase,
): Promise<MappedNpsOverview> {
  const r = await fetchDigisacNpsOverviewWithProbe(fetchDigisac, base);
  return r.overview;
}

export function sumOverviewFromParts(parts: MappedNpsOverview[]): MappedNpsOverview {
  let promoters = 0;
  let neutrals = 0;
  let detractors = 0;
  for (const p of parts) {
    promoters += p.promoters.count;
    neutrals += p.neutrals.count;
    detractors += p.detractors.count;
  }
  return countsToMappedOverview({ total: promoters + neutrals + detractors, promoters, neutrals, detractors });
}
