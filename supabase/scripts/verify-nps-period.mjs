/**
 * Valida totais NPS vs Digisac (periodType=all).
 * Uso: DIGISAC_API_TOKEN=... DIGISAC_API_URL=https://.../api/v1 node supabase/scripts/verify-nps-period.mjs
 */
const token = process.env.DIGISAC_API_TOKEN;
const base = (process.env.DIGISAC_API_URL || "").replace(/\/$/, "");
const dept = "632f5680-0b5d-41a9-aea8-f7f91eee0606";

if (!token || !base) {
  console.error("Missing DIGISAC_API_TOKEN / DIGISAC_API_URL");
  process.exit(1);
}

const cases = [
  { name: "Jun 1-3/2026", from: "2026-06-01T03:00:00.000Z", to: "2026-06-04T02:59:59.999Z", expect: 49 },
  { name: "May/2026", from: "2026-05-01T03:00:00.000Z", to: "2026-06-01T02:59:59.999Z", expect: 124 },
];

let ok = true;
for (const c of cases) {
  const q = `from=${encodeURIComponent(c.from)}&to=${encodeURIComponent(c.to)}&departmentId=${dept}&type=nps&periodType=all`;
  const raw = await (await fetch(`${base}/answers/overview?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const a = raw?.data?.nps || [];
  const sum = (a[0] || 0) + (a[1] || 0) + (a[2] || 0);
  const pass = sum === c.expect;
  console.log(pass ? "OK" : "FAIL", c.name, "got", sum, "expected", c.expect, "vector", a);
  if (!pass) ok = false;
}

process.exit(ok ? 0 : 1);
