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

async function digisacGet(path) {
  const url = `${base}/api/v1${path}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => null);
  return { status: r.status, data };
}

const list = await digisacGet("/tickets?limit=1&status=open");
const ticket = (list.data?.data ?? list.data ?? [])[0];
if (!ticket) {
  console.log("no ticket");
  process.exit(0);
}

const contactId = ticket.contactId;
console.log("ticket", ticket.protocol, "contactId", contactId);
console.log("firstMessageId", ticket.firstMessageId, "lastMessageId", ticket.lastMessageId);

const tries = [
  `/contacts/${contactId}`,
  `/contacts/${contactId}?include=data`,
  `/contacts/${contactId}?include[]=data`,
  `/contacts/${contactId}?include=name,data,internalName,alias,service`,
  `/contacts?where[id]=${contactId}&limit=1`,
  `/contacts?filter[id]=${contactId}&limit=1`,
];

for (const path of tries) {
  const r = await digisacGet(path);
  console.log("\n==", path, "status", r.status);
  console.log(JSON.stringify(r.data, null, 2).slice(0, 2500));
}

if (ticket.firstMessageId) {
  const msg = await digisacGet(`/messages/${ticket.firstMessageId}`);
  console.log("\n== firstMessage status", msg.status);
  console.log(JSON.stringify(msg.data, null, 2).slice(0, 2500));
}
