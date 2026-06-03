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

export function mergeNpsCounts(a: NpsCounts, b: NpsCounts): NpsCounts {
  return {
    total: a.total + b.total,
    promoters: a.promoters + b.promoters,
    neutrals: a.neutrals + b.neutrals,
    detractors: a.detractors + b.detractors,
  };
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

const isEvaluationTypeLabel = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  return v === 'nps' || v === 'csat' || v === 'survey';
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
    const s = String(p ?? '').toLowerCase();
    if (s) return s;
  }
  const tipo = String(row.type ?? row.tipo ?? '').toLowerCase();
  if (tipo && !isEvaluationTypeLabel(tipo)) return tipo;
  return '';
};

const scoreFromClassification = (label: string): number | null => {
  if (!label) return null;
  if (label.includes('promot')) return 10;
  if (label.includes('neutr') || label.includes('passiv')) return 8;
  if (label.includes('detrat')) return 5;
  return null;
};

export function parseScoreFromText(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fromClass = scoreFromClassification(trimmed.toLowerCase());
  if (fromClass != null) return fromClass;
  const direct = asNumber(trimmed);
  if (direct != null && direct >= 0 && direct <= 10) return Math.round(direct);
  const digit = trimmed.match(/(?:^|\s)(10|[0-9])(?:\s|$|[^\d])/);
  if (digit) {
    const n = Number(digit[1]);
    if (n >= 0 && n <= 10) return n;
  }
  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number(trimmed);
    if (n >= 0 && n <= 10) return n;
  }
  return null;
}

export function isDigisacCsatAiRow(row: Record<string, unknown>): boolean {
  if (row.aiGenerated !== true) return false;
  const score = parseScoreFromText(String(row.aiText ?? row.text ?? ''));
  return score != null && score >= 1 && score <= 5;
}

const TEXT_SCORE_KEYS = ['text', 'aiText', 'ai_text', 'reason', 'motivo', 'response', 'resposta'];

const SCORE_FIELD_KEYS = [
  'score', 'rating', 'grade', 'nota', 'notaAtribuida', 'nota_atribuida',
  'assignedScore', 'assigned_score', 'ratingValue', 'rating_value',
  'value', 'answer', 'nps', 'rate', 'surveyScore', 'survey_score',
  'points', 'pontuacao',
];

const readScoreFromObject = (obj: Record<string, unknown>, depth = 0): number | null => {
  if (depth > 4) return null;

  for (const key of TEXT_SCORE_KEYS) {
    const val = obj[key];
    if (typeof val === 'string') {
      const s = parseScoreFromText(val);
      if (s != null) return s;
    }
  }

  for (const key of SCORE_FIELD_KEYS) {
    const val = obj[key];
    if (typeof val === 'string' || typeof val === 'number') {
      const n = asNumber(val);
      if (n != null && n >= 0 && n <= 10) return Math.round(n);
    }
    if (val && typeof val === 'object') {
      const nested = readScoreFromObject(val as Record<string, unknown>, depth + 1);
      if (nested != null) return nested;
    }
  }

  const fromClass = scoreFromClassification(classificationFromRow(obj));
  if (fromClass != null) return fromClass;

  for (const key of ['evaluation', 'survey', 'response', 'result', 'data', 'payload', 'ticket', 'message']) {
    const nested = obj[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const s = readScoreFromObject(nested as Record<string, unknown>, depth + 1);
      if (s != null) return s;
    }
  }

  return null;
};

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

export function extractAnswerAnalystName(row: Record<string, unknown>): string {
  const keys = [
    'attendantName', 'attendant_name', 'userName', 'user_name', 'agentName', 'agent_name',
    'atendeuNoChamado', 'atendeu_no_chamado', 'ultimoAtendente', 'ultimo_atendente',
    'attendedBy', 'attended_by', 'lastUser', 'last_user', 'lastAttendant', 'last_attendant',
    'user', 'attendant', 'agent', 'usuario', 'atendente', 'operator', 'operador',
  ];
  for (const key of keys) {
    const val = row[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    const nested = pickNestedName(val);
    if (nested) return nested;
  }
  for (const key of ['ticket', 'protocol', 'call', 'chamado']) {
    const nested = row[key];
    if (nested && typeof nested === 'object') {
      const name = extractAnswerAnalystName(nested as Record<string, unknown>);
      if (name) return name;
    }
  }
  return '';
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

export function normalizeComparableName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function extractAnswerUserId(row: Record<string, unknown>): string {
  const injected = String(row._digisacUserId ?? '').trim();
  if (injected) return injected;

  for (const key of [
    'userId', 'user_id', 'attendantId', 'attendant_id', 'agentId', 'agent_id',
    'lastUserId', 'last_user_id', 'lastAttendantId', 'operatorId',
  ]) {
    const id = String(row[key] ?? '').trim();
    if (id) return id;
  }
  for (const key of ['user', 'attendant', 'agent', 'lastUser', 'attendedBy', 'lastAttendant', 'operator']) {
    const nested = row[key];
    if (nested && typeof nested === 'object') {
      const id = String((nested as Record<string, unknown>).id ?? '').trim();
      if (id) return id;
    }
  }
  return '';
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
      const name = extractAnswerAnalystName(row);
      const key = normalizeComparableName(name);
      analystId = nameToId.get(key) ?? '';
    }
    if (!analystId || !idSet.has(analystId)) continue;

    const prev = byAnalyst.get(analystId) ?? emptyNpsCounts();
    byAnalyst.set(analystId, mergeNpsCounts(prev, countsToAdd));
  }

  return byAnalyst;
}

export function flattenAnswersPayload(payload: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const pushRow = (row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? r._id ?? r.protocol ?? r.protocolo ?? '').trim();
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
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    for (const key of ['data', 'items', 'rows', 'answers', 'results', 'records', 'list']) {
      const val = obj[key];
      if (Array.isArray(val)) {
        for (const item of val) pushRow(item);
      } else if (val && typeof val === 'object') {
        walk(val, depth + 1);
      }
    }
  };

  walk(payload);
  return out;
}
