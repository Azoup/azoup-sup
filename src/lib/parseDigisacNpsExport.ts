import {
  addScoreToCounts,
  aggregateAnswerRows,
  emptyNpsCounts,
  extractAnswerAnalystName,
  extractAnswerScore,
  withPercents,
  type NpsCounts,
} from '@/lib/digisacNpsAggregate';
import type { NpsAnalystRow, NpsOverview } from '@/integrations/digisac/npsNormalize';

export type ParsedDigisacNpsExport = {
  overview: NpsOverview;
  analysts: NpsAnalystRow[];
  rawRowCount: number;
  skippedRows: number;
};

const normalizeNameKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();

function countsToOverview(counts: NpsCounts): NpsOverview {
  const w = withPercents(counts);
  return {
    total: w.total,
    npsScore: w.npsScore,
    promoters: {
      count: w.promoters,
      percent: w.promotersPercent,
      label: 'Promotores',
      scoreRange: '9 - 10',
    },
    neutrals: {
      count: w.neutrals,
      percent: w.neutralsPercent,
      label: 'Neutros',
      scoreRange: '7 - 8',
    },
    detractors: {
      count: w.detractors,
      percent: w.detractorsPercent,
      label: 'Detratores',
      scoreRange: '0 - 6',
    },
  };
}

function detectDelimiter(headerLine: string): string {
  if (headerLine.includes('\t')) return '\t';
  if (headerLine.includes(';')) return ';';
  if (headerLine.includes('|')) return '|';
  return ',';
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ',') {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  return line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
}

function findColumnIndex(headers: string[], patterns: RegExp[]): number {
  const normalized = headers.map((h) => normalizeNameKey(h));
  for (let i = 0; i < normalized.length; i++) {
    if (patterns.some((p) => p.test(normalized[i]))) return i;
  }
  return -1;
}

function parseScoreFromCell(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.includes('promot')) return 10;
  if (lower.includes('neutr') || lower.includes('passiv')) return 8;
  if (lower.includes('detrat')) return 5;
  const n = Number(trimmed.replace(',', '.'));
  if (Number.isFinite(n) && n >= 0 && n <= 10) return Math.round(n);
  return null;
}

