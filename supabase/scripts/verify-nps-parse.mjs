import { mapDigisacAnswersOverview } from "../functions/_shared/digisacAnswersOverview.ts";

const token = process.env.DIGISAC_API_TOKEN;
const base = (process.env.DIGISAC_API_URL || "").replace(/\/$/, "");
const dept = "632f5680-0b5d-41a9-aea8-f7f91eee0606";
const from = "2026-05-01T03:00:00.000Z";
const to = "2026-06-01T02:59:59.999Z";

const url = `${base}/answers/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&departmentId=${dept}&type=nps`;
const raw = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
const mapped = mapDigisacAnswersOverview(raw);

console.log("RAW data.nps", raw?.data?.nps);
console.log("MAPPED", JSON.stringify(mapped, null, 2));
process.exit(mapped.total > 0 ? 0 : 1);
