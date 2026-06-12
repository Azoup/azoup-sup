export type FetchDigisacFn = (
  endpoint: string,
  params?: URLSearchParams,
) => Promise<{ ok: boolean; status: number; data: unknown }>;

export type TicketAttendantRef = { userId: string; name: string };

const pickName = (obj: unknown): string => {
  if (!obj || typeof obj !== "object") return "";
  const r = obj as Record<string, unknown>;
  return String(r.name ?? r.fullName ?? r.displayName ?? "").trim();
};

export function extractTicketAttendant(ticket: Record<string, unknown>): TicketAttendantRef | null {
  for (const key of ["lastUserId", "userId", "attendantId", "closedById", "operatorId"]) {
    const userId = String(ticket[key] ?? "").trim();
    if (!userId) continue;
    const nestedKey = key.replace(/Id$/, "");
    const name = pickName(ticket[nestedKey]) || pickName(ticket.lastUser) || pickName(ticket.user);
    return { userId, name };
  }

  for (const key of ["lastUser", "user", "attendant", "closedBy", "operator"]) {
    const nested = ticket[key];
    if (nested && typeof nested === "object") {
      const userId = String((nested as Record<string, unknown>).id ?? "").trim();
      if (userId) return { userId, name: pickName(nested) };
    }
  }

  const attended = ticket.attendedUsers ?? ticket.users ?? ticket.participants;
  if (Array.isArray(attended)) {
    for (let i = attended.length - 1; i >= 0; i--) {
      const u = attended[i];
      if (!u || typeof u !== "object") continue;
      const userId = String((u as Record<string, unknown>).id ?? "").trim();
      if (userId) return { userId, name: pickName(u) };
    }
  }

  return null;
}

const flattenTickets = (payload: unknown): Record<string, unknown>[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root)) {
    return root.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
  }
  for (const key of ["data", "items", "rows", "tickets", "results"]) {
    const val = root[key];
    if (Array.isArray(val)) {
      return val.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
    }
  }
  return [];
};

function buildTicketBatchParams(ids: string[]): URLSearchParams[] {
  const variants: URLSearchParams[] = [];
  const inList = new URLSearchParams({ limit: String(Math.min(ids.length, 200)) });
  for (const id of ids) inList.append("where[id][]", id);
  variants.push(inList);

  const inBracket = new URLSearchParams({ limit: String(Math.min(ids.length, 200)) });
  inBracket.set("where[id][in]", ids.join(","));
  variants.push(inBracket);

  const filterIds = new URLSearchParams({ limit: String(Math.min(ids.length, 200)) });
  for (const id of ids) filterIds.append("filter[id][]", id);
  variants.push(filterIds);

  return variants;
}

export async function fetchTicketBatch(
  fetchDigisac: FetchDigisacFn,
  ids: string[],
): Promise<Map<string, TicketAttendantRef>> {
  const map = new Map<string, TicketAttendantRef>();
  if (!ids.length) return map;

  for (const params of buildTicketBatchParams(ids)) {
    const r = await fetchDigisac("/api/v1/tickets", params);
    if (!r.ok) continue;
    for (const ticket of flattenTickets(r.data)) {
      const id = String(ticket.id ?? "").trim();
      const att = extractTicketAttendant(ticket);
      if (id && att) map.set(id, att);
    }
    if (map.size >= ids.length * 0.5) break;
  }

  const missing = ids.filter((id) => !map.has(id));
  const take = missing.slice(0, 80);
  await Promise.all(
    take.map(async (id) => {
      const r = await fetchDigisac(`/api/v1/tickets/${id}`);
      if (!r.ok || !r.data || typeof r.data !== "object") return;
      const ticket = (r.data as Record<string, unknown>).data && typeof (r.data as Record<string, unknown>).data === "object"
        ? (r.data as Record<string, unknown>).data as Record<string, unknown>
        : r.data as Record<string, unknown>;
      const att = extractTicketAttendant(ticket);
      if (att) map.set(id, att);
    }),
  );

  return map;
}

/** Preenche userId/nome do atendente a partir do ticketId de cada resposta. */
export async function enrichAnswersWithTicketAttendants(
  fetchDigisac: FetchDigisacFn,
  rows: Record<string, unknown>[],
): Promise<number> {
  const ticketIds = [...new Set(
    rows.map((r) => String(r.ticketId ?? r.ticket_id ?? "").trim()).filter(Boolean),
  )];
  if (!ticketIds.length) return 0;

  const attendantByTicket = new Map<string, TicketAttendantRef>();
  const chunkSize = 40;
  for (let i = 0; i < ticketIds.length; i += chunkSize) {
    const chunk = ticketIds.slice(i, i + chunkSize);
    const batch = await fetchTicketBatch(fetchDigisac, chunk);
    for (const [id, att] of batch) attendantByTicket.set(id, att);
  }

  let enriched = 0;
  for (const row of rows) {
    const ticketId = String(row.ticketId ?? row.ticket_id ?? "").trim();
    if (!ticketId) continue;
    const att = attendantByTicket.get(ticketId);
    if (!att) continue;
    row._digisacUserId = att.userId;
    if (!String(row.userId ?? row.user_id ?? "").trim()) row.userId = att.userId;
    if (!String(row.attendantName ?? "").trim() && att.name) row.attendantName = att.name;
    enriched += 1;
  }
  return enriched;
}
