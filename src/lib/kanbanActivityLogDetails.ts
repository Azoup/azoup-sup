/** Texto legível para o log de atividades (campos alterados, antes → depois). */

const EMPTY = '(vazio)';

export function truncateForActivityLog(text: string, max = 100): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return EMPTY;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function formatActivityTextChange(
  fieldLabel: string,
  from: string | null | undefined,
  to: string | null | undefined,
): string | null {
  const a = (from ?? '').trim();
  const b = (to ?? '').trim();
  if (a === b) return null;
  return `• ${fieldLabel}: "${truncateForActivityLog(a || EMPTY)}" → "${truncateForActivityLog(b || EMPTY)}"`;
}

export function formatActivityValueChange(
  fieldLabel: string,
  from: string | null | undefined,
  to: string | null | undefined,
): string | null {
  const a = (from ?? '').trim();
  const b = (to ?? '').trim();
  if (a === b) return null;
  return `• ${fieldLabel}: ${a || EMPTY} → ${b || EMPTY}`;
}

export function formatActivityListChange(
  fieldLabel: string,
  from: string[],
  to: string[],
): string | null {
  const a = from.join(', ') || EMPTY;
  const b = to.join(', ') || EMPTY;
  if (a === b) return null;
  return `• ${fieldLabel}: ${a} → ${b}`;
}

export function personNameById(
  people: { id: string; name?: string | null }[],
  id: string | null | undefined,
): string {
  if (!id) return EMPTY;
  return people.find((p) => p.id === id)?.name?.trim() || EMPTY;
}

export function columnTitleBySlug(
  columns: { slug: string; title?: string | null }[],
  slug: string | null | undefined,
): string {
  if (!slug) return EMPTY;
  return columns.find((c) => c.slug === slug)?.title?.trim() || slug;
}

export function labelNamesByIds(
  labels: { id: string; name?: string | null }[],
  ids: string[],
): string[] {
  return ids
    .map((id) => labels.find((l) => l.id === id)?.name?.trim())
    .filter((name): name is string => !!name);
}

export function joinActivityDetails(
  ticketRef: string,
  changes: Array<string | null | undefined>,
): string {
  const lines = changes.filter((line): line is string => !!line);
  if (lines.length === 0) {
    return `Ticket: ${ticketRef}\n• Sem alterações nos campos principais`;
  }
  return [`Ticket: ${ticketRef}`, ...lines].join('\n');
}

export type DevKanbanEditLogInput = {
  ticketRef: string;
  titleFrom: string;
  titleTo: string;
  descriptionFrom: string | null | undefined;
  descriptionTo: string | null | undefined;
  devNotesFrom: string;
  devNotesTo: string;
  analystFromId: string | null | undefined;
  analystToId: string | null | undefined;
  developerFromId: string | null | undefined;
  developerToId: string | null | undefined;
  statusFrom: string;
  statusTo: string;
  labelNamesFrom: string[];
  labelNamesTo: string[];
  analysts: { id: string; name?: string | null }[];
  developers: { id: string; name?: string | null }[];
  columns: { slug: string; title?: string | null }[];
};

export function buildDevKanbanEditActivityDetails(input: DevKanbanEditLogInput): string {
  const statusChanged = input.statusFrom !== input.statusTo;
  return joinActivityDetails(input.ticketRef, [
    formatActivityTextChange('Título', input.titleFrom, input.titleTo),
    formatActivityTextChange('Descrição', input.descriptionFrom, input.descriptionTo),
    formatActivityTextChange('Observações DEV', input.devNotesFrom, input.devNotesTo),
    formatActivityValueChange(
      'Analista',
      personNameById(input.analysts, input.analystFromId),
      personNameById(input.analysts, input.analystToId),
    ),
    formatActivityValueChange(
      'Desenvolvedor',
      personNameById(input.developers, input.developerFromId),
      personNameById(input.developers, input.developerToId),
    ),
    statusChanged
      ? formatActivityValueChange(
          'Lista',
          columnTitleBySlug(input.columns, input.statusFrom),
          columnTitleBySlug(input.columns, input.statusTo),
        )
      : null,
    formatActivityListChange('Etiquetas', input.labelNamesFrom, input.labelNamesTo),
  ]);
}

