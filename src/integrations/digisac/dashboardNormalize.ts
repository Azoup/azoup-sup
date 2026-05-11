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

/**
 * Média do 1º tempo de espera (cartão Digisac).
 * `totals.waitingTime` (segundos) bate com o painel "Média do 1º tempo de espera".
 * `firstResponseTimeMinutes` / `firstResponseTime` costumam ser outra métrica (ex.: 234s vs 229s).
 */
export function totalsPrimeiraRespostaMinutes(totals: Record<string, unknown>) {
  if ("waitingTime" in totals) {
    const wt = asNumber(totals.waitingTime);
    if (wt > 0) return timeRawToAverageMinutes(wt);
  }
  const explicitMin = pickFirstPositiveByKeys(totals, [
    "firstWaitingTimeMinutes",
    "averageFirstWaitingTimeMinutes",
    "avgFirstWaitingTimeMinutes",
    "avgFirstHumanWaitingTimeMinutes",
  ]);
  if (explicitMin > 0) return explicitMin;
  const raw = pickFirstPositiveByKeys(totals, [
    "firstWaitingTime",
    "avgFirstWaitingTime",
    "averageFirstWaitingTime",
    "avgFirstHumanWaitingTime",
    "firstHumanWaitingTime",
    "waitingTimeBeforeFirstHumanResponse",
    "averageWaitingTimeUntilFirstHumanResponse",
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
    pickFirstPositiveByKeys(totals, [
      "waitingTimeAvg",
      "avgWaitingTime",
      "averageWaitingTime",
      "totalWaitingTime",
    ]),
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
  /** Total de mensagens (campo total da Digisac ou enviadas+recebidas). */
  total_mensagens: number;
  mensagens_enviadas: number;
  mensagens_recebidas: number;
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
  mensagens_enviadas?: number;
  mensagens_recebidas?: number;
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

const MESSAGE_SENT_KEYS = [
  "sentMessagesCount",
  "sentMessages",
  "sent_messages_count",
  "messagesSent",
  "messages_sent",
  "outboundMessagesCount",
] as const;

const MESSAGE_RECEIVED_KEYS = [
  "receivedMessagesCount",
  "receivedMessages",
  "received_messages_count",
  "messagesReceived",
  "messages_received",
  "inboundMessagesCount",
] as const;

const MESSAGE_TOTAL_KEYS = [
  "totalMessagesCount",
  "totalMessages",
  "total_mensagens",
  "messagesTotal",
  "messagesCount",
  "messages",
] as const;

function recordHasAnyMessageMetricKeys(row: Record<string, unknown>): boolean {
  const keys = [...MESSAGE_SENT_KEYS, ...MESSAGE_RECEIVED_KEYS, ...MESSAGE_TOTAL_KEYS];
  return keys.some((k) => k in row);
}

export function totalsMessageCounts(totals: Record<string, unknown>) {
  const mensagens_enviadas = pickByKeys(totals, [...MESSAGE_SENT_KEYS]);
  const mensagens_recebidas = pickByKeys(totals, [...MESSAGE_RECEIVED_KEYS]);
  const apiTotal = pickByKeys(totals, [...MESSAGE_TOTAL_KEYS]);
  const sum = mensagens_enviadas + mensagens_recebidas;
  const total_mensagens = apiTotal > 0 ? apiTotal : sum;
  return { mensagens_enviadas, mensagens_recebidas, total_mensagens };
}

export function rowSentMessagesCount(item: Record<string, unknown>): number {
  return pickByKeys(item, [...MESSAGE_SENT_KEYS]);
}

export function rowReceivedMessagesCount(item: Record<string, unknown>): number {
  return pickByKeys(item, [...MESSAGE_RECEIVED_KEYS]);
}

export function rowTotalMessagesCount(item: Record<string, unknown>): number {
  const sent = rowSentMessagesCount(item);
  const received = rowReceivedMessagesCount(item);
  const apiTotal = pickByKeys(item, [...MESSAGE_TOTAL_KEYS]);
  const sum = sent + received;
  return apiTotal > 0 ? apiTotal : sum;
}

export function rowMessagesTotal(item: Record<string, unknown>): number {
  return rowTotalMessagesCount(item);
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
  const raw = pickFirstPositiveByKeys(item, [
    "ticketTime",
    "averageTicketTime",
    "avgTicketTime",
    "averageTicketDuration",
    "avgTicketDuration",
    "totalTicketTime",
    "ticketsTime",
    "tma",
    "ticket_time",
    "average_ticket_time",
  ]);
  return timeRawToAverageMinutes(raw);
}

/** Média do 1º tempo de espera por analista (alinhado ao painel Digisac). */
export function rowPrimeiraEsperaMinutes(item: Record<string, unknown>): number {
  if ("waitingTime" in item) {
    const wt = asNumber(item.waitingTime);
    if (wt > 0) return timeRawToAverageMinutes(wt);
  }
  const explicitMin = pickFirstPositiveByKeys(item, [
    "firstWaitingTimeMinutes",
    "averageFirstWaitingTimeMinutes",
    "avgFirstWaitingTimeMinutes",
    "avgFirstHumanWaitingTimeMinutes",
  ]);
  if (explicitMin > 0) return explicitMin;
  const raw = pickFirstPositiveByKeys(item, [
    "firstWaitingTime",
    "avgFirstWaitingTime",
    "averageFirstWaitingTime",
    "avgFirstHumanWaitingTime",
    "firstHumanWaitingTime",
    "waitingTimeBeforeFirstHumanResponse",
    "averageWaitingTimeUntilFirstHumanResponse",
    "waiting_time",
    "waitingTimeAfterBot",
  ]);
  return timeRawToAverageMinutes(raw);
}

/** Alguns payloads `by-user` trazem métricas em `stats` / `totals` aninhados. */
export function mergeNestedDigisacRow(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...item };
  for (const key of ["stats", "totals", "metrics", "summary", "aggregates"] as const) {
    const inner = item[key];
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;
    // Sobrescreve chaves do topo: a API costuma mandar zeros no nível raiz e totais corretos dentro de `stats`.
    Object.assign(out, inner as Record<string, unknown>);
  }
  return out;
}

function rowClosedCount(row: Record<string, unknown>): number {
  return pickByKeys(row, [
    "closedTicketsCount",
    "closedTickets",
    "closed_tickets_count",
    "closedTicketsTotal",
    "totalClosedTickets",
    "total_fechados",
    "finishedTickets",
  ]);
}

function rowOpenedCount(row: Record<string, unknown>): number {
  return pickByKeys(row, [
    "openedTicketsCount",
    "openTickets",
    "opened_tickets_count",
    "openTicketsCount",
    "openedTickets",
    "total_abertos",
    "totalOpenTickets",
  ]);
}

/**
 * Só chaves inequívocas do Digisac. Evita ativar "breakdown" por `open`/`closed` genéricos no JSON
 * (isso fazia total_chamados cair em totalTicketsCount 237 em vez de 244+0).
 */
const EXPLICIT_TICKET_BREAKDOWN_KEYS = [
  "closedTicketsCount",
  "closedTickets",
  "closed_tickets_count",
  "openedTicketsCount",
  "openTickets",
  "opened_tickets_count",
  "openTicketsCount",
  "openedTickets",
  "total_abertos",
  "total_fechados",
] as const;

export function recordHasTicketBreakdown(row: Record<string, unknown>): boolean {
  return EXPLICIT_TICKET_BREAKDOWN_KEYS.some((k) => k in row);
}

export function recordHasMessageBreakdown(row: Record<string, unknown>): boolean {
  return recordHasAnyMessageMetricKeys(row);
}

export function totalsHasTicketBreakdown(totals: Record<string, unknown>): boolean {
  return EXPLICIT_TICKET_BREAKDOWN_KEYS.some((k) => k in totals);
}

export function totalsHasMessageBreakdown(totals: Record<string, unknown>): boolean {
  return recordHasAnyMessageMetricKeys(totals);
}

export function normalizeGeralResponse(payload: unknown): DigisacGeralResponse {
  const p = payload as Record<string, unknown>;
  const totals = (p?.totals ?? (p?.data as Record<string, unknown>)?.totals ?? p?.data ?? p ?? {}) as Record<string, unknown>;

  const total_fechados = pickByKeys(totals, [
    "closedTicketsCount",
    "closedTickets",
    "closed_tickets_count",
    "total_fechados",
    "finishedTickets",
  ]);
  const total_abertos = pickByKeys(totals, [
    "openedTicketsCount",
    "openTickets",
    "opened_tickets_count",
    "openTicketsCount",
    "total_abertos",
    "openedTickets",
  ]);

  const sumTickets = total_fechados + total_abertos;
  const fromTicketTotal = pickByKeys(totals, [
    "totalTicketsCount",
    "totalTickets",
    "total_chamados",
    "ticketsTotal",
    "attendanceCount",
  ]);
  /** Digisac: total exibido = max(totalTicketsCount, fechados+abertos) quando há breakdown explícito. */
  const total_chamados = totalsHasTicketBreakdown(totals)
    ? fromTicketTotal > 0 && sumTickets > 0
      ? Math.max(fromTicketTotal, sumTickets)
      : (sumTickets || fromTicketTotal)
    : fromTicketTotal;

  const { mensagens_enviadas, mensagens_recebidas, total_mensagens } = totalsMessageCounts(totals);

  return {
    total_chamados,
    total_fechados,
    total_abertos,
    total_mensagens,
    mensagens_enviadas,
    mensagens_recebidas,
    total_contatos: pickByKeys(totals, ["contactsCount", "totalContacts", "total_contatos", "contactsTotal", "contacts"]),
    tma_geral_minutos: totalsTmaMinutes(totals),
    tempo_espera_minutos: totalsTempoEsperaMinutes(totals),
    primeira_resposta_minutos: totalsPrimeiraRespostaMinutes(totals),
  };
}

export function normalizeAnalistasResponse(payload: unknown): DigisacAnalystStats[] {
  const items = Array.isArray(payload) ? payload : firstArray(payload, ["items", "data", "rows", "users"]);

  return (items as Record<string, unknown>[])
    .filter((raw) => {
      const item = mergeNestedDigisacRow(raw);
      return !isInvalidDigisacUserName((item.userName ?? item.name ?? (item.user as Record<string, unknown>)?.name) as string);
    })
    .map((raw) => {
      const item = mergeNestedDigisacRow(raw);
      const closed = rowClosedCount(item);
      const opened = rowOpenedCount(item);
      const user = item.user as Record<string, unknown> | undefined;

      const fromBreakdown = closed + opened;
      const fromTicketTotal = asNumber(
        item.totalTicketsCount,
        item.totalTickets,
        item.attendanceCount,
        item.ticketsTotal,
        item.total_tickets_count,
      );
      const total_chamados = recordHasTicketBreakdown(item)
        ? fromTicketTotal > 0 && fromBreakdown > 0
          ? Math.max(fromTicketTotal, fromBreakdown)
          : (fromBreakdown || fromTicketTotal)
        : (fromTicketTotal || fromBreakdown);

      return {
        analyst_id: String(item.userId ?? item.id ?? user?.id ?? item.name ?? ""),
        name: (item.userName ?? item.name ?? user?.name ?? "Sem nome") as string,
        mapped: typeof item.mapped === "boolean" ? item.mapped : undefined,
        total_chamados,
        chamados_fechados: closed,
        chamados_abertos: opened,
        total_contatos: asNumber(
          item.contactsCount,
          item.totalContacts,
          item.uniqueContactsCount,
          item.contacts_count,
        ),
        mensagens_enviadas: rowSentMessagesCount(item),
        mensagens_recebidas: rowReceivedMessagesCount(item),
        total_mensagens: rowTotalMessagesCount(item),
        tma_minutos: rowTicketTimeMinutes(item),
        primeira_espera_minutos: rowPrimeiraEsperaMinutes(item),
      };
    });
}
