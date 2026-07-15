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
  return pickString(r.name, r.fullName, r.displayName, r.alias, r.label);
};

const pickPhone = (obj: unknown): string => {
  if (!obj || typeof obj !== "object") return "";
  const r = obj as Record<string, unknown>;
  return pickString(
    r.number,
    r.phone,
    r.phoneNumber,
    r.phone_number,
    r.mobile,
    r.whatsapp,
    r.value,
  );
};

function contactFromNested(nested: unknown): TicketContactRef | null {
  if (!nested || typeof nested !== "object") return null;
  const name = pickName(nested);
  const contact = pickPhone(nested);
  if (!name && !contact) return null;
  return { name: name || "Cliente", contact: contact || "—" };
}

/** Extrai nome e contato do cliente a partir do ticket Digisac. */
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
    return { name: name || "Cliente", contact: contact || "—" };
  }

  const contactId = pickString(ticket.contactId, ticket.contact_id);
  if (contactId) {
    return { name: "Cliente", contact: contactId };
  }

  return null;
}
