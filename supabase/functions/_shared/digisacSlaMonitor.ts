import { extractTicketAttendant, fetchTicketBatch, type FetchDigisacFn } from "./digisacNpsTickets.ts";
import { pickSuporteDepartmentId } from "./digisacAnswersOverview.ts";

export const WARN_THRESHOLD_MINUTES = 40;
export const ESCALATE_THRESHOLD_MINUTES = 45;

export type SlaTicket = {
  id: string;
  protocol: string;
  analystName: string;
  digisacUserId: string;
  startedAt: Date;
  durationMinutes: number;
};

export type SlaMonitorPreview = {
  protocol: string;
  analystName: string;
  durationMinutes: number;
};

export type SlaMonitorResult = {
  openTotal: number;
  over40: number;
  over45: number;
  scanned: number;
  tracked: number;
  escalated: number;
  notified: number;
  resolved: number;
  errors: string[];
  preview: SlaMonitorPreview[];
};

const OPEN_STATUS = new Set([
  "open",
  "opened",
  "aberto",
  "in_progress",
  "in progress",
  "em andamento",
  "pending",
  "active",
]);

const flattenTickets = (payload: unknown): Record<string, unknown>[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root)) {
    return root.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
  }
  for (const key of ["data", "items", "rows", "tickets", "results", "records"]) {
    const val = root[key];
    if (Array.isArray(val)) {
      return val.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
    }
    if (val && typeof val === "object") {
      const nested = val as Record<string, unknown>;
      for (const nk of ["data", "items", "rows", "records"]) {
        const arr = nested[nk];
        if (Array.isArray(arr)) {
          return arr.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
        }
      }
    }
  }
  return [];
};

const pickString = (...values: unknown[]): string => {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
};

export function extractTicketProtocol(ticket: Record<string, unknown>): string {
  const protocol = pickString(
    ticket.protocol,
    ticket.protocolNumber,
    ticket.protocol_number,
    ticket.number,
    ticket.ticketNumber,
    ticket.ticket_number,
  );
  if (protocol) return protocol;
  const id = pickString(ticket.id);
  return id ? `#${id.slice(0, 8)}` : "—";
}

export function extractTicketStartTime(ticket: Record<string, unknown>): Date | null {
  return parseDate(
    ticket.openedAt
      ?? ticket.opened_at
      ?? ticket.openDate
      ?? ticket.open_date
      ?? ticket.createdAt
      ?? ticket.created_at
      ?? ticket.startedAt
      ?? ticket.started_at
      ?? ticket.startDate
      ?? ticket.start_date,
  );
}

export function isTicketOpen(ticket: Record<string, unknown>): boolean {
  const closedAt = parseDate(
    ticket.closedAt ?? ticket.closed_at ?? ticket.closeDate ?? ticket.close_date ?? ticket.finishedAt,
  );
  if (closedAt) return false;

  const status = pickString(ticket.status, ticket.state, ticket.ticketStatus).toLowerCase();
  if (status) {
    if (["closed", "close", "fechado", "finished", "resolved"].includes(status)) return false;
    if (OPEN_STATUS.has(status)) return true;
  }

  if (ticket.isOpen === true || ticket.open === true) return true;
  if (ticket.isOpen === false || ticket.open === false) return false;

  return !closedAt;
}

export function minutesBetween(start: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60_000));
}

export function formatDurationMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

