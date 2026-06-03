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

export function mergeNpsCounts(a: NpsCounts, b: NpsCounts): NpsCounts {
  return {
    total: a.total + b.total,
    promoters: a.promoters + b.promoters,
    neutrals: a.neutrals + b.neutrals,
    detractors: a.detractors + b.detractors,
  };
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
  return String(r.name ?? r.fullName ?? r.displayName ?? r.label ?? "").trim();
};

const isEvaluationTypeLabel = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  return v === "nps" || v === "csat" || v === "survey";
};

const classificationFromRow = (row: Record<string, unknown>): string => {
  const parts = [
    row.classification,
    row.classificacao,
    row.classificacaoAvaliacao,
    row.classificacao_avaliacao,
    row.category,
    row.categoria,
    row.tipoClassificacao,
    row.tipo_classificacao,
  ];
  for (const p of parts) {
    const s = String(p ?? "").toLowerCase();
    if (s) return s;
  }
  const tipo = String(row.type ?? row.tipo ?? "").toLowerCase();
  if (tipo && !isEvaluationTypeLabel(tipo)) return tipo;
  return "";
};

const scoreFromClassification = (label: string): number | null => {
  if (!label) return null;
  if (label.includes("promot")) return 10;
  if (label.includes("neutr") || label.includes("passiv")) return 8;
  if (label.includes("detrat")) return 5;
  return null;
};

const INVALID_ANSWER_TEXT = new Set([
  "nv", "n/a", "na", "não avaliado", "nao avaliado", "não avaliada", "nao avaliada",
  "-", "null", "undefined", "invalid", "inválido", "invalido",
]);

/** Resposta textual do cliente na API Digisac (`text`, `aiText`, `reason`). */
export function parseScoreFromText(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (INVALID_ANSWER_TEXT.has(trimmed.toLowerCase())) return null;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "number" && parsed >= 0 && parsed <= 10) return Math.round(parsed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const o = parsed as Record<string, unknown>;
        for (const k of ["score", "nota", "value", "rating", "answer", "nps"]) {
          const s = parseScoreFromFieldValue(o[k]);
          if (s != null) return s;
        }
      }
    } catch {
      /* texto livre */
    }
  }

  const fromClass = scoreFromClassification(trimmed.toLowerCase());
  if (fromClass != null) return fromClass;

  const direct = asNumber(trimmed);
  if (direct != null && direct >= 0 && direct <= 10) return Math.round(direct);

  const digit = trimmed.match(/\b(10|[0-9])\b/);
  if (digit) {
    const n = Number(digit[1]);
    if (n >= 0 && n <= 10) return n;
  }

  return null;
}

export function parseScoreFromFieldValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.round(value);
    if (n >= 0 && n <= 10) return n;
    return null;
  }
  if (typeof value === "string") return parseScoreFromText(value);
  return null;
}

/** CSAT gerado por IA (nota 1–5) — não entra no NPS. */
export function isDigisacCsatAiRow(row: Record<string, unknown>): boolean {
  if (row.aiGenerated !== true) return false;
  const score = parseScoreFromText(String(row.aiText ?? row.text ?? ""));
  return score != null && score >= 1 && score <= 5;
}

const SCORE_FIELD_KEYS = [
  "score", "rating", "grade", "nota", "notaAtribuida", "nota_atribuida",
  "assignedScore", "assigned_score", "ratingValue", "rating_value",
  "value", "answer", "nps", "rate", "surveyScore", "survey_score",
  "points", "pontuacao", "pontuação",
];

const TEXT_SCORE_KEYS = ["text", "aiText", "ai_text", "reason", "motivo", "response", "resposta"];

const readScoreFromObject = (obj: Record<string, unknown>, depth = 0): number | null => {
  if (depth > 4) return null;

  for (const key of TEXT_SCORE_KEYS) {
    const s = parseScoreFromFieldValue(obj[key]);
    if (s != null) return s;
  }

  for (const key of SCORE_FIELD_KEYS) {
    const val = obj[key];
    if (typeof val === "string" || typeof val === "number") {
      const n = asNumber(val);
      if (n != null && n >= 0 && n <= 10) return Math.round(n);
    }
    if (val && typeof val === "object") {
      const nested = readScoreFromObject(val as Record<string, unknown>, depth + 1);
      if (nested != null) return nested;
    }
  }

  const fromClass = scoreFromClassification(classificationFromRow(obj));
  if (fromClass != null) return fromClass;

  for (const key of ["evaluation", "survey", "response", "result", "data", "payload", "ticket", "message"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const s = readScoreFromObject(nested as Record<string, unknown>, depth + 1);
      if (s != null) return s;
    }
  }

  return null;
};

