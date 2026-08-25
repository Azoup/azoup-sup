export type BuTicketRef = {
  id: string;
  contactId: string;
  date: string;
};

export type BuUnitMetrics = {
  atendimentos: number;
  contatos: number;
};

const firstNonEmpty = (...values: unknown[]): string => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const flattenTickets = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
  }
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  for (const key of ["data", "items", "rows", "tickets", "results"]) {
    const val = root[key];
    if (Array.isArray(val)) {
      return val.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
    }
    if (val && typeof val === "object") {
      const inner = val as Record<string, unknown>;
      if (Array.isArray(inner.data)) {
        return inner.data.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
      }
    }
  }
  return [];
};

const brazilDateOnlyFromIso = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const brazil = new Date(parsed.getTime() - 3 * 60 * 60 * 1000);
  return `${brazil.getUTCFullYear()}-${String(brazil.getUTCMonth() + 1).padStart(2, "0")}-${String(brazil.getUTCDate()).padStart(2, "0")}`;
};

const ticketDate = (row: Record<string, unknown>): string => {
  const raw = firstNonEmpty(row.startedAt, row.createdAt, row.openDate, row.openedAt);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return brazilDateOnlyFromIso(raw);
};

const ticketContactId = (row: Record<string, unknown>): string => {
  const nested = row.contact && typeof row.contact === "object"
    ? row.contact as Record<string, unknown>
    : undefined;
  return firstNonEmpty(row.contactId, nested?.id);
};

export function metricsFromTickets(tickets: BuTicketRef[], startDate: string, endDate: string): BuUnitMetrics {
  const inRange = tickets.filter((ticket) => ticket.date >= startDate && ticket.date <= endDate);
  const contacts = new Set(inRange.map((ticket) => ticket.contactId).filter(Boolean));
  return { atendimentos: inRange.length, contatos: contacts.size };
}

export function parseTagDisplayName(raw: unknown): { id: string; name: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const nested = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : undefined;
  if (row.deletedAt || nested?.deletedAt) return null;
  const id = firstNonEmpty(row.id, nested?.id);
  if (!id) return null;
  const name = firstNonEmpty(
    row.label,
    nested?.label,
    row.name,
    nested?.name,
    row.title,
    nested?.title,
  );
  return { id, name: name || "Sem nome" };
}

type FetchDigisac = (
  endpoint: string,
  params?: URLSearchParams,
) => Promise<{ ok: boolean; status: number; data: unknown }>;

function buildTicketQueryVariants(input: {
  startPeriod: string;
  endPeriod: string;
  departmentId: string;
  tagId: string;
  page: number;
  perPage: number;
}): URLSearchParams[] {
  const { startPeriod, endPeriod, departmentId, tagId, page, perPage } = input;
  const includeContactTags = {
    model: "contact",
    required: true,
    attributes: ["id"],
    include: [{
      model: "tags",
      required: true,
      attributes: ["id", "label"],
      where: { id: tagId },
    }],
  };

  const jsonQueries = [
    {
      distinct: true,
      attributes: ["id", "contactId", "startedAt", "createdAt", "departmentId"],
      where: {
        departmentId,
        startedAt: { $gte: startPeriod, $lte: endPeriod },
      },
      include: [includeContactTags],
      page,
      perPage,
    },
    {
      distinct: true,
      attributes: ["id", "contactId", "startedAt", "createdAt", "departmentId"],
      where: {
        departmentId,
        createdAt: { $gte: startPeriod, $lte: endPeriod },
      },
      include: [includeContactTags],
      page,
      perPage,
    },
  ];

  const simple = new URLSearchParams({
    startPeriod,
    endPeriod,
    periodType: "openDate",
    departmentId,
    page: String(page),
    perPage: String(perPage),
  });
  simple.set("where[contact.tags.id]", tagId);
  simple.set("include[0][model]", "contact");
  simple.set("include[0][required]", "true");
  simple.set("include[0][include][0][model]", "tags");

  return [simple, ...jsonQueries.map((query) => {
    const params = new URLSearchParams({
      startPeriod,
      endPeriod,
      periodType: "openDate",
      departmentId,
      page: String(page),
      perPage: String(perPage),
      query: JSON.stringify(query),
    });
    return params;
  })];
}

export async function fetchTicketsForContactTag(
  fetchDigisac: FetchDigisac,
  input: {
    startPeriod: string;
    endPeriod: string;
    departmentId: string;
    tagId: string;
  },
): Promise<BuTicketRef[]> {
  const collected: BuTicketRef[] = [];
  const seen = new Set<string>();
  const perPage = 100;
  let workingVariant = 0;

  for (let page = 1; page <= 40; page++) {
    const variants = buildTicketQueryVariants({ ...input, page, perPage });
    let list: Record<string, unknown>[] = [];
    let ok = false;

    const ordered = [variants[workingVariant], ...variants.filter((_, i) => i !== workingVariant)];
    for (let i = 0; i < ordered.length; i++) {
      const params = ordered[i];
      const r = await fetchDigisac("/api/v1/tickets", params);
      if (!r.ok) continue;
      const rows = flattenTickets(r.data);
      ok = true;
      list = rows;
      if (i !== 0) {
        const originalIndex = variants.indexOf(params);
        if (originalIndex >= 0) workingVariant = originalIndex;
      }
      break;
    }

    if (!ok) break;

    let added = 0;
    for (const row of list) {
      const id = firstNonEmpty(row.id);
      if (!id || seen.has(id)) continue;
      const contactId = ticketContactId(row);
      const date = ticketDate(row);
      if (!date) continue;
      seen.add(id);
      collected.push({ id, contactId, date });
      added++;
    }

    if (list.length < perPage || added === 0) break;
  }

  return collected;
}