export function formatBrazilDateTime(iso: Date | string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function parseOpenTicketBase(
  ticket: Record<string, unknown>,
  now = new Date(),
): SlaTicket | null {
  if (!isTicketOpen(ticket)) return null;
  const id = pickString(ticket.id);
  const startedAt = extractTicketStartTime(ticket);
  if (!id || !startedAt) return null;

  const attendant = extractTicketAttendant(ticket);
  return {
    id,
    protocol: extractTicketProtocol(ticket),
    analystName: attendant?.name || "Sem atendente",
    digisacUserId: attendant?.userId || "",
    startedAt,
    durationMinutes: minutesBetween(startedAt, now),
  };
}

export function normalizeOpenTicket(
  ticket: Record<string, unknown>,
  now = new Date(),
): SlaTicket | null {
  const base = parseOpenTicketBase(ticket, now);
  if (!base || base.durationMinutes < WARN_THRESHOLD_MINUTES) return null;
  return base;
}

export function ticketBelongsToDepartment(
  ticket: Record<string, unknown>,
  departmentId: string,
): boolean {
  if (!departmentId) return true;
  const deptIds = [
    ticket.departmentId,
    ticket.department_id,
    ticket.lastDepartmentId,
    ticket.currentDepartmentId,
    ticket.openedDepartmentId,
  ].map((v) => pickString(v)).filter(Boolean);

  const department = ticket.department ?? ticket.lastDepartment;
  if (department && typeof department === "object") {
    deptIds.push(pickString((department as Record<string, unknown>).id));
  }

  if (deptIds.length === 0) return true;
  return deptIds.includes(departmentId);
}

function buildOpenTicketQueryVariants(departmentId?: string): URLSearchParams[] {
  const variants: URLSearchParams[] = [];
  const withDept = (extra: Record<string, string>) => {
    const combo = { limit: "200", ...extra };
    if (departmentId) combo.departmentId = departmentId;
    return new URLSearchParams(combo);
  };

  const combos: Record<string, string>[] = [
    { "where[status]": "open" },
    { status: "open" },
    { "where[status][in]": "open,in_progress" },
    { "filter[status]": "open" },
    { "where[isOpen]": "true" },
    { periodType: "open" },
    { "where[closedAt][null]": "true" },
  ];

  if (departmentId) {
    combos.unshift(
      { "where[status]": "open", "where[departmentId]": departmentId },
      { status: "open", departmentId },
      { "where[departmentId]": departmentId, periodType: "open" },
    );
  }

  for (const combo of combos) {
    variants.push(withDept(combo));
  }
  return variants;
}

export async function fetchAllOpenTickets(
  fetchDigisac: FetchDigisacFn,
  departmentId: string,
  now = new Date(),
): Promise<SlaTicket[]> {
  const rawById = new Map<string, Record<string, unknown>>();

  for (const params of buildOpenTicketQueryVariants(departmentId)) {
    const r = await fetchDigisac("/api/v1/tickets", params);
    if (!r.ok) continue;
    for (const raw of flattenTickets(r.data)) {
      if (!isTicketOpen(raw)) continue;
      const id = pickString(raw.id);
      if (!id) continue;
      if (!ticketBelongsToDepartment(raw, departmentId)) continue;
      rawById.set(id, raw);
    }
  }

  // Fallback: busca ampla e filtra departamento localmente
  if (rawById.size === 0) {
    for (const params of buildOpenTicketQueryVariants()) {
      const r = await fetchDigisac("/api/v1/tickets", params);
      if (!r.ok) continue;
      for (const raw of flattenTickets(r.data)) {
        if (!isTicketOpen(raw)) continue;
        if (!ticketBelongsToDepartment(raw, departmentId)) continue;
        const id = pickString(raw.id);
        if (id) rawById.set(id, raw);
      }
    }
  }

  const tickets: SlaTicket[] = [];
  for (const raw of rawById.values()) {
    const parsed = parseOpenTicketBase(raw, now);
    if (parsed) tickets.push(parsed);
  }
  return tickets;
}

export async function fetchOpenSlaTickets(
  fetchDigisac: FetchDigisacFn,
  departmentId: string,
  now = new Date(),
): Promise<SlaTicket[]> {
  const all = await fetchAllOpenTickets(fetchDigisac, departmentId, now);
  return all.filter((t) => t.durationMinutes >= WARN_THRESHOLD_MINUTES);
}

export async function resolveSuporteDepartmentId(
  fetchDigisac: FetchDigisacFn,
): Promise<string | null> {
  const r = await fetchDigisac("/api/v1/departments", new URLSearchParams({ limit: "100" }));
  if (!r.ok) return null;
  const rows = flattenTickets(r.data).map((d) => ({
    id: pickString(d.id),
    name: pickString(d.name),
  })).filter((d) => d.id);
  return pickSuporteDepartmentId(rows) ?? null;
}

type SupabaseAdmin = {
  from: (table: string) => {
    select: (cols: string) => {
      is: (col: string, val: null) => {
        data: Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
    upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => {
      select: () => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        is: (col2: string, val2: null) => Promise<{ error: { message: string } | null }>;
        in: (col2: string, vals: string[]) => Promise<{ error: { message: string } | null }>;
      };
      in: (col: string, vals: string[]) => Promise<{ error: { message: string } | null }>;
    };
    insert: (rows: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
  };
};

async function loadDigisacAnalystNameMap(admin: SupabaseAdmin): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data: mappings, error: mapErr } = await (admin as any)
    .from("digisac_analyst_mapping")
    .select("digisac_user_id, digisac_user_name, analyst_id");
  if (mapErr) return map;

  const { data: analysts, error: analystErr } = await (admin as any)
    .from("analysts")
    .select("id, name")
    .eq("status", "active");
  if (analystErr) return map;

  const analystsById = new Map(
    (analysts ?? []).map((a: { id: string; name: string }) => [String(a.id), String(a.name).trim()]),
  );

  for (const mapping of mappings ?? []) {
    const userId = String(mapping.digisac_user_id ?? "").trim();
    if (!userId) continue;
    const name = pickString(
      mapping.digisac_user_name,
      analystsById.get(String(mapping.analyst_id)),
    );
    if (name) map.set(userId, name);
  }
  return map;
}

function resolveAnalystName(
  digisacUserId: string,
  digisacName: string,
  mappingNames: Map<string, string>,
): string {
  const fromTicket = digisacName.trim();
  if (fromTicket && fromTicket !== "Sem atendente") return fromTicket;
  if (digisacUserId) {
    const mapped = mappingNames.get(digisacUserId);
    if (mapped) return mapped;
  }
  return fromTicket || "Sem atendente";
}

async function enrichSlaTicketsAttendants(
  fetchDigisac: FetchDigisacFn,
  tickets: SlaTicket[],
  mappingNames: Map<string, string>,
): Promise<void> {
  const needsDetail = tickets.filter((t) => !t.digisacUserId || t.analystName === "Sem atendente");
  const attendantById = needsDetail.length > 0
    ? await fetchTicketBatch(fetchDigisac, needsDetail.map((t) => t.id))
    : new Map<string, { userId: string; name: string }>();

  for (const ticket of tickets) {
    const att = attendantById.get(ticket.id);
    if (att) {
      ticket.digisacUserId = att.userId || ticket.digisacUserId;
      if (att.name) ticket.analystName = att.name;
    }
    ticket.analystName = resolveAnalystName(ticket.digisacUserId, ticket.analystName, mappingNames);
  }
}

async function loadAdminUserIds(admin: SupabaseAdmin): Promise<string[]> {
  const { data, error } = await (admin as any)
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean);
}

