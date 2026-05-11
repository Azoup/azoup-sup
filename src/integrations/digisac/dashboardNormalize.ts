/**
 * Normalização compartilhada dos payloads Digisac (dashboard geral / por usuário).
 * Extraído para testes e para manter uma única fonte de verdade nos nomes de campo.
 */

export function asNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

export function minutesFromSeconds(value: number) {
  return value > 0 ? value / 60 : 0;
}

/**
 * Converte valores de tempo vindos da Digisac para minutos exibidos no app.
 * - Grandes inteiros: milissegundos (>= 10M).
 * - Decimais pequenos (ex.: 3.82): já vêm em minutos (média), não dividir por 60 de novo.
 * - Inteiros típicos: segundos (ex.: 229 → ~3,82 min de 1ª espera).
 */
export function timeRawToAverageMinutes(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 0;
  if (raw >= 10_000_000) return minutesFromSeconds(raw / 1000);
  if (raw < 72 && !Number.isInteger(raw)) return raw;
  return minutesFromSeconds(raw);
}

export function pickByKeys(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return 0;
  for (const key of keys) {
    if (key in source) return asNumber(source[key]);
  }
  return 0;
}

/** Primeira chave presente com valor numérico > 0; senão última presente (permite 0). */
export function pickFirstPositiveByKeys(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return 0;
  let lastPresent = 0;
  let foundLast = false;
  for (const key of keys) {
    if (!(key in source)) continue;
    const n = asNumber(source[key]);
    lastPresent = n;
    foundLast = true;
    if (n > 0) return n;
  }
  return foundLast ? lastPresent : 0;
}

/** TMA / tempos agregados (totals). */
export function totalsTmaMinutes(totals: Record<string, unknown>) {
  const explicitMin = pickFirstPositiveByKeys(totals, ["ticketTimeMinutes", "averageTicketTimeMinutes", "tmaMinutes"]);
  if (explicitMin > 0) return explicitMin;
  return timeRawToAverageMinutes(
    pickFirstPositiveByKeys(totals, ["ticketTime", "avgTicketTime", "averageTicketTime", "tma"]),
  );
}

/** Média do 1º tempo de espera (cartão "Média do 1º tempo de espera" — humano, não o "após bot"). */
export function totalsPrimeiraRespostaMinutes(totals: Record<string, unknown>) {
  const explicitMin = pickFirstPositiveByKeys(totals, [
    "firstWaitingTimeMinutes",
    "averageFirstWaitingTimeMinutes",
    "avgFirstWaitingTimeMinutes",
    "firstResponseTimeMinutes",
    "avgFirstHumanWaitingTimeMinutes",
  ]);
  if (explicitMin > 0) return explicitMin;
  const raw = pickFirstPositiveByKeys(totals, [
    "firstWaitingTime",
    "avgFirstWaitingTime",
    "averageFirstWaitingTime",
    "avgFirstHumanWaitingTime",
    "firstHumanWaitingTime",
    "firstResponseTime",
    "averageFirstResponseTime",
    "avgFirstResponseTime",
    "waitingTimeBeforeFirstHumanResponse",
    "averageWaitingTimeUntilFirstHumanResponse",
    "firstResponseWaitingTime",
    "waitingTimeAfterBot",
  ]);
  return timeRawToAverageMinutes(raw);
}

export function totalsTempoEsperaMinutes(totals: Record<string, unknown>) {
  const explicitMin = pickFirstPositiveByKeys(totals, [
    "waitingTimeMinutes",
    "averageWaitingTimeMinutes",
    "waitingTimeAvgMinutes",
  ]);
  if (explicitMin > 0) return explicitMin;
  return timeRawToAverageMinutes(
    pickFirstPositiveByKeys(totals, ["waitingTimeAvg", "waitingTime", "avgWaitingTime", "averageWaitingTime", "totalWaitingTime"]),
  );
}

