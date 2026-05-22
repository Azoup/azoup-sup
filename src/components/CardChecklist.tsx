import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, Pencil, X, Check, ListChecks, Sparkles } from "lucide-react";
import { toast } from "sonner";

type CardType = "kanban" | "dev";

interface ChecklistItem {
  id: string;
  card_id: string;
  card_type: CardType;
  content: string;
  done: boolean;
  position: number;
}

interface Props {
  cardId: string;
  cardType: CardType;
  description?: string | null;
}

const NUMBERED_REGEX = /^\s*(\d+)[\.\)\-]\s+(.+)$/;

export function CardChecklist({ cardId, cardType, description }: Props) {
  const qc = useQueryClient();
  const queryKey = ["card-checklist", cardType, cardId];
  const progressMapKey = ["checklist-progress-map", cardType] as const;

  const refreshProgressMap = () => {
    void qc.invalidateQueries({ queryKey: progressMapKey });
  };
  const [newItem, setNewItem] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const { data: items = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("kanban_card_checklist")
        .select("*")
        .eq("card_id", cardId)
        .eq("card_type", cardType)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as ChecklistItem[];
    },
  });

  const insertItems = useMutation({
    mutationFn: async (contents: string[]) => {
      const startPos = items.length;
      const rows = contents.map((content, i) => ({
        card_id: cardId,
        card_type: cardType,
        content,
        done: false,
        position: startPos + i,
      }));
      const { error } = await (supabase as any).from("kanban_card_checklist").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      refreshProgressMap();
    },
  });

  const toggleDone = useMutation({
    mutationFn: async (item: ChecklistItem) => {
      const { error } = await (supabase as any)
        .from("kanban_card_checklist")
        .update({ done: !item.done })
        .eq("id", item.id);
      if (error) throw error;
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ChecklistItem[]>(queryKey);
      qc.setQueryData<ChecklistItem[]>(queryKey, (old) =>
        (old || []).map((i) => (i.id === item.id ? { ...i, done: !i.done } : i))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(queryKey, ctx.prev),
    onSettled: refreshProgressMap,
  });

  const updateText = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await (supabase as any)
        .from("kanban_card_checklist")
        .update({ content })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      void qc.invalidateQueries({ queryKey });
    },
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("kanban_card_checklist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      refreshProgressMap();
    },
  });

  // Auto-detect numbered list from description (only suggests if checklist is empty)
  const detected: string[] = (description || "")
    .split("\n")
    .map((l) => l.match(NUMBERED_REGEX))
    .filter(Boolean)
    .map((m: any) => m[2].trim());

  const canImport = items.length === 0 && detected.length > 0;

  const handleImport = () => {
    insertItems.mutate(detected, {
      onSuccess: () => toast.success(`${detected.length} itens importados`),
    });
  };

  const handleAdd = () => {
    const text = newItem.trim();
    if (!text) return;
    insertItems.mutate([text], {
      onSuccess: () => setNewItem(""),
    });
  };

  // Auto-import once on first open if checklist is empty and description has numbered list
  useEffect(() => {
    if (canImport && !insertItems.isPending) {
      // do not auto-import; show button. (Avoids unwanted side effects)
    }
  }, [canImport]);

  const total = items.length;
  const doneCount = items.filter((i) => i.done).length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5" /> Checklist {total > 0 && <span>({doneCount}/{total})</span>}
        </p>
        {canImport && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleImport} disabled={insertItems.isPending}>
            <Sparkles className="h-3 w-3 mr-1" /> Importar {detected.length} itens da descrição
          </Button>
        )}
      </div>

      {total > 0 && <Progress value={pct} className="h-1.5" />}

      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <Checkbox
              checked={item.done}
              onCheckedChange={() => toggleDone.mutate(item)}
              className="shrink-0"
            />
            {editingId === item.id ? (
              <>
                <Input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editText.trim()) updateText.mutate({ id: item.id, content: editText.trim() });
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="h-7 text-sm flex-1"
                />
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updateText.mutate({ id: item.id, content: editText.trim() })} disabled={!editText.trim()}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <span className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground" : ""}`}>
                  {item.content}
                </span>
                <button
                  onClick={() => { setEditingId(item.id); setEditText(item.content); }}
                  className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => removeItem.mutate(item.id)}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Adicionar item..."
          className="h-8 text-sm flex-1"
        />
        <Button size="sm" className="h-8" onClick={handleAdd} disabled={!newItem.trim() || insertItems.isPending}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// Lightweight hook to show progress on closed cards
export function useChecklistProgress(cardId: string, cardType: CardType) {
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
  });
  return data || { total: 0, done: 0 };
}