function buildEscalationMessage(ticket: SlaTicket): string {
  const duration = formatDurationMinutes(ticket.durationMinutes);
  const started = formatBrazilDateTime(ticket.startedAt);
  return `Atendimento ${ticket.protocol} aberto há ${duration}. Analista: ${ticket.analystName}. Início: ${started}.`;
}

export async function runDigisacSlaMonitor(input: {
  fetchDigisac: FetchDigisacFn;
  adminClient: SupabaseAdmin;
  departmentId?: string;
  now?: Date;
}): Promise<SlaMonitorResult> {
  const now = input.now ?? new Date();
  const result: SlaMonitorResult = {
    openTotal: 0,
    over40: 0,
    over45: 0,
    scanned: 0,
    tracked: 0,
    escalated: 0,
    notified: 0,
    resolved: 0,
    errors: [],
    preview: [],
  };

  let departmentId = input.departmentId?.trim() || "";
  if (!departmentId) {
    departmentId = (await resolveSuporteDepartmentId(input.fetchDigisac)) ?? "";
  }
  if (!departmentId) {
    result.errors.push("Departamento Suporte não encontrado na Digisac");
    return result;
  }

  const allOpen = await fetchAllOpenTickets(input.fetchDigisac, departmentId, now);
  const mappingNames = await loadDigisacAnalystNameMap(input.adminClient);
  await enrichSlaTicketsAttendants(input.fetchDigisac, allOpen, mappingNames);
  const openTickets = allOpen.filter((t) => t.durationMinutes >= WARN_THRESHOLD_MINUTES);

  result.openTotal = allOpen.length;
  result.over40 = openTickets.length;
  result.over45 = openTickets.filter((t) => t.durationMinutes >= ESCALATE_THRESHOLD_MINUTES).length;
  result.scanned = openTickets.length;
  result.preview = openTickets
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
    .slice(0, 8)
    .map((t) => ({
      protocol: t.protocol,
      analystName: t.analystName,
      durationMinutes: t.durationMinutes,
    }));

  const openIds = new Set(allOpen.map((t) => t.id));

  const { data: activeAlerts, error: activeErr } = await (input.adminClient as any)
    .from("digisac_sla_alerts")
    .select("id, digisac_ticket_id, admin_notified_at, tier")
    .is("resolved_at", null);

  if (activeErr) {
    result.errors.push(activeErr.message);
    return result;
  }

  const staleIds = (activeAlerts ?? [])
    .filter((a: { digisac_ticket_id: string }) => !openIds.has(a.digisac_ticket_id))
    .map((a: { digisac_ticket_id: string }) => a.digisac_ticket_id);

  if (staleIds.length > 0) {
    const { error: resolveErr } = await (input.adminClient as any)
      .from("digisac_sla_alerts")
      .update({ resolved_at: now.toISOString(), updated_at: now.toISOString() })
      .in("digisac_ticket_id", staleIds)
      .is("resolved_at", null);
    if (resolveErr) result.errors.push(resolveErr.message);
    else result.resolved = staleIds.length;
  }

  let adminIds: string[] = [];
  try {
    adminIds = await loadAdminUserIds(input.adminClient);
  } catch (e) {
    result.errors.push(String(e));
  }

  for (const ticket of openTickets) {
    const tier = ticket.durationMinutes >= ESCALATE_THRESHOLD_MINUTES ? "escalate_45" : "warn_40";
    const existing = (activeAlerts ?? []).find(
      (a: { digisac_ticket_id: string }) => a.digisac_ticket_id === ticket.id,
    );

    const { data: upserted, error: upsertErr } = await (input.adminClient as any)
      .from("digisac_sla_alerts")
      .upsert({
        digisac_ticket_id: ticket.id,
        protocol: ticket.protocol,
        analyst_name: ticket.analystName,
        digisac_user_id: ticket.digisacUserId || null,
        started_at: ticket.startedAt.toISOString(),
        duration_minutes: ticket.durationMinutes,
        tier,
        updated_at: now.toISOString(),
      }, { onConflict: "digisac_ticket_id" })
      .select()
      .single();

    if (upsertErr) {
      result.errors.push(upsertErr.message);
      continue;
    }

    const alertIdForUpdate = upserted?.id ?? existing?.id;
    if (alertIdForUpdate) {
      await (input.adminClient as any)
        .from("digisac_sla_notifications")
        .update({
          analyst_name: ticket.analystName,
          duration_minutes: ticket.durationMinutes,
        })
        .eq("alert_id", alertIdForUpdate);
    }

    if (tier === "warn_40") {
      result.tracked += 1;
      continue;
    }

    result.escalated += 1;
    const alertId = upserted?.id ?? existing?.id;
    const alreadyNotified = existing?.admin_notified_at || upserted?.admin_notified_at;
    if (!alertId || alreadyNotified || adminIds.length === 0) continue;

    const message = buildEscalationMessage(ticket);
    const notifications = adminIds.map((recipientId) => ({
      recipient_id: recipientId,
      alert_id: alertId,
      protocol: ticket.protocol,
      analyst_name: ticket.analystName,
      duration_minutes: ticket.durationMinutes,
      started_at: ticket.startedAt.toISOString(),
      message,
    }));

    const { error: notifErr } = await (input.adminClient as any)
      .from("digisac_sla_notifications")
      .upsert(notifications, { onConflict: "recipient_id,alert_id", ignoreDuplicates: true });

    if (notifErr) {
      result.errors.push(notifErr.message);
      continue;
    }

    await (input.adminClient as any)
      .from("digisac_sla_alerts")
      .update({
        admin_notified_at: now.toISOString(),
        tier: "escalate_45",
        duration_minutes: ticket.durationMinutes,
        updated_at: now.toISOString(),
      })
      .eq("id", alertId);

    result.notified += adminIds.length;
  }

  return result;
}
