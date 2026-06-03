const token = process.env.DIGISAC_API_TOKEN;
const base = (process.env.DIGISAC_API_URL || "").replace(/\/$/, "");
const dept = process.env.DIGISAC_NPS_DEPT || "632f5680-0b5d-41a9-aea8-f7f91eee0606";
const from = "2026-05-01T03:00:00.000Z";
const to = "2026-06-01T02:59:59.999Z";

if (!token || !base) {
  console.error("Set DIGISAC_API_TOKEN and DIGISAC_API_URL");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}` };

async function get(path) {
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetch(url, { headers });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 500);
  }
  return { status: r.status, json };
}

const overview = await get(
  `/answers/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&departmentId=${dept}&type=nps`,
);
console.log("OVERVIEW", overview.status, JSON.stringify(overview.json, null, 2).slice(0, 3000));

const answers = await get("/answers?limit=3&page=1");
console.log("\nANSWERS sample", answers.status);
const rows = answers.json?.data ?? answers.json;
if (Array.isArray(rows)) {
  for (const row of rows.slice(0, 3)) {
    console.log(JSON.stringify(row, null, 2));
  }
} else {
  console.log(JSON.stringify(answers.json, null, 2).slice(0, 1500));
}
