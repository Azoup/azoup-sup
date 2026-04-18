import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ListChecks } from "lucide-react";

export function ChecklistBadge({ cardId, cardType }: { cardId: string; cardType: "kanban" | "dev" }) {
  const { data } = useQuery({
    queryKey: ["card-checklist-progress", cardType, cardId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("kanban_card_checklist")
        .select("done")
        .eq("card_id", cardId)
        .eq("card_type", cardType);
      if (error) throw error;
      const total = data?.length || 0;
      const done = (data || []).filter((d: any) => d.done).length;
      return { total, done };
    },
    staleTime: 30_000,
  });
  if (!data || data.total === 0) return null;
  const complete = data.done === data.total;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] ${complete ? "text-emerald-600" : "text-muted-foreground"}`}>
      <ListChecks className="h-3 w-3" /> {data.done}/{data.total}
    </span>
  );
}
