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

const token = process.env.DIGISAC_API_TOKEN || process.env.VITE_DIGISAC_API_TOKEN;
let base = (process.env.DIGISAC_API_URL || process.env.VITE_DIGISAC_API_URL || "").replace(/\/$/, "");
if (base.endsWith("/api/v1")) base = base.replace(/\/api\/v1$/, "");

function flatten(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === "object");
  for (const key of ["data", "items", "rows", "tickets", "results"]) {
    const val = payload[key];
    if (Array.isArray(val)) return val.filter((x) => x && typeof x === "object");
  }
  return [];
}

async function digisacGet(endpoint, params) {
  const ep = endpoint.startsWith("/api/v1") ? endpoint : `/api/v1${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const url = `${base}${ep}${params?.toString() ? `?${params}` : ""}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  return { ok: r.ok, status: r.status, data, url };
}

const variants = [
  { limit: "5", "where[status]": "open" },
  { limit: "5", status: "open" },
  { limit: "5", periodType: "open" },
  { limit: "5", "where[isOpen]": "true" },
  { limit: "5" },
];

let tickets = [];
for (const combo of variants) {
  const list = await digisacGet("/tickets", new URLSearchParams(combo));
  const rows = flatten(list.data);
  console.log("VARIANT", JSON.stringify(combo), "status", list.status, "rows", rows.length);
  if (rows.length) {
    tickets = rows;
    break;
  }
}

if (!tickets.length) {
  console.log("Nenhum ticket encontrado");
  process.exit(0);
}

for (const ticket of tickets.slice(0, 2)) {
  const keys = Object.keys(ticket).sort();
  console.log("\n--- ticket", ticket.id, ticket.protocol ?? ticket.number);
  console.log("keys:", keys.join(", "));
  for (const k of keys.filter((x) => /contact|client|person|number|name|phone|data|service/i.test(x))) {
    console.log(`  ${k}:`, JSON.stringify(ticket[k]).slice(0, 400));
  }

  const detail = await digisacGet(`/tickets/${ticket.id}`);
  const detailRaw = detail.data && typeof detail.data === "object"
    ? (detail.data.data ?? detail.data)
    : null;
  if (detailRaw) {
    console.log("DETAIL keys:", Object.keys(detailRaw).sort().join(", "));
    for (const k of Object.keys(detailRaw).filter((x) => /contact|client|person|number|name|phone|data|service/i.test(x))) {
      console.log(`  detail.${k}:`, JSON.stringify(detailRaw[k]).slice(0, 400));
    }
  }

  const contactId = String(
    ticket.contactId ?? ticket.contact_id ?? detailRaw?.contactId ?? detailRaw?.contact_id ?? "",
  ).trim();
  if (contactId) {
    for (const ep of [`/contacts/${contactId}`, `/contacts/${contactId}?include[]=data`]) {
      const contact = await digisacGet(ep);
      const cRaw = contact.data && typeof contact.data === "object"
        ? (contact.data.data ?? contact.data)
        : null;
      console.log("CONTACT", ep, "status", contact.status);
      if (cRaw) {
        console.log("contact keys:", Object.keys(cRaw).sort().join(", "));
        console.log("contact:", JSON.stringify(cRaw, null, 2).slice(0, 2000));
      }
    }
  } else {
    console.log("NO contactId on ticket");
  }

  for (const msgKey of ["firstMessage", "lastMessage"]) {
    const msg = ticket[msgKey] ?? detailRaw?.[msgKey];
    if (msg) {
      console.log(`${msgKey} keys:`, typeof msg === "object" ? Object.keys(msg).sort().join(", ") : msg);
      if (typeof msg === "object") {
        console.log(`${msgKey}:`, JSON.stringify(msg, null, 2).slice(0, 1200));
      }
    }
  }
}
