import type { FetchDigisacFn } from "./digisacNpsTickets.ts";

export type TicketContactRef = { name: string; contact: string };

const pickString = (...values: unknown[]): string => {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

const pickName = (obj: unknown): string => {
  if (!obj || typeof obj !== "object") return "";
  const r = obj as Record<string, unknown>;
  return pickString(
    r.internalName,
    r.name,
    r.alternativeName,
    r.fullName,
    r.displayName,
    r.alias,
    r.label,
  );
};

const pickPhone = (obj: unknown): string => {
  if (!obj || typeof obj !== "object") return "";
  const r = obj as Record<string, unknown>;
  const nested = r.data && typeof r.data === "object" ? r.data as Record<string, unknown> : null;

  const number = pickString(
    nested?.number,
    r.number,
    nested?.phone,
    r.phone,
    r.phoneNumber,
    r.phone_number,
    r.mobile,
    r.whatsapp,
  );
  if (number) return formatPhoneDisplay(number);

  const jid = pickString(nested?.jidId, r.jidId);
  if (jid) return formatPhoneDisplay(jid.split("@")[0]);

  return "";
};

/** Evita confundir o objeto `data` aninhado (telefone) com wrapper `{ data: contact }`. */
export function unwrapDigisacRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  if (Array.isArray(root.data) && root.data[0] && typeof root.data[0] === "object") {
    return root.data[0] as Record<string, unknown>;
  }

  const wrapped = root.data;
  if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) {
    const inner = wrapped as Record<string, unknown>;
    if (inner.id || inner.name || inner.internalName || inner.contactId) return inner;
  }

  if (root.id || root.name || root.internalName || root.contactId) return root;
  return root;
}

export function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw.trim();
}

export function parseDigisacContactRecord(record: Record<string, unknown>): TicketContactRef | null {
  const name = pickName(record);
  const contact = pickPhone(record);
  if (!name && !contact) return null;
  return {
    name: name || "Cliente",
    contact: contact || "—",
  };
}

export function extractTicketContactId(ticket: Record<string, unknown>): string {
  return pickString(ticket.contactId, ticket.contact_id);
}

function contactFromNested(nested: unknown): TicketContactRef | null {
  if (!nested || typeof nested !== "object") return null;
  return parseDigisacContactRecord(nested as Record<string, unknown>);
}

/** Extrai contato embutido no ticket (quando a API já expande o objeto). */
export function extractTicketContact(ticket: Record<string, unknown>): TicketContactRef | null {
  for (const key of ["contact", "person", "client", "customer", "lastContact"]) {
    const ref = contactFromNested(ticket[key]);
    if (ref) return ref;
  }

  const name = pickString(
    ticket.contactName,
    ticket.contact_name,
    ticket.clientName,
    ticket.client_name,
    ticket.personName,
    ticket.person_name,
  );
  const contact = pickString(
    ticket.contactNumber,
    ticket.contact_number,
    ticket.phone,
    ticket.phoneNumber,
    ticket.phone_number,
    ticket.number,
    ticket.whatsapp,
  );

  if (name || contact) {
    return {
      name: name || "Cliente",
      contact: contact ? formatPhoneDisplay(contact) : "—",
    };
  }

  return null;
}

function buildContactBatchParams(ids: string[]): URLSearchParams[] {
  const variants: URLSearchParams[] = [];
  const limit = String(Math.min(ids.length, 200));

  const inBracket = new URLSearchParams({ limit });
  inBracket.set("where[id][in]", ids.join(","));
  variants.push(inBracket);

  for (const id of ids.slice(0, 50)) {
    const single = new URLSearchParams({ limit: "1", "where[id]": id });
    variants.push(single);
  }

  return variants;
}

/** Busca nome e telefone dos contatos na API Digisac. */
export async function fetchContactBatch(
  fetchDigisac: FetchDigisacFn,
  ids: string[],
): Promise<Map<string, TicketContactRef>> {
  const map = new Map<string, TicketContactRef>();
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return map;

  for (const params of buildContactBatchParams(unique)) {
    const r = await fetchDigisac("/api/v1/contacts", params);
    if (!r.ok) continue;

    const payload = r.data;
    const rows: Record<string, unknown>[] = [];
    if (Array.isArray(payload)) {
      rows.push(...payload.filter((x) => x && typeof x === "object") as Record<string, unknown>[]);
    } else if (payload && typeof payload === "object") {
      const data = (payload as Record<string, unknown>).data;
      if (Array.isArray(data)) {
        rows.push(...data.filter((x) => x && typeof x === "object") as Record<string, unknown>[]);
      } else {
        const single = unwrapDigisacRecord(payload);
        if (single) rows.push(single);
      }
    }

    for (const row of rows) {
      const id = pickString(row.id);
      const parsed = parseDigisacContactRecord(row);
      if (id && parsed) map.set(id, parsed);
    }

    if (map.size >= unique.length) break;
  }

  const missing = unique.filter((id) => !map.has(id));
  await Promise.all(
    missing.slice(0, 80).map(async (id) => {
      const r = await fetchDigisac(`/api/v1/contacts/${id}`);
      if (!r.ok) return;
      const record = unwrapDigisacRecord(r.data);
      if (!record) return;
      const parsed = parseDigisacContactRecord(record);
      if (parsed) map.set(id, parsed);
    }),
  );

  return map;
}

export async function resolveTicketContact(
  fetchDigisac: FetchDigisacFn,
  ticket: Record<string, unknown>,
  cache?: Map<string, TicketContactRef>,
): Promise<TicketContactRef | null> {
  const embedded = extractTicketContact(ticket);
  if (embedded && embedded.contact !== "—") return embedded;

  const contactId = extractTicketContactId(ticket);
  if (!contactId) return embedded;

  if (cache?.has(contactId)) return cache.get(contactId)!;

  const batch = await fetchContactBatch(fetchDigisac, [contactId]);
  const resolved = batch.get(contactId) ?? null;
  if (resolved && cache) cache.set(contactId, resolved);
  return resolved ?? embedded;
}
