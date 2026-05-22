export type ChecklistProgress = { total: number; done: number };

export type ChecklistProgressMap = Record<string, ChecklistProgress>;

export function buildChecklistProgressMap(
  rows: { card_id: string; done: boolean | null }[] | null | undefined,
): ChecklistProgressMap {
  const map: ChecklistProgressMap = {};
  for (const row of rows ?? []) {
    const id = row.card_id;
    if (!id) continue;
    const cur = map[id] ?? { total: 0, done: 0 };
    cur.total += 1;
    if (row.done) cur.done += 1;
    map[id] = cur;
  }
  return map;
}
