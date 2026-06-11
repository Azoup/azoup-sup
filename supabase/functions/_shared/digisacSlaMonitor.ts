import { extractTicketAttendant, type FetchDigisacFn } from "./digisacNpsTickets.ts";
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

export type SlaMonitorResult = {
  scanned: number;
  tracked: number;
  escalated: number;
  notified: number;
  resolved: number;
  errors: string[];
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

export function normalizeOpenTicket(
  ticket: Record<string, unknown>,
  now = new Date(),
): SlaTicket | null {
  if (!isTicketOpen(ticket)) return null;
  const id = pickString(ticket.id);
  const startedAt = extractTicketStartTime(ticket);
  if (!id || !startedAt) return null;

  const durationMinutes = minutesBetween(startedAt, now);
  if (durationMinutes < WARN_THRESHOLD_MINUTES) return null;

  const attendant = extractTicketAttendant(ticket);
  return {
    id,
    protocol: extractTicketProtocol(ticket),
    analystName: attendant?.name || "Sem atendente",
    digisacUserId: attendant?.userId || "",
    startedAt,
    durationMinutes,
  };
}

function buildOpenTicketQueryVariants(departmentId: string): URLSearchParams[] {
  const base = { limit: "200" };
  const variants: URLSearchParams[] = [];

  const combos: Record<string, string>[] = [
    { ...base, "where[status]": "open", "where[departmentId]": departmentId },
    { ...base, status: "open", departmentId },
    { ...base, "where[status][in]": "open,in_progress", "where[departmentId]": departmentId },
    { ...base, "filter[status]": "open", departmentId },
    { ...base, "where[isOpen]": "true", "where[departmentId]": departmentId },
    { ...base, periodType: "open", departmentId },
  ];

  for (const combo of combos) {
    variants.push(new URLSearchParams(combo));
  }
  return variants;
}

export async function fetchOpenSlaTickets(
  fetchDigisac: FetchDigisacFn,
  departmentId: string,
  now = new Date(),
): Promise<SlaTicket[]> {
  const seen = new Map<string, SlaTicket>();

  for (const params of buildOpenTicketQueryVariants(departmentId)) {
    const r = await fetchDigisac("/api/v1/tickets", params);
    if (!r.ok) continue;
    for (const raw of flattenTickets(r.data)) {
      const ticket = normalizeOpenTicket(raw, now);
      if (ticket) seen.set(ticket.id, ticket);
    }
    if (seen.size > 0) break;
  }

  return [...seen.values()];
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
    scanned: 0,
    tracked: 0,
    escalated: 0,
    notified: 0,
    resolved: 0,
    errors: [],
  };

  let departmentId = input.departmentId?.trim() || "";
  if (!departmentId) {
    departmentId = (await resolveSuporteDepartmentId(input.fetchDigisac)) ?? "";
  }
  if (!departmentId) {
    result.errors.push("Departamento Suporte não encontrado na Digisac");
    return result;
  }

  const openTickets = await fetchOpenSlaTickets(input.fetchDigisac, departmentId, now);
  result.scanned = openTickets.length;
  const openIds = new Set(openTickets.map((t) => t.id));

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
