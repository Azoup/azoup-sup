import type { FetchDigisacFn } from "./digisacNpsTickets.ts";

const flattenList = (payload: unknown): Record<string, unknown>[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root)) {
    return root.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
  }
  for (const key of ["data", "items", "rows", "questions", "results"]) {
    const val = root[key];
    if (Array.isArray(val)) {
      return val.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
    }
  }
  return [];
};

/** IDs de perguntas do tipo NPS (para filtrar /api/v1/answers). */
export async function loadDigisacNpsQuestionIds(
  fetchDigisac: FetchDigisacFn,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const endpoints = ["/api/v1/questions", "/api/v1/evaluations", "/api/v1/surveys"];

  for (const endpoint of endpoints) {
    for (let page = 1; page <= 20; page++) {
      const params = new URLSearchParams({ limit: "200", page: String(page) });
      const r = await fetchDigisac(endpoint, params);
      if (!r.ok) break;
      const list = flattenList(r.data);
      if (!list.length) break;

      for (const row of list) {
        const id = String(row.id ?? "").trim();
        if (!id) continue;
        const type = String(row.type ?? row.tipo ?? row.evaluationType ?? row.kind ?? "").toLowerCase();
        const name = String(row.name ?? row.title ?? row.label ?? "").toLowerCase();
        if (type.includes("nps") || name.includes("nps")) ids.add(id);
      }

      if (list.length < 200) break;
    }
    if (ids.size > 0) break;
  }

  return ids;
}
