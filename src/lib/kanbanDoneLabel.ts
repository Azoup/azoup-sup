export const KANBAN_DONE_LABEL_NAME = 'Concluídos';
export const KANBAN_DONE_LABEL_COLOR = '#10b981';

export type KanbanDoneLabelOption = { id: string; name: string; color?: string | null };

function normalizeKanbanLabelName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nome canônico "Concluídos" ou o singular legado "Concluído". */
export function isKanbanDoneLabelName(name: string | null | undefined): boolean {
  const normalized = normalizeKanbanLabelName(name || '');
  return normalized === 'concluidos' || normalized === 'concluido';
}

export function pickKanbanDoneLabel<T extends KanbanDoneLabelOption>(
  labels: T[] | undefined,
): T | undefined {
  if (!labels?.length) return undefined;
  const plural = labels.find((l) => normalizeKanbanLabelName(l.name || '') === 'concluidos');
  if (plural) return plural;
  return labels.find((l) => normalizeKanbanLabelName(l.name || '') === 'concluido');
}

export function needsKanbanDoneLabelRename(name: string | null | undefined): boolean {
  return normalizeKanbanLabelName(name || '') === 'concluido';
}
