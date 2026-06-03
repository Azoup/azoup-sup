import {
  buildDigisacAnswersFromToParams,
  buildDigisacAnswersPeriodParams,
  mapDigisacAnswersOverview,
  type DigisacAnswersQueryBase,
  type MappedNpsOverview,
} from "./digisacAnswersOverview.ts";
import {
  aggregateAnswerRows,
  countsToMappedOverview,
  emptyNpsCounts,
  flattenAnswersPayload,
} from "./digisacNpsAggregate.ts";

export type FetchDigisacFn = (
  endpoint: string,
  params?: URLSearchParams,
) => Promise<{ ok: boolean; status: number; data: unknown }>;

export async function fetchDigisacNpsOverview(
  fetchDigisac: FetchDigisacFn,
  base: DigisacAnswersQueryBase,
): Promise<MappedNpsOverview> {
  const empty = countsToMappedOverview(emptyNpsCounts());
  const attempts: URLSearchParams[] = [
    buildDigisacAnswersFromToParams(base),
    buildDigisacAnswersPeriodParams(base),
    buildDigisacAnswersFromToParams({ ...base, type: "nps" }),
  ];

  const seen = new Set<string>();
  for (const params of attempts) {
    const key = params.toString();
    if (seen.has(key)) continue;
    seen.add(key);

    const r = await fetchDigisac("/api/v1/answers/overview", params);
    if (!r.ok) continue;
    const mapped = mapDigisacAnswersOverview(r.data);
    if (mapped.total > 0) {
      console.log("[Digisac NPS] overview OK:", key.slice(0, 120), "total=", mapped.total);
      return mapped;
    }
  }

  return empty;
}

export async function fetchDigisacAnswersRows(
  fetchDigisac: FetchDigisacFn,
  base: DigisacAnswersQueryBase,
): Promise<Record<string, unknown>[]> {
  const paramSets = [
    buildDigisacAnswersFromToParams(base),
    buildDigisacAnswersPeriodParams(base),
  ];
  const collected: Record<string, unknown>[] = [];
  const seenQs = new Set<string>();

  for (const baseParams of paramSets) {
    const qsKey = baseParams.toString();
    if (seenQs.has(qsKey)) continue;
    seenQs.add(qsKey);

    for (let page = 1; page <= 80; page++) {
      const params = new URLSearchParams(baseParams);
      params.set("limit", "200");
      params.set("page", String(page));
      const r = await fetchDigisac("/api/v1/answers", params);
      if (!r.ok) {
        if (page === 1) console.warn("[Digisac NPS] /answers", r.status, qsKey.slice(0, 80));
        break;
      }
      const batch = flattenAnswersPayload(r.data);
      if (!batch.length) break;
      collected.push(...batch);
      if (batch.length < 200) break;
    }
    if (collected.length > 0) break;
  }

  return collected;
}

/** Soma overviews por analista quando o overview do departamento vem vazio. */
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
