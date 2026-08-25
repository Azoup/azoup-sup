import { extractTicketAttendant, type FetchDigisacFn, type TicketAttendantRef } from "./digisacNpsTickets.ts";
import {
  extractTicketContact,
  extractTicketContactId,
  unwrapDigisacRecord,
  type TicketContactRef,
} from "./digisacTicketContact.ts";
import { ticketContactId, ticketDate } from "./digisacBuStats.ts";
import type { DigisacBuContactTagKey } from "./digisacBuContactTags.ts";

export type RecurrenceClass = "unico" | "retorno" | "recorrente" | "alta_recorrencia";
export type RecurrenceUnitKey = DigisacBuContactTagKey;

export const RECURRENCE_CLASS_LABEL: Record<RecurrenceClass, string> = {
  unico: "Único",
  retorno: "Retorno",
  recorrente: "Recorrente",
  alta_recorrencia: "Alta recorrência",
};

export function classifyRecurrence(atendimentos: number): RecurrenceClass {
  if (atendimentos >= 5) return "alta_recorrencia";
  if (atendimentos >= 3) return "recorrente";
  if (atendimentos === 2) return "retorno";
  return "unico";
}

export function normalizePhoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits.slice(2);
  return digits;
}

export function contactGroupKey(phone: string, contactId: string): string {
  const key = normalizePhoneKey(phone);
  if (key) return `phone:${key}`;
  const id = contactId.trim();
  return id ? `contact:${id}` : "contact:unknown";
}

export type RecurrenceTicketInput = {
  id: string;
  contactId: string;
  date: string;
  sortAt: string;
  phone: string;
  name: string;
  attendantName: string;
  attendantUserId: string;
  subject: string;
  protocol: string;
  unit: RecurrenceUnitKey;
};

export type RecurrenceHistoryItem = {
  ticketId: string;
  date: string;
  analystName: string;
  unit: RecurrenceUnitKey;
  protocol: string;
  subject: string;
};

export type RecurrenceContactRow = {
  key: string;
  name: string;
  phone: string;
  units: RecurrenceUnitKey[];
  atendimentos: number;
  retornos: number;
  classification: RecurrenceClass;
  classificationLabel: string;
  firstAtendimento: string;
  lastAtendimento: string;
  analystName: string;
  subject: string;
  history: RecurrenceHistoryItem[];
};

export type RecurrenceSummary = {
  totalAtendimentos: number;
  contatosUnicos: number;
  contatosRecorrentes: number;
  totalRetornos: number;
  taxaRecorrencia: number;
  mediaAtendimentos: number;
};

const pickString = (...values: unknown[]): string => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const looksLikeUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const looksLikeTruncatedId = (value: string): boolean =>
  /^#[0-9a-f]{6,12}$/i.test(value);

const looksLikePhoneNumber = (value: string): boolean => {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13 && !/^20\d{2}/.test(digits);
};

