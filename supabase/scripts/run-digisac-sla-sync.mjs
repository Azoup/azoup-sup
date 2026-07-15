/**
 * Executa sincronização SLA Digisac: lista chamados abertos ≥ 40 min e notifica admins no app.
 * Uso: node supabase/scripts/run-digisac-sla-sync.mjs [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");

function loadEnv() {
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const DRY_RUN = process.argv.includes("--dry-run");
const WARN_MIN = 40;
const ESCALATE_MIN = 40;

const token = process.env.DIGISAC_API_TOKEN || process.env.VITE_DIGISAC_API_TOKEN;
let base = (process.env.DIGISAC_API_URL || process.env.VITE_DIGISAC_API_URL || "").replace(/\/$/, "");
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token || !base) {
  console.error("Defina DIGISAC_API_TOKEN e DIGISAC_API_URL no .env");
  process.exit(1);
}

if (base.endsWith("/api/v1")) base = base.replace(/\/api\/v1$/, "");

const digisacHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function digisacGet(endpoint, params) {
  const ep = endpoint.startsWith("/api/v1") ? endpoint : `/api/v1${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const qs = params?.toString();
  const url = `${base}${ep}${qs ? `?${qs}` : ""}`;
  const r = await fetch(url, { headers: digisacHeaders });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  return { ok: r.ok, status: r.status, data, url };
}

function flatten(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === "object");
  for (const k of ["data", "items", "rows", "tickets", "results", "records"]) {
    const v = payload[k];
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object");
    if (v && typeof v === "object") {
      for (const nk of ["data", "items", "rows", "records"]) {
        if (Array.isArray(v[nk])) return v[nk].filter((x) => x && typeof x === "object");
      }
    }
  }
  return [];
}

function pickStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isOpen(ticket) {
  const closed = parseDate(ticket.closedAt ?? ticket.closed_at ?? ticket.closeDate);
  if (closed) return false;
  const status = pickStr(ticket.status, ticket.state).toLowerCase();
  if (["closed", "close", "fechado", "finished", "resolved"].includes(status)) return false;
  if (["open", "opened", "aberto", "in_progress", "pending", "active"].includes(status)) return true;
  if (ticket.isOpen === true || ticket.open === true) return true;
  return !closed;
}

function extractAttendant(ticket) {
  for (const key of ["lastUserId", "userId", "attendantId"]) {
    const userId = pickStr(ticket[key]);
    if (!userId) continue;
    const nested = ticket[key.replace(/Id$/, "")] ?? ticket.lastUser ?? ticket.user;
    const name = nested && typeof nested === "object"
      ? pickStr(nested.name, nested.fullName, nested.displayName)
      : "";
    return { userId, name: name || "Sem atendente" };
  }
  return { userId: "", name: "Sem atendente" };
}

function formatPhoneDisplay(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return String(raw || "").trim();
}

function parseContactRecord(record) {
  if (!record || typeof record !== "object") return null;
  const name = pickStr(
    record.internalName,
    record.name,
    record.alternativeName,
    record.fullName,
    record.displayName,
  );
  const nested = record.data && typeof record.data === "object" ? record.data : null;
  const phone = pickStr(
    nested?.number,
    record.number,
    nested?.jidId?.split?.("@")?.[0],
    record.jidId?.split?.("@")?.[0],
  );
  if (!name && !phone) return null;
  return { name: name || "Cliente", contact: phone ? formatPhoneDisplay(phone) : "—" };
}

async function fetchContactsByIds(ids) {
  const map = new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  for (const id of unique) {
    const r = await digisacGet(`/contacts/${id}`);
    if (!r.ok || !r.data || typeof r.data !== "object") continue;
    const record = r.data.data && !Array.isArray(r.data.data) && r.data.data.id
      ? r.data.data
      : (Array.isArray(r.data.data) ? r.data.data[0] : r.data);
    const parsed = parseContactRecord(record);
    if (parsed) map.set(id, parsed);
  }
  return map;
}

function extractContact(ticket) {
  for (const key of ["contact", "person", "client", "customer", "lastContact"]) {
    const nested = ticket[key];
    if (!nested || typeof nested !== "object") continue;
    const name = pickStr(nested.name, nested.fullName, nested.displayName, nested.alias);
    const contact = pickStr(nested.number, nested.phone, nested.phoneNumber, nested.mobile, nested.whatsapp);
    if (name || contact) return { name: name || "Cliente", contact: contact || "—" };
  }
  const name = pickStr(ticket.contactName, ticket.contact_name, ticket.clientName, ticket.client_name);
  const contact = pickStr(ticket.contactNumber, ticket.contact_number, ticket.phone, ticket.number);
  if (name || contact) return { name: name || "Cliente", contact: contact || "—" };
  return { name: "", contact: "" };
}

function normalizeTicket(raw, now) {
  if (!isOpen(raw)) return null;
  const id = pickStr(raw.id);
  const startedAt = parseDate(
    raw.openedAt ?? raw.opened_at ?? raw.openDate ?? raw.createdAt ?? raw.created_at ?? raw.startedAt,
  );
  if (!id || !startedAt) return null;
  const durationMinutes = Math.max(0, Math.floor((now - startedAt) / 60_000));
  if (durationMinutes < WARN_MIN) return null;
  const att = extractAttendant(raw);
  const client = extractContact(raw);
  const protocol = pickStr(raw.protocol, raw.protocolNumber, raw.number) || `#${id.slice(0, 8)}`;
  return {
    id,
    protocol,
    analystName: att.name,
    digisacUserId: att.userId,
    contactId: pickStr(raw.contactId, raw.contact_id),
    clientName: client.name,
    clientContact: client.contact,
    startedAt,
    durationMinutes,
  };
}

async function pickSuporteDeptId() {
  const r = await digisacGet("/departments", new URLSearchParams({ limit: "100" }));
  if (!r.ok) return null;
  const rows = flatten(r.data).map((d) => ({ id: pickStr(d.id), name: pickStr(d.name) }));
  const exact = rows.find((d) => d.name.toLowerCase() === "suporte");
  if (exact) return exact.id;
  const partial = rows.find((d) => /suporte/i.test(d.name));
  return partial?.id ?? null;
}

async function fetchOpenTickets(deptId, now) {
  const variants = [
    { limit: "200", status: "open", departmentId: deptId },
    { limit: "200", "where[status]": "open", "where[departmentId]": deptId },
    { limit: "200", "where[isOpen]": "true", "where[departmentId]": deptId },
    { limit: "200", periodType: "open", departmentId: deptId },
    { limit: "200", "where[status]": "open" },
  ];
  const seen = new Map();
  for (const combo of variants) {
    const r = await digisacGet("/tickets", new URLSearchParams(combo));
    console.log(`  GET /tickets (${Object.keys(combo).join(", ")}) → ${r.status}, ${flatten(r.data).length} rows`);
    if (!r.ok) continue;
    for (const raw of flatten(r.data)) {
      const t = normalizeTicket(raw, now);
      if (t) seen.set(t.id, t);
    }
    if (seen.size > 0) break;
  }
  return [...seen.values()];
}

async function supabaseRest(path, opts = {}) {
  const url = `${supabaseUrl}/rest/v1/${path}`;
  const r = await fetch(url, {
  ...opts,
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: opts.prefer || "return=representation",
    ...(opts.headers || {}),
  },
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: r.ok, status: r.status, json };
}

async function runSync(tickets, now) {
  if (!supabaseUrl || !serviceKey) {
    console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY necessários para gravar alertas");
    process.exit(1);
  }

  const tableCheck = await supabaseRest("digisac_sla_alerts?select=id&limit=1");
  if (!tableCheck.ok) {
    console.error("\nTabela digisac_sla_alerts não encontrada. Rode: supabase db push");
    console.error("Resposta:", tableCheck.status, JSON.stringify(tableCheck.json));
    process.exit(1);
  }

  const adminsRes = await supabaseRest("user_roles?select=user_id&role=eq.admin");
  const adminIds = (adminsRes.json || []).map((r) => r.user_id).filter(Boolean);
  console.log(`\nAdmins para notificar: ${adminIds.length}`);

  const openIds = new Set(tickets.map((t) => t.id));
  const activeRes = await supabaseRest("digisac_sla_alerts?select=id,digisac_ticket_id,admin_notified_at&resolved_at=is.null");
  const active = activeRes.json || [];

  const stale = active.filter((a) => !openIds.has(a.digisac_ticket_id)).map((a) => a.digisac_ticket_id);
  if (stale.length) {
    await supabaseRest(`digisac_sla_alerts?digisac_ticket_id=in.(${stale.join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ resolved_at: now.toISOString(), updated_at: now.toISOString() }),
    });
    console.log(`Resolvidos (fechados): ${stale.length}`);
  }

  let tracked = 0, escalated = 0, notified = 0;

  for (const ticket of tickets) {
    const tier = ticket.durationMinutes >= ESCALATE_MIN ? "escalate_45" : "warn_40";
    const existing = active.find((a) => a.digisac_ticket_id === ticket.id);

    const upsertRes = await supabaseRest("digisac_sla_alerts?on_conflict=digisac_ticket_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        digisac_ticket_id: ticket.id,
        protocol: ticket.protocol,
        analyst_name: ticket.analystName,
        digisac_user_id: ticket.digisacUserId || null,
        client_name: ticket.clientName || null,
        client_contact: ticket.clientContact || null,
        started_at: ticket.startedAt.toISOString(),
        duration_minutes: ticket.durationMinutes,
        tier,
        updated_at: now.toISOString(),
      }),
    });

    const alertRow = Array.isArray(upsertRes.json) ? upsertRes.json[0] : upsertRes.json;
    if (!upsertRes.ok) {
      console.error("Erro upsert alerta:", ticket.protocol, upsertRes.status, upsertRes.json);
      continue;
    }

    if (tier === "warn_40") {
      tracked++;
      console.log(`  [rastreio] ${ticket.protocol} — ${ticket.durationMinutes} min — ${ticket.analystName}`);
      continue;
    }

    escalated++;
    const alertId = alertRow?.id ?? existing?.id;
    const already = existing?.admin_notified_at || alertRow?.admin_notified_at;
    if (!alertId || already) {
      console.log(`  [escalado já notificado] ${ticket.protocol} — ${ticket.durationMinutes} min`);
      continue;
    }

    const started = ticket.startedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const h = Math.floor(ticket.durationMinutes / 60);
    const m = ticket.durationMinutes % 60;
    const dur = h > 0 ? `${h}h ${m}min` : `${m} min`;
    const message = `Atendimento ${ticket.protocol} aberto há ${dur}. Cliente: ${ticket.clientName || "Não informado"}. Contato: ${ticket.clientContact || "Não informado"}. Analista: ${ticket.analystName}. Início: ${started}.`;

    const notifs = adminIds.map((recipient_id) => ({
      recipient_id,
      alert_id: alertId,
      protocol: ticket.protocol,
      analyst_name: ticket.analystName,
      client_name: ticket.clientName || null,
      client_contact: ticket.clientContact || null,
      duration_minutes: ticket.durationMinutes,
      started_at: ticket.startedAt.toISOString(),
      message,
    }));

    const notifRes = await supabaseRest("digisac_sla_notifications?on_conflict=recipient_id,alert_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(notifs),
    });

    if (!notifRes.ok) {
      console.error("Erro notificação:", notifRes.status, notifRes.json);
      continue;
    }

    await supabaseRest(`digisac_sla_alerts?id=eq.${alertId}`, {
      method: "PATCH",
      body: JSON.stringify({
        admin_notified_at: now.toISOString(),
        tier: "escalate_45",
        duration_minutes: ticket.durationMinutes,
        updated_at: now.toISOString(),
      }),
    });

    notified += adminIds.length;
    console.log(`  [NOTIFICADO] ${ticket.protocol} — ${ticket.durationMinutes} min — ${ticket.analystName}`);
  }

  return { tracked, escalated, notified, resolved: stale.length };
}

async function main() {
  const now = new Date();
  console.log(`\n=== Digisac SLA Sync ${DRY_RUN ? "(dry-run)" : ""} ===`);
  console.log(`Agora: ${now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  console.log(`Limiares: rastreio ${WARN_MIN} min | notificação ${ESCALATE_MIN} min\n`);

  const deptId = await pickSuporteDeptId();
  console.log(`Departamento Suporte: ${deptId || "(não encontrado)"}\n`);

  console.log("Buscando chamados abertos...");
  const tickets = deptId
    ? await fetchOpenTickets(deptId, now)
    : [];

  if (!deptId) {
    console.log("Tentando sem filtro de departamento...");
    const r = await digisacGet("/tickets", new URLSearchParams({ limit: "200", status: "open" }));
    for (const raw of flatten(r.data)) {
      const t = normalizeTicket(raw, now);
      if (t) tickets.push(t);
    }
  }

  console.log(`\nChamados abertos > ${WARN_MIN} min: ${tickets.length}`);
  if (!tickets.length) {
    console.log("Nenhum chamado elegível no momento.");
    return;
  }

  const contactIds = tickets
    .filter((t) => !t.clientName || !t.clientContact)
    .map((t) => t.contactId)
    .filter(Boolean);
  if (contactIds.length) {
    console.log(`Buscando ${contactIds.length} contato(s) na Digisac...`);
    const contacts = await fetchContactsByIds(contactIds);
    for (const ticket of tickets) {
      const client = contacts.get(ticket.contactId);
      if (!client) continue;
      ticket.clientName = client.name;
      ticket.clientContact = client.contact;
    }
  }

  for (const t of tickets.sort((a, b) => b.durationMinutes - a.durationMinutes)) {
    const flag = t.durationMinutes >= ESCALATE_MIN ? "→ NOTIFICA" : "→ rastreio";
    console.log(`  ${t.protocol} | ${t.durationMinutes} min | ${t.clientName || "?"} | ${t.clientContact || "?"} | ${t.analystName} ${flag}`);
  }

  if (DRY_RUN) {
    console.log("\n(dry-run — nada gravado no banco)");
    return;
  }

  console.log("\nGravando alertas e notificações...");
  const summary = await runSync(tickets, now);
  console.log("\nResumo:", summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