export function firstArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const inner = value as Record<string, unknown>;
      if (Array.isArray(inner.data)) return inner.data as unknown[];
      if (Array.isArray(inner.items)) return inner.items as unknown[];
      if (Array.isArray(inner.rows)) return inner.rows as unknown[];
    }
  }
  return [];
}

export interface DigisacGeralResponse {
  total_chamados: number;
  total_fechados: number;
  total_abertos: number;
  total_mensagens: number;
  total_contatos: number;
  tma_geral_minutos: number;
  tempo_espera_minutos: number;
  primeira_resposta_minutos: number;
}

export interface DigisacAnalystStats {
  analyst_id: string;
  name: string;
  mapped?: boolean;
  total_chamados: number;
  chamados_fechados: number;
  chamados_abertos: number;
  total_contatos?: number;
  total_mensagens?: number;
  tma_minutos: number;
  primeira_espera_minutos?: number;
}

const INVALID_DIGISAC_USER_NAMES = new Set([
  "sem atendente",
  "mandeumzap dev",
  "mande um zap dev",
  "azoup tecnologia ltda",
  "azoup digisac",
]);

function normalizeComparableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function isInvalidDigisacUserName(value?: string) {
  const normalized = normalizeComparableName(value || "");
  if (!normalized) return true;
  return INVALID_DIGISAC_USER_NAMES.has(normalized);
}

export function rowMessagesTotal(item: Record<string, unknown>): number {
  if (recordHasMessageBreakdown(item)) {
    return pickByKeys(item, ["sentMessagesCount", "sentMessages"]) +
      pickByKeys(item, ["receivedMessagesCount", "receivedMessages"]);
  }
  const aggregate = pickByKeys(item, [
    "totalMessagesCount",
    "totalMessages",
    "messagesTotal",
    "messagesCount",
    "messages",
  ]);
  if (aggregate > 0) return aggregate;
  const sent = asNumber(item.sentMessagesCount, item.sentMessages);
  const received = asNumber(item.receivedMessagesCount, item.receivedMessages);
  return sent + received;
}

export function rowTicketTimeMinutes(item: Record<string, unknown>): number {
  const explicitMinutes = asNumber(
    item.ticketTimeMinutes,
    item.averageTicketTimeMinutes,
    item.avgTicketTimeMinutes,
    item.tmaMinutes,
    item.averageTmaMinutes,
  );
  if (explicitMinutes > 0) return explicitMinutes;
  const raw = asNumber(
    item.ticketTime,
    item.averageTicketTime,
    item.avgTicketTime,
    item.totalTicketTime,
    item.ticketsTime,
    item.tma,
  );
  return timeRawToAverageMinutes(raw);
}

/** Média do 1º tempo de espera por analista (alinhado ao painel Digisac). */
export function rowPrimeiraEsperaMinutes(item: Record<string, unknown>): number {
  const explicitMin = pickFirstPositiveByKeys(item, [
    "firstWaitingTimeMinutes",
    "averageFirstWaitingTimeMinutes",
    "avgFirstWaitingTimeMinutes",
    "firstResponseTimeMinutes",
    "avgFirstHumanWaitingTimeMinutes",
  ]);
  if (explicitMin > 0) return explicitMin;
  const raw = pickFirstPositiveByKeys(item, [
    "firstWaitingTime",
    "avgFirstWaitingTime",
    "averageFirstWaitingTime",
    "avgFirstHumanWaitingTime",
    "firstHumanWaitingTime",
    "firstResponseTime",
    "averageFirstResponseTime",
    "avgFirstResponseTime",
    "waitingTimeBeforeFirstHumanResponse",
    "averageWaitingTimeUntilFirstHumanResponse",
    "firstResponseWaitingTime",
    "waitingTimeAfterBot",
  ]);
  return timeRawToAverageMinutes(raw);
}

const TICKET_BREAKDOWN_KEYS = [
  "closedTicketsCount",
  "closedTickets",
  "closed",
  "openedTicketsCount",
  "openTickets",
  "opened",
  "open",
] as const;

