import { supabase } from '@/integrations/supabase/client';

export type CardLabelTable = 'kanban_card_labels' | 'dev_kanban_card_labels';

export function uniqueLabelIds(labelIds: string[]): string[] {
  return [...new Set(labelIds.filter(Boolean))];
}

/** Remove vínculos duplicados (mesmo card_id + label_id). */
export function dedupeCardLabelRows<T extends { card_id: string; label_id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.card_id}:${row.label_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Etiquetas únicas para exibição no card (a partir das linhas da junction). */
export function labelsForCardFromRows(
  rows: { label_id: string; kanban_labels?: unknown; dev_kanban_labels?: unknown }[],
): { id: string; name?: string; color?: string }[] {
  const byId = new Map<string, { id: string; name?: string; color?: string }>();
  for (const row of rows) {
    const nested = (row.kanban_labels ?? row.dev_kanban_labels) as
      | { id?: string; name?: string; color?: string }
      | null
      | undefined;
    const id = nested?.id ?? row.label_id;
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: nested?.name,
      color: nested?.color,
    });
  }
  return [...byId.values()];
}

export async function syncCardLabels(
  table: CardLabelTable,
  cardId: string,
  labelIds: string[],
): Promise<void> {
  const unique = uniqueLabelIds(labelIds);

  const { error: delErr } = await supabase.from(table).delete().eq('card_id', cardId);
  if (delErr) throw delErr;

  if (unique.length === 0) return;

  const { error: insErr } = await supabase.from(table).insert(
    unique.map((label_id) => ({ card_id: cardId, label_id })),
  );
  if (insErr) throw insErr;
}

/** Limpa duplicatas no banco (dev não tem UNIQUE — kanban pode ter sobrado). */
export async function removeDuplicateCardLabelsInDb(table: CardLabelTable): Promise<void> {
  const { data, error } = await supabase.from(table).select('id, card_id, label_id');
  if (error || !data?.length) return;

  const seen = new Set<string>();
  const toDelete: string[] = [];
  for (const row of data) {
    const key = `${row.card_id}:${row.label_id}`;
    if (seen.has(key)) toDelete.push(row.id);
    else seen.add(key);
  }
  if (toDelete.length === 0) return;

  const chunk = 50;
  for (let i = 0; i < toDelete.length; i += chunk) {
    const slice = toDelete.slice(i, i + chunk);
    await supabase.from(table).delete().in('id', slice);
  }
}
