import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildChecklistProgressMap, type ChecklistProgressMap } from '@/lib/checklistProgress';

const STALE_MS = 5 * 60 * 1000;

/** Um único fetch para todos os cards do board (evita N+1 no ChecklistBadge). */
export function useChecklistProgressMap(
  cardType: 'kanban' | 'dev',
  enabled: boolean,
): ChecklistProgressMap {
  const { data } = useQuery({
    queryKey: ['checklist-progress-map', cardType],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from('kanban_card_checklist')
        .select('card_id, done')
        .eq('card_type', cardType);
      if (error) throw error;
      return buildChecklistProgressMap(rows);
    },
    enabled,
    staleTime: STALE_MS,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  return data ?? {};
}
