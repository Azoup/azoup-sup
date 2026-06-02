export type NpsCounts = {
  total: number;
  promoters: number;
  neutrals: number;
  detractors: number;
};

export function classifyNpsScore(score: number): "promoter" | "neutral" | "detractor" | null {
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  if (score >= 9) return "promoter";
  if (score >= 7) return "neutral";
  return "detractor";
}

export function emptyNpsCounts(): NpsCounts {
  return { total: 0, promoters: 0, neutrals: 0, detractors: 0 };
}

export function addScoreToCounts(counts: NpsCounts, score: number): NpsCounts {
  const bucket = classifyNpsScore(score);
  if (!bucket) return counts;
  const next = { ...counts, total: counts.total + 1 };
  if (bucket === "promoter") next.promoters += 1;
  else if (bucket === "neutral") next.neutrals += 1;
  else next.detractors += 1;
  return next;
}

const asNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value.trim().replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
};

const pickNestedName = (obj: unknown): string => {
  if (!obj || typeof obj !== "object") return "";
  const r = obj as Record<string, unknown>;
  return String(r.name ?? r.fullName ?? r.displayName ?? "").trim();
};

export function extractAnswerScore(row: Record<string, unknown>): number | null {
  const direct = asNumber(row.score, row.rating, row.grade, row.nota, row.value, row.answer, row.nps);
  if (direct != null && direct >= 0 && direct <= 10) return Math.round(direct);
  const classification = String(row.classification ?? row.classificacao ?? "").toLowerCase();
  if (classification.includes("promot")) return 10;
  if (classification.includes("neutr") || classification.includes("passiv")) return 8;
  if (classification.includes("detrat")) return 5;
  return null;
}

export function extractAnswerAnalystName(row: Record<string, unknown>): string {
  const keys = [
    "attendantName", "userName", "agentName", "atendeuNoChamado", "attendedBy", "lastUser", "user", "attendant", "agent",
  ];
  for (const key of keys) {
    const val = row[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    const nested = pickNestedName(val);
    if (nested) return nested;
  }
  return "";
}

export function aggregateAnswerRows(rows: Record<string, unknown>[]): NpsCounts {
  let counts = emptyNpsCounts();
  for (const row of rows) {
    const score = extractAnswerScore(row);
    if (score == null) continue;
    counts = addScoreToCounts(counts, score);
  }
  return counts;
}

export function flattenAnswersPayload(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
  }
  if (typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  for (const key of ["data", "items", "rows", "answers", "results"]) {
    const val = root[key];
    if (Array.isArray(val)) {
      return val.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
    }
  }
  return [];
}

export function countsToMappedOverview(counts: NpsCounts) {
  const total = counts.total;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);
  const npsScore = total > 0
    ? Math.round(((counts.promoters - counts.detractors) / total) * 10000) / 100
    : null;
  return {
    total,
    npsScore,
    promoters: { count: counts.promoters, percent: pct(counts.promoters) },
    neutrals: { count: counts.neutrals, percent: pct(counts.neutrals) },
    detractors: { count: counts.detractors, percent: pct(counts.detractors) },
  };
}