/** Linha já agregada (ex.: totais por analista na API). */
export function extractRowSummaryCounts(row: Record<string, unknown>): NpsCounts | null {
  const promoters = asNumber(
    row.promoters, row.promoter, row.promotores, row.promotor,
    row.promoterCount, row.promotersCount,
  ) ?? 0;
  const neutrals = asNumber(
    row.neutrals, row.neutral, row.neutros, row.neutro, row.passives, row.passive,
    row.neutralCount, row.neutralsCount,
  ) ?? 0;
  const detractors = asNumber(
    row.detractors, row.detractor, row.detratores, row.detrator,
    row.detractorCount, row.detractorsCount,
  ) ?? 0;
  const explicitTotal = asNumber(row.total, row.count, row.quantity, row.quantidade, row.answersCount);
  const sum = promoters + neutrals + detractors;
  const total = explicitTotal != null && explicitTotal > 0 ? explicitTotal : sum;
  if (total <= 0) return null;
  return { total, promoters, neutrals, detractors };
}

export function extractAnswerScore(row: Record<string, unknown>): number | null {
  if (isDigisacCsatAiRow(row)) return null;

  const summary = extractRowSummaryCounts(row);
  if (summary && summary.total === 1) {
    if (summary.promoters === 1) return 10;
    if (summary.neutrals === 1) return 8;
    if (summary.detractors === 1) return 5;
  }

  const direct = readScoreFromObject(row);
  if (direct != null) return direct;

  return scoreFromClassification(classificationFromRow(row));
}

/** Filtra respostas NPS válidas no período (API /answers costuma vir sem filtro de data). */
export function filterNpsAnswerRows(
  rows: Record<string, unknown>[],
  fromIso: string,
  toIso: string,
  npsQuestionIds?: Set<string>,
): Record<string, unknown>[] {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();

  return rows.filter((row) => {
    if (row.deletedAt != null) return false;
    if (isDigisacCsatAiRow(row)) return false;

    const qid = String(row.questionId ?? row.question_id ?? "").trim();
    if (npsQuestionIds && npsQuestionIds.size > 0 && qid && !npsQuestionIds.has(qid)) {
      return false;
    }

    const score = extractAnswerScore(row);
    if (score == null) return false;

    const created = row.createdAt ?? row.created_at ?? row.updatedAt;
    if (!created) return true;
    const ms = new Date(String(created)).getTime();
    if (Number.isNaN(ms)) return true;
    return ms >= fromMs && ms <= toMs;
  });
}