export type DevKanbanCreateLogInput = {
  ticketRef: string;
  columnSlug: string;
  description?: string | null;
  devNotes?: string;
  analystId?: string | null;
  developerId?: string | null;
  labelNames: string[];
  analysts: { id: string; name?: string | null }[];
  developers: { id: string; name?: string | null }[];
  columns: { slug: string; title?: string | null }[];
};

export function buildDevKanbanCreateActivityDetails(input: DevKanbanCreateLogInput): string {
  const lines = [
    `• Lista: ${columnTitleBySlug(input.columns, input.columnSlug)}`,
  ];
  if (input.description?.trim()) {
    lines.push(`• Descrição: "${truncateForActivityLog(input.description)}"`);
  }
  if (input.devNotes?.trim()) {
    lines.push(`• Observações DEV: "${truncateForActivityLog(input.devNotes)}"`);
  }
  if (input.analystId) {
    lines.push(`• Analista: ${personNameById(input.analysts, input.analystId)}`);
  }
  if (input.developerId) {
    lines.push(`• Desenvolvedor: ${personNameById(input.developers, input.developerId)}`);
  }
  if (input.labelNames.length > 0) {
    lines.push(`• Etiquetas: ${input.labelNames.join(', ')}`);
  }
  return [`Ticket: ${input.ticketRef}`, ...lines].join('\n');
}

export type SupportKanbanEditLogInput = {
  ticketRef: string;
  titleFrom: string;
  titleTo: string;
  descriptionFrom: string | null | undefined;
  descriptionTo: string | null | undefined;
  analystFromId: string | null | undefined;
  analystToId: string | null | undefined;
  statusFrom: string;
  statusTo: string;
  labelNamesFrom: string[];
  labelNamesTo: string[];
  analysts: { id: string; name?: string | null }[];
  columns: { slug: string; title?: string | null }[];
};

export function buildSupportKanbanEditActivityDetails(input: SupportKanbanEditLogInput): string {
  const statusChanged = input.statusFrom !== input.statusTo;
  return joinActivityDetails(input.ticketRef, [
    formatActivityTextChange('Título', input.titleFrom, input.titleTo),
    formatActivityTextChange('Descrição', input.descriptionFrom, input.descriptionTo),
    formatActivityValueChange(
      'Analista',
      personNameById(input.analysts, input.analystFromId),
      personNameById(input.analysts, input.analystToId),
    ),
    statusChanged
      ? formatActivityValueChange(
          'Lista',
          columnTitleBySlug(input.columns, input.statusFrom),
          columnTitleBySlug(input.columns, input.statusTo),
        )
      : null,
    formatActivityListChange('Etiquetas', input.labelNamesFrom, input.labelNamesTo),
  ]);
}

export function buildSupportKanbanCreateActivityDetails(input: {
  ticketRef: string;
  columnSlug: string;
  description?: string | null;
  analystId?: string | null;
  labelNames: string[];
  analysts: { id: string; name?: string | null }[];
  columns: { slug: string; title?: string | null }[];
}): string {
  const lines = [`• Lista: ${columnTitleBySlug(input.columns, input.columnSlug)}`];
  if (input.description?.trim()) {
    lines.push(`• Descrição: "${truncateForActivityLog(input.description)}"`);
  }
  if (input.analystId) {
    lines.push(`• Analista: ${personNameById(input.analysts, input.analystId)}`);
  }
  if (input.labelNames.length > 0) {
    lines.push(`• Etiquetas: ${input.labelNames.join(', ')}`);
  }
  return [`Ticket: ${input.ticketRef}`, ...lines].join('\n');
}

export function appendAttachmentActivityLines(
  details: string,
  imageCount: number,
  fileCount: number,
): string {
  const extras: string[] = [];
  if (imageCount > 0) {
    extras.push(`• Anexou ${imageCount} imagem(ns)`);
  }
  if (fileCount > 0) {
    extras.push(`• Anexou ${fileCount} arquivo(s)`);
  }
  if (extras.length === 0) return details;
  return `${details}\n${extras.join('\n')}`;
}
