/** Agrega linhas de avaliação (API ou TXT) em totais NPS. */

export type NpsCounts = {
  total: number;
  promoters: number;
  neutrals: number;
  detractors: number;
};

export type NpsCountsWithScore = NpsCounts & { npsScore: number | null };

export function classifyNpsScore(score: number): 'promoter' | 'neutral' | 'detractor' | null {
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'neutral';
  return 'detractor';
}

export function countsToNpsScore(counts: NpsCounts): number | null {
  if (counts.total <= 0) return null;
  return Math.round(((counts.promoters - counts.detractors) / counts.total) * 10000) / 100;
}

export function addScoreToCounts(counts: NpsCounts, score: number): NpsCounts {
  const bucket = classifyNpsScore(score);
  if (!bucket) return counts;
  const next = { ...counts, total: counts.total + 1 };
  if (bucket === 'promoter') next.promoters += 1;
  else if (bucket === 'neutral') next.neutrals += 1;
  else next.detractors += 1;
  return next;
}

export function emptyNpsCounts(): NpsCounts {
  return { total: 0, promoters: 0, neutrals: 0, detractors: 0 };
}

export function withPercents(counts: NpsCounts): NpsCountsWithScore & {
  promotersPercent: number;
  neutralsPercent: number;
  detractorsPercent: number;
} {
  const total = counts.total;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);
  return {
    ...counts,
    npsScore: countsToNpsScore(counts),
    promotersPercent: pct(counts.promoters),
    neutralsPercent: pct(counts.neutrals),
    detractorsPercent: pct(counts.detractors),
  };
}

const asNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value.trim().replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
};

const pickNestedName = (obj: unknown): string => {
  if (!obj || typeof obj !== 'object') return '';
  const r = obj as Record<string, unknown>;
  return String(r.name ?? r.fullName ?? r.displayName ?? r.label ?? '').trim();
};

/** Extrai nota 0–10 de um registro da API Digisac. */
export function extractAnswerScore(row: Record<string, unknown>): number | null {
  const direct = asNumber(
    row.score,
    row.rating,
    row.grade,
    row.nota,
    row.value,
    row.answer,
    row.nps,
    row.rate,
  );
  if (direct != null && direct >= 0 && direct <= 10) return Math.round(direct);

  const answer = row.answer;
  if (answer && typeof answer === 'object') {
    const nested = extractAnswerScore(answer as Record<string, unknown>);
    if (nested != null) return nested;
  }

  const classification = String(row.classification ?? row.classificacao ?? row.type ?? '').toLowerCase();
  if (classification.includes('promot')) return 10;
  if (classification.includes('neutr') || classification.includes('passiv')) return 8;
  if (classification.includes('detrat')) return 5;

  return null;
}

/** Nome do analista que atendeu (vários campos possíveis no export/API). */
export function extractAnswerAnalystName(row: Record<string, unknown>): string {
  const keys = [
    'attendantName',
    'attendant_name',
    'userName',
    'user_name',
    'agentName',
    'agent_name',
    'atendeuNoChamado',
    'atendeu_no_chamado',
    'attendedBy',
    'attended_by',
    'lastUser',
    'last_user',
    'user',
    'attendant',
    'agent',
    'usuario',
    'atendente',
  ];
  for (const key of keys) {
    const val = row[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    const nested = pickNestedName(val);
    if (nested) return nested;
  }
  return '';
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

export function normalizeComparableName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** ID do usuário Digisac que atendeu (campos da API / export TXT). */
export function extractAnswerUserId(row: Record<string, unknown>): string {
  const direct = [
    row.userId,
    row.user_id,
    row.attendantId,
    row.attendant_id,
    row.agentId,
    row.agent_id,
    row.lastUserId,
    row.last_user_id,
  ];
  for (const v of direct) {
    const id = String(v ?? '').trim();
    if (id) return id;
  }
  for (const key of ['user', 'attendant', 'agent', 'lastUser', 'attendedBy']) {
    const nested = row[key];
    if (nested && typeof nested === 'object') {
      const id = String((nested as Record<string, unknown>).id ?? '').trim();
      if (id) return id;
    }
  }
  return '';
}

export type MappedAnalystRef = { id: string; name: string };

/** Agrupa avaliações como no TXT: uma linha por resposta → contagem por analista mapeado. */
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
    const score = extractAnswerScore(row);
    if (score == null) continue;

    let analystId = extractAnswerUserId(row);
    if (!analystId || !idSet.has(analystId)) {
      const name = extractAnswerAnalystName(row);
      const key = normalizeComparableName(name);
      analystId = nameToId.get(key) ?? '';
    }
    if (!analystId || !idSet.has(analystId)) continue;

    const prev = byAnalyst.get(analystId) ?? emptyNpsCounts();
    byAnalyst.set(analystId, addScoreToCounts(prev, score));
  }

  return byAnalyst;
}

export function flattenAnswersPayload(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
  if (typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  for (const key of ['data', 'items', 'rows', 'answers', 'results']) {
    const val = root[key];
    if (Array.isArray(val)) {
      return val.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
    }
    if (val && typeof val === 'object' && Array.isArray((val as Record<string, unknown>).data)) {
      return ((val as Record<string, unknown>).data as unknown[]).filter(
        (r) => r && typeof r === 'object',
      ) as Record<string, unknown>[];
    }
  }
  return [];
}