export function extractAnswerAnalystName(row: Record<string, unknown>): string {
  const keys = [
    "attendantName", "attendant_name", "userName", "user_name", "agentName", "agent_name",
    "atendeuNoChamado", "atendeu_no_chamado", "ultimoAtendente", "ultimo_atendente",
    "attendedBy", "attended_by", "lastUser", "last_user", "lastAttendant", "last_attendant",
    "user", "attendant", "agent", "usuario", "atendente", "operator", "operador",
  ];
  for (const key of keys) {
    const val = row[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    const nested = pickNestedName(val);
    if (nested) return nested;
  }
  for (const key of ["ticket", "protocol", "call", "chamado"]) {
    const nested = row[key];
    if (nested && typeof nested === "object") {
      const name = extractAnswerAnalystName(nested as Record<string, unknown>);
      if (name) return name;
    }
  }
  return "";
}

export function normalizeComparableName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function extractAnswerUserId(row: Record<string, unknown>): string {
  const injected = String(row._digisacUserId ?? "").trim();
  if (injected) return injected;

  for (const key of [
    "userId", "user_id", "attendantId", "attendant_id", "agentId", "agent_id",
    "lastUserId", "last_user_id", "lastAttendantId", "operatorId",
  ]) {
    const id = String(row[key] ?? "").trim();
    if (id) return id;
  }
  for (const key of ["user", "attendant", "agent", "lastUser", "attendedBy", "lastAttendant", "operator"]) {
    const nested = row[key];
    if (nested && typeof nested === "object") {
      const id = String((nested as Record<string, unknown>).id ?? "").trim();
      if (id) return id;
    }
  }
  for (const key of ["ticket", "protocol", "call"]) {
    const nested = row[key];
    if (nested && typeof nested === "object") {
      const id = extractAnswerUserId(nested as Record<string, unknown>);
      if (id) return id;
    }
  }
  return "";
}

export type MappedAnalystRef = { id: string; name: string };

export function aggregateAnswersByMappedAnalysts(
  rows: Record<string, unknown>[],
  mappedAnalysts: MappedAnalystRef[],
): Map<string, NpsCounts> {
  const idSet = new Set(mappedAnalysts.map((a) => a.id));
  const nameToId = new Map<string, string>();
  for (const a of mappedAnalysts) {
    nameToId.set(normalizeComparableName(a.name), a.id);
  }

  const byAnalyst = new Map<string, NpsCounts>();
  for (const a of mappedAnalysts) {
    byAnalyst.set(a.id, emptyNpsCounts());
  }

  for (const row of rows) {
    const summary = extractRowSummaryCounts(row);
    let countsToAdd: NpsCounts | null = summary;

    if (!countsToAdd || (summary && summary.total <= 3 && extractAnswerScore(row) != null)) {
      const score = extractAnswerScore(row);
      if (score != null) {
        countsToAdd = addScoreToCounts(emptyNpsCounts(), score);
      }
    }

    if (!countsToAdd || countsToAdd.total <= 0) continue;

    let analystId = extractAnswerUserId(row);
    if (!analystId || !idSet.has(analystId)) {
      const key = normalizeComparableName(extractAnswerAnalystName(row));
      analystId = nameToId.get(key) ?? "";
    }
    if (!analystId || !idSet.has(analystId)) continue;

    const prev = byAnalyst.get(analystId) ?? emptyNpsCounts();
    byAnalyst.set(analystId, mergeNpsCounts(prev, countsToAdd));
  }

  return byAnalyst;
}

export function aggregateAnswerRows(rows: Record<string, unknown>[]): NpsCounts {
  let counts = emptyNpsCounts();
  for (const row of rows) {
    const summary = extractRowSummaryCounts(row);
    if (summary && summary.total > 1) {
      counts = mergeNpsCounts(counts, summary);
      continue;
    }
    const score = extractAnswerScore(row);
    if (score == null) continue;
    counts = addScoreToCounts(counts, score);
  }
  return counts;
}

export function countScoredAnswerRows(rows: Record<string, unknown>[]): number {
  let n = 0;
  for (const row of rows) {
    const summary = extractRowSummaryCounts(row);
    if (summary && summary.total > 0) {
      n += summary.total;
      continue;
    }
    if (extractAnswerScore(row) != null) n += 1;
  }
  return n;
}

export function flattenAnswersPayload(payload: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const pushRow = (row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? r._id ?? r.protocol ?? r.protocolo ?? "").trim();
    const key = id || JSON.stringify(r).slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };

  const walk = (node: unknown, depth = 0) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) pushRow(item);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    for (const key of ["data", "items", "rows", "answers", "results", "records", "list"]) {
      const val = obj[key];
      if (Array.isArray(val)) {
        for (const item of val) pushRow(item);
      } else if (val && typeof val === "object") {
        walk(val, depth + 1);
      }
    }
  };

  walk(payload);
  return out;
}

export function readAnswersPagination(payload: unknown): { page: number; pageCount: number } {
  if (!payload || typeof payload !== "object") return { page: 1, pageCount: 1 };
  const root = payload as Record<string, unknown>;
  const meta = (root.meta ?? root.pagination ?? root.pageInfo ?? root) as Record<string, unknown>;
  const page = asNumber(meta.page, meta.currentPage, meta.pageNumber) ?? 1;
  const pageCount = asNumber(
    meta.pageCount,
    meta.lastPage,
    meta.totalPages,
    meta.pages,
  ) ?? 1;
  return { page, pageCount: Math.max(1, pageCount) };
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