/** Converte export TXT/CSV do Digisac em overview + totais por analista. */
export function parseDigisacNpsExportText(
  text: string,
  analystIdByName?: Map<string, { id: string; name: string }>,
): ParsedDigisacNpsExport {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { overview: countsToOverview(emptyNpsCounts()), analysts: [], rawRowCount: 0, skippedRows: 0 };
  }

  const headerIdx = lines.findIndex((line) => {
    const n = normalizeNameKey(line);
    return n.includes('nota') || n.includes('protocolo') || n.includes('atendeu');
  });

  if (headerIdx >= 0) {
    const delimiter = detectDelimiter(lines[headerIdx]);
    const headers = splitLine(lines[headerIdx], delimiter);
    const scoreCol = findColumnIndex(headers, [/^nota/, /score/, /rating/, /valor/]);
    const analystCol = findColumnIndex(headers, [
      /atendeu/,
      /atendente/,
      /analista/,
      /usuario/,
      /user/,
      /agent/,
      /operador/,
    ]);
    const classCol = findColumnIndex(headers, [/classific/, /categoria/, /tipo/]);

    const rows: Record<string, unknown>[] = [];
    let skipped = 0;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = splitLine(lines[i], delimiter);
      if (cols.length < 2) {
        skipped++;
        continue;
      }
      const scoreCell = scoreCol >= 0 ? cols[scoreCol] : '';
      const classCell = classCol >= 0 ? cols[classCol] : '';
      let score = parseScoreFromCell(scoreCell);
      if (score == null) score = parseScoreFromCell(classCell);
      if (score == null) {
        skipped++;
        continue;
      }
      const analystName = analystCol >= 0 ? cols[analystCol]?.trim() : '';
      rows.push({
        score,
        classification: classCell,
        attendantName: analystName,
      });
    }

    return buildFromRows(rows, analystIdByName, lines.length - headerIdx - 1, skipped);
  }

  // Fallback: blocos por analista (texto livre do TXT)
  const byAnalyst = new Map<string, NpsCounts>();
  let global = emptyNpsCounts();
  let currentAnalyst = '';
  let rawRows = 0;
  let skipped = 0;

  for (const line of lines) {
    const analystMatch = line.match(/^(?:analista|atendente|usu[aá]rio)\s*[:\-]\s*(.+)$/i);
    if (analystMatch) {
      currentAnalyst = analystMatch[1].trim();
      continue;
    }
    if (!currentAnalyst && /^[A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{2,}$/.test(line) && line.length < 60) {
      const nextIsMetric = false;
      if (!nextIsMetric) {
        currentAnalyst = line;
        continue;
      }
    }

    const scoreMatch = line.match(/(?:nota|score|nps)\s*[:\-]?\s*(\d{1,2})/i);
    if (scoreMatch) {
      const score = parseScoreFromCell(scoreMatch[1]);
      if (score == null) {
        skipped++;
        continue;
      }
      rawRows++;
      global = addScoreToCounts(global, score);
      const key = currentAnalyst || 'Sem analista';
      const prev = byAnalyst.get(key) ?? emptyNpsCounts();
      byAnalyst.set(key, addScoreToCounts(prev, score));
      continue;
    }

    const promoMatch = line.match(/promotores?\s*[:\-]?\s*(\d+)/i);
    if (promoMatch && currentAnalyst) {
      const n = Number(promoMatch[1]);
      const prev = byAnalyst.get(currentAnalyst) ?? emptyNpsCounts();
      byAnalyst.set(currentAnalyst, {
        ...prev,
        total: prev.total + n,
        promoters: prev.promoters + n,
      });
      global = { ...global, total: global.total + n, promoters: global.promoters + n };
    }
  }

  if (byAnalyst.size > 0) {
    const analysts = [...byAnalyst.entries()]
      .map(([name, counts]) => {
        const mapped = analystIdByName?.get(normalizeNameKey(name));
        return {
          userId: mapped?.id ?? normalizeNameKey(name),
          name: mapped?.name ?? name,
          total: counts.total,
          overview: countsToOverview(counts),
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      overview: countsToOverview(global),
      analysts,
      rawRowCount: rawRows,
      skippedRows: skipped,
    };
  }

  // Último fallback: cada linha com número 0-10
  const looseRows: Record<string, unknown>[] = [];
  for (const line of lines) {
    const m = line.match(/\b(\d{1,2})\b/);
    if (!m) continue;
    const score = parseScoreFromCell(m[1]);
    if (score == null) continue;
    looseRows.push({ score });
  }

  return buildFromRows(looseRows, analystIdByName, looseRows.length, lines.length - looseRows.length);
}

function buildFromRows(
  rows: Record<string, unknown>[],
  analystIdByName: Map<string, { id: string; name: string }> | undefined,
  rawRowCount: number,
  skippedRows: number,
): ParsedDigisacNpsExport {
  const global = aggregateAnswerRows(rows);
  const byName = new Map<string, NpsCounts>();

  for (const row of rows) {
    const score = extractAnswerScore(row);
    if (score == null) continue;
    const name = extractAnswerAnalystName(row) || 'Sem analista';
    const key = normalizeNameKey(name);
    const prev = byName.get(key) ?? emptyNpsCounts();
    byName.set(key, addScoreToCounts(prev, score));
  }

  const analysts: NpsAnalystRow[] = [...byName.entries()]
    .map(([key, counts]) => {
      const mapped = analystIdByName?.get(key);
      const sampleRow = rows.find((r) => normalizeNameKey(extractAnswerAnalystName(r)) === key);
      const displayName = mapped?.name ?? (sampleRow ? extractAnswerAnalystName(sampleRow) : key);
      return {
        userId: mapped?.id ?? key,
        name: displayName || key,
        total: counts.total,
        overview: countsToOverview(counts),
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    overview: countsToOverview(global),
    analysts,
    rawRowCount,
    skippedRows,
  };
}

export function mergeAnalystRowsWithMapped(
  parsed: ParsedDigisacNpsExport,
  mapped: Array<{ id: string; name: string }>,
): ParsedDigisacNpsExport {
  const nameMap = new Map<string, { id: string; name: string }>();
  for (const a of mapped) {
    nameMap.set(normalizeNameKey(a.name), a);
  }

  const parsedAnalysts = parsed.analysts ?? [];
  const parsedByKey = new Map(parsedAnalysts.map((a) => [normalizeNameKey(a.name), a]));

  const merged: NpsAnalystRow[] = mapped.map((m) => {
    const key = normalizeNameKey(m.name);
    const hit = parsedByKey.get(key);
    if (hit) return { ...hit, userId: m.id, name: m.name };
    return {
      userId: m.id,
      name: m.name,
      total: 0,
      overview: countsToOverview(emptyNpsCounts()),
    };
  });

  for (const a of parsedAnalysts) {
    const key = normalizeNameKey(a.name);
    if (!nameMap.has(key)) merged.push(a);
  }

  merged.sort((a, b) => b.total - a.total);
  return {
    ...parsed,
    overview: parsed.overview ?? countsToOverview(emptyNpsCounts()),
    analysts: merged,
  };
}
