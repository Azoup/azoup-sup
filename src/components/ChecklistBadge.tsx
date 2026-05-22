import { ListChecks } from 'lucide-react';
import type { ChecklistProgress } from '@/lib/checklistProgress';

export function ChecklistBadge({
  cardId,
  progressMap,
}: {
  cardId: string;
  progressMap: Record<string, ChecklistProgress>;
}) {
  const data = progressMap[cardId];
  if (!data || data.total === 0) return null;
  const complete = data.done === data.total;
  return (
    <span
      className={`flex items-center gap-0.5 text-[10px] ${complete ? 'text-emerald-600' : 'text-muted-foreground'}`}
    >
      <ListChecks className="h-3 w-3" /> {data.done}/{data.total}
    </span>
  );
}