export function extractTicketTopicNames(
  ticket: Record<string, unknown>,
  topicNames?: Map<string, string>,
): string {
  const names: string[] = [];
  const pushName = (value: string) => {
    const text = value.trim();
    if (text && !names.includes(text) && !looksLikeUuid(text)) names.push(text);
  };

  const collections = [ticket.ticketTopics, ticket.ticket_topics, ticket.topics, ticket.ticketTopic];
  for (const col of collections) {
    if (!Array.isArray(col)) continue;
    for (const item of col) {
      if (typeof item === "string") {
        pushName(topicNames?.get(item) || item);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const nested = row.ticketTopic && typeof row.ticketTopic === "object"
        ? row.ticketTopic as Record<string, unknown>
        : null;
      const id = pickString(row.id, row.ticketTopicId, row.ticket_topic_id, row.topicId, nested?.id);
      pushName(pickString(
        row.name,
        row.label,
        row.title,
        nested?.name,
        nested?.label,
        nested?.title,
        id ? topicNames?.get(id) : "",
      ));
    }
  }

  const ids = ticket.ticketTopicIds ?? ticket.ticket_topic_ids;
  if (Array.isArray(ids)) {
    for (const id of ids) {
      const key = String(id ?? "").trim();
      if (key) pushName(topicNames?.get(key) || "");
    }
  }

  return names.join(", ");
}

export function extractTicketSubject(
  ticket: Record<string, unknown>,
  topicNames?: Map<string, string>,
): string {
  const topic = extractTicketTopicNames(ticket, topicNames);
  const resumoRaw = ticket.comments;
  const resumo = typeof resumoRaw === "string"
    ? resumoRaw.trim()
    : pickString(ticket.comment, ticket.summary, ticket.resume);
  if (topic && resumo && resumo !== topic) return `${topic} — ${resumo}`.slice(0, 240);
  if (topic) return topic.slice(0, 180);
  if (resumo) return resumo.slice(0, 180);

  const direct = pickString(ticket.subject, ticket.topic, ticket.title);
  if (direct) return direct.slice(0, 180);

  return "";
}

export function extractTicketProtocol(ticket: Record<string, unknown>): string {
  const nested = ticket.data && typeof ticket.data === "object" && !Array.isArray(ticket.data)
    ? ticket.data as Record<string, unknown>
    : null;
  const protocol = pickString(
    ticket.protocol,
    ticket.protocolNumber,
    ticket.protocol_number,
    ticket.protocolo,
    nested?.protocol,
    ticket.number,
    ticket.ticketNumber,
    ticket.ticket_number,
  );
  if (!protocol || looksLikeUuid(protocol) || looksLikeTruncatedId(protocol) || looksLikePhoneNumber(protocol)) {
    return "";
  }
  return protocol;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
    }
  });
  await Promise.all(runners);
  return results;
}

export async function fetchTicketTopicNames(
  fetchDigisac: FetchDigisacFn,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const params = new URLSearchParams({ perPage: "200", limit: "200" });
  const r = await fetchDigisac("/api/v1/ticket-topics", params);
  if (!r.ok) return map;
  const payload = r.data;
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) {
    rows = payload.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
  } else if (payload && typeof payload === "object") {
    const data = (payload as Record<string, unknown>).data;
    if (Array.isArray(data)) {
      rows = data.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
    }
  }
  for (const row of rows) {
    const id = pickString(row.id);
    const name = pickString(row.name, row.label, row.title);
    if (id && name) map.set(id, name);
  }
  return map;
}

export async function fetchTicketDetailsByIds(
  fetchDigisac: FetchDigisacFn,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return map;

  await mapPool(unique, 6, async (id) => {
    const withTopics = new URLSearchParams();
    withTopics.set("include[0][model]", "ticketTopics");
    withTopics.set("include[0][required]", "false");
    let r = await fetchDigisac(`/api/v1/tickets/${id}`, withTopics);
    if (!r.ok) r = await fetchDigisac(`/api/v1/tickets/${id}`);
    if (!r.ok) return;
    const root = r.data && typeof r.data === "object" ? r.data as Record<string, unknown> : null;
    const record = unwrapDigisacRecord(r.data);
    if (!record) return;
    if (root) {
      for (const key of ["ticketTopics", "ticket_topics", "topics", "ticketTopic"]) {
        if (record[key] == null && root[key] != null) record[key] = root[key];
      }
    }
    map.set(id, record);
  });

  return map;
}

const ticketSortAt = (row: Record<string, unknown>, date: string): string => {
  return pickString(row.startedAt, row.createdAt, row.openDate, row.openedAt) || `${date}T00:00:00.000-03:00`;
};

const preferName = (current: string, next: string): string => {
  const a = current.trim();
  const b = next.trim();
  if (!b || b === "Cliente") return a || "Cliente";
  if (!a || a === "Cliente") return b;
  return b.length >= a.length ? b : a;
};

const preferPhone = (current: string, next: string): string => {
  const a = current.trim();
  const b = next.trim();
  if (!b || b === "—") return a;
  if (!a || a === "—") return b;
  return normalizePhoneKey(b).length >= normalizePhoneKey(a).length ? b : a;
};

