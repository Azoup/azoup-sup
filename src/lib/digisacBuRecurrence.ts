export type RecurrenceClass = "unico" | "retorno" | "recorrente" | "alta_recorrencia";
export type RecurrenceUnitKey = "B1" | "B2";

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

/** Dígitos nacionais (sem 55) para agrupar o mesmo WhatsApp. */
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

  return { summary: summarizeContacts(contacts), contacts };
}

export function summarizeContacts(contacts: RecurrenceContactRow[]): RecurrenceSummary {
  const contatosUnicos = contacts.length;
  const contatosRecorrentes = contacts.filter((row) => row.atendimentos >= 2).length;
  const totalAtendimentos = contacts.reduce((sum, row) => sum + row.atendimentos, 0);
  const totalRetornos = contacts.reduce((sum, row) => sum + row.retornos, 0);
  return {
    totalAtendimentos,
    contatosUnicos,
    contatosRecorrentes,
    totalRetornos,
    taxaRecorrencia: contatosUnicos === 0 ? 0 : (contatosRecorrentes / contatosUnicos) * 100,
    mediaAtendimentos: contatosUnicos === 0 ? 0 : totalAtendimentos / contatosUnicos,
  };
}

export function rebuildContactFromHistory(
  contact: RecurrenceContactRow,
  history: RecurrenceHistoryItem[],
): RecurrenceContactRow | null {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.ticketId.localeCompare(b.ticketId);
  });
  const atendimentos = sorted.length;
  const classification = classifyRecurrence(atendimentos);
  const last = sorted[sorted.length - 1];
  return {
    ...contact,
    units: [...new Set(sorted.map((item) => item.unit))].sort(),
    atendimentos,
    retornos: Math.max(0, atendimentos - 1),
    classification,
    classificationLabel: RECURRENCE_CLASS_LABEL[classification],
    firstAtendimento: sorted[0].date,
    lastAtendimento: last.date,
    analystName: last.analystName || "—",
    subject: last.subject || "—",
    history: sorted,
  };
}

export function listAnalystNames(contacts: RecurrenceContactRow[]): string[] {
  const names = new Set<string>();
  for (const contact of contacts) {
    for (const item of contact.history) {
      const name = item.analystName.trim();
      if (name && name !== "—") names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function filterContactsByAnalyst(
  contacts: RecurrenceContactRow[],
  analyst: string,
): RecurrenceContactRow[] {
  if (!analyst || analyst === "all") return contacts;
  const next: RecurrenceContactRow[] = [];
  for (const contact of contacts) {
    const history = contact.history.filter((item) => item.analystName === analyst);
    const rebuilt = rebuildContactFromHistory(contact, history);
    if (rebuilt) next.push(rebuilt);
  }
  next.sort((a, b) => {
    if (b.atendimentos !== a.atendimentos) return b.atendimentos - a.atendimentos;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  return next;
}

export function matchesContactSearch(contact: Pick<RecurrenceContactRow, "name" | "phone">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (contact.name.toLowerCase().includes(q)) return true;
  if (contact.phone.toLowerCase().includes(q)) return true;
  if (digits && normalizePhoneKey(contact.phone).includes(digits)) return true;
  return false;
}
