import { uniqueLabelIds } from '@/lib/kanbanCardLabels';

type CardWithLabels = {
  title?: string;
  description?: string | null;
  analyst_id?: string | null;
  developer_id?: string | null;
  status?: string;
  labels?: { id?: string }[];
};

export function labelIdsFromCard(card: CardWithLabels): string[] {
  return uniqueLabelIds((card.labels || []).map((l) => l?.id).filter(Boolean) as string[]);
}

export function isSupportKanbanCardFormDirty(
  editingCard: CardWithLabels | null,
  form: {
    title: string;
    description: string;
    analystId: string;
    selectedLabels: string[];
    moveToColumnSlug: string;
  },
): boolean {
  if (!editingCard) return false;
  const origLabels = labelIdsFromCard(editingCard);
  const labelsChanged =
    origLabels.length !== form.selectedLabels.length ||
    form.selectedLabels.some((id) => !origLabels.includes(id));
  const statusChanged =
    !!form.moveToColumnSlug && form.moveToColumnSlug !== (editingCard.status || '');
  return (
    (editingCard.title || '') !== form.title ||
    (editingCard.description || '') !== form.description ||
    (editingCard.analyst_id || '') !== form.analystId ||
    labelsChanged ||
    statusChanged
  );
}

export function isDevKanbanCardFormDirty(
  editingCard: CardWithLabels | null,
  form: {
    title: string;
    description: string;
    devNotes: string;
    initialDevNotes: string;
    analystId: string;
    developerId: string;
    selectedLabels: string[];
    moveToColumnSlug: string;
  },
): boolean {
  if (!editingCard) return false;
  const origLabels = labelIdsFromCard(editingCard);
  const labelsChanged =
    origLabels.length !== form.selectedLabels.length ||
    form.selectedLabels.some((id) => !origLabels.includes(id));
  const statusChanged =
    !!form.moveToColumnSlug && form.moveToColumnSlug !== (editingCard.status || '');
  return (
    (editingCard.title || '') !== form.title ||
    (editingCard.description || '') !== form.description ||
    form.initialDevNotes !== form.devNotes.trim() ||
    (editingCard.analyst_id || '') !== form.analystId ||
    (editingCard.developer_id || '') !== form.developerId ||
    labelsChanged ||
    statusChanged
  );
}