export function mapRawTicketToInput(
  row: Record<string, unknown>,
  unit: RecurrenceUnitKey,
  contacts: Map<string, TicketContactRef>,
  analystNames: Map<string, string>,
  attendantsByTicket?: Map<string, TicketAttendantRef>,
  topicNames?: Map<string, string>,
): RecurrenceTicketInput | null {
  const id = pickString(row.id);
  const date = ticketDate(row);
  if (!id || !date) return null;

  const contactId = ticketContactId(row) || extractTicketContactId(row);
  const embedded = extractTicketContact(row);
  const fetched = contactId ? contacts.get(contactId) : undefined;
  const name = pickString(fetched?.name, embedded?.name) || "Cliente";
  const rawPhone = pickString(
    fetched?.contact && fetched.contact !== "—" ? fetched.contact : "",
    embedded?.contact && embedded.contact !== "—" ? embedded.contact : "",
  );
  const attendant = extractTicketAttendant(row) ?? attendantsByTicket?.get(id) ?? null;
  const mappedName = attendant?.userId ? analystNames.get(attendant.userId) : "";
  const attendantName = pickString(mappedName, attendant?.name) || "—";

  return {
    id,
    contactId,
    date,
    sortAt: ticketSortAt(row, date),
    phone: rawPhone,
    name,
    attendantName,
    attendantUserId: attendant?.userId || "",
    subject: extractTicketSubject(row, topicNames),
    protocol: extractTicketProtocol(row),
    unit,
  };
}

export function buildRecurrence(tickets: RecurrenceTicketInput[]): {
  summary: RecurrenceSummary;
  contacts: RecurrenceContactRow[];
} {
  const groups = new Map<string, RecurrenceTicketInput[]>();
  for (const ticket of tickets) {
    if (!ticket.id || !ticket.date) continue;
    const key = contactGroupKey(ticket.phone, ticket.contactId);
    const list = groups.get(key);
    if (list) list.push(ticket);
    else groups.set(key, [ticket]);
  }

  const contacts: RecurrenceContactRow[] = [];
  for (const [key, list] of groups) {
    const historyTickets = [...list].sort((a, b) => {
      const byTime = a.sortAt.localeCompare(b.sortAt);
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
    const atendimentos = historyTickets.length;
    const retornos = Math.max(0, atendimentos - 1);
    const classification = classifyRecurrence(atendimentos);
    const units = [...new Set(historyTickets.map((item) => item.unit))].sort();
    const last = historyTickets[historyTickets.length - 1];
    const first = historyTickets[0];
    let name = "";
    let phone = "";
    for (const item of historyTickets) {
      name = preferName(name, item.name);
      phone = preferPhone(phone, item.phone);
    }
    const lastFilled = [...historyTickets].reverse().find((item) => item.subject.trim() && item.subject !== "—") ?? last;

    contacts.push({
      key,
      name: name || "Cliente",
      phone: phone || "—",
      units,
      atendimentos,
      retornos,
      classification,
      classificationLabel: RECURRENCE_CLASS_LABEL[classification],
      firstAtendimento: first.date,
      lastAtendimento: last.date,
      analystName: last.attendantName || "—",
      subject: lastFilled.subject || "—",
      history: historyTickets.map((item) => ({
        ticketId: item.id,
        date: item.date,
        analystName: item.attendantName || "—",
        unit: item.unit,
        protocol: item.protocol || "—",
        subject: item.subject || "—",
      })),
    });
  }

  contacts.sort((a, b) => {
    if (b.atendimentos !== a.atendimentos) return b.atendimentos - a.atendimentos;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const contatosUnicos = contacts.length;
  const contatosRecorrentes = contacts.filter((row) => row.atendimentos >= 2).length;
  const totalAtendimentos = contacts.reduce((sum, row) => sum + row.atendimentos, 0);
  const totalRetornos = contacts.reduce((sum, row) => sum + row.retornos, 0);

  return {
    summary: {
      totalAtendimentos,
      contatosUnicos,
      contatosRecorrentes,
      totalRetornos,
      taxaRecorrencia: contatosUnicos === 0 ? 0 : (contatosRecorrentes / contatosUnicos) * 100,
      mediaAtendimentos: contatosUnicos === 0 ? 0 : totalAtendimentos / contatosUnicos,
    },
    contacts,
  };
}