export function recordHasTicketBreakdown(row: Record<string, unknown>): boolean {
  return TICKET_BREAKDOWN_KEYS.some((k) => k in row);
}

export function recordHasMessageBreakdown(row: Record<string, unknown>): boolean {
  return "sentMessagesCount" in row || "receivedMessagesCount" in row || "sentMessages" in row || "receivedMessages" in row;
}

export function totalsHasTicketBreakdown(totals: Record<string, unknown>): boolean {
  return TICKET_BREAKDOWN_KEYS.some((k) => k in totals);
}

export function totalsHasMessageBreakdown(totals: Record<string, unknown>): boolean {
  return "sentMessagesCount" in totals || "receivedMessagesCount" in totals;
}

export function normalizeGeralResponse(payload: unknown): DigisacGeralResponse {
  const p = payload as Record<string, unknown>;
  const totals = (p?.totals ?? (p?.data as Record<string, unknown>)?.totals ?? p?.data ?? p ?? {}) as Record<string, unknown>;

  const total_fechados = pickByKeys(totals, ["closedTicketsCount", "closedTickets", "total_fechados", "finishedTickets", "closed"]);
  const total_abertos = pickByKeys(totals, ["openedTicketsCount", "openTickets", "total_abertos", "openedTickets", "open"]);

  const total_chamados = totalsHasTicketBreakdown(totals)
    ? total_fechados + total_abertos
    : pickByKeys(totals, ["totalTicketsCount", "totalTickets", "total_chamados", "ticketsTotal", "total", "attendanceCount"]);

  const total_mensagens = totalsHasMessageBreakdown(totals)
    ? pickByKeys(totals, ["sentMessagesCount", "sentMessages"]) + pickByKeys(totals, ["receivedMessagesCount", "receivedMessages"])
    : pickByKeys(totals, ["totalMessagesCount", "totalMessages", "total_mensagens", "messagesTotal", "messages"]);

  return {
    total_chamados,
    total_fechados,
    total_abertos,
    total_mensagens,
    total_contatos: pickByKeys(totals, ["contactsCount", "totalContacts", "total_contatos", "contactsTotal", "contacts"]),
    tma_geral_minutos: totalsTmaMinutes(totals),
    tempo_espera_minutos: totalsTempoEsperaMinutes(totals),
    primeira_resposta_minutos: totalsPrimeiraRespostaMinutes(totals),
  };
}

export function normalizeAnalistasResponse(payload: unknown): DigisacAnalystStats[] {
  const items = Array.isArray(payload) ? payload : firstArray(payload, ["items", "data", "rows", "users"]);

  return (items as Record<string, unknown>[])
    .filter((item) => !isInvalidDigisacUserName((item.userName ?? item.name ?? (item.user as Record<string, unknown>)?.name) as string))
    .map((item) => {
      const closed = asNumber(item.closedTicketsCount, item.closedTickets, item.closed);
      const opened = asNumber(item.openedTicketsCount, item.openTickets, item.opened);
      const user = item.user as Record<string, unknown> | undefined;

      const total_chamados = recordHasTicketBreakdown(item)
        ? closed + opened
        : asNumber(
            item.totalTicketsCount,
            item.totalTickets,
            item.attendanceCount,
            item.ticketsTotal,
            closed + opened,
          );

      return {
        analyst_id: String(item.userId ?? item.id ?? user?.id ?? item.name ?? ""),
        name: (item.userName ?? item.name ?? user?.name ?? "Sem nome") as string,
        mapped: typeof item.mapped === "boolean" ? item.mapped : undefined,
        total_chamados,
        chamados_fechados: closed,
        chamados_abertos: opened,
        total_contatos: asNumber(item.contactsCount, item.totalContacts, item.uniqueContactsCount),
        total_mensagens: rowMessagesTotal(item),
        tma_minutos: rowTicketTimeMinutes(item),
        primeira_espera_minutos: rowPrimeiraEsperaMinutes(item),
      };
    });
}
