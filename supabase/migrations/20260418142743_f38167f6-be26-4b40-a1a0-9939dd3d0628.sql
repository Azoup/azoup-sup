CREATE TABLE public.kanban_card_checklist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL,
  card_type text NOT NULL CHECK (card_type IN ('kanban', 'dev')),
  content text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_card ON public.kanban_card_checklist (card_id, card_type, position);

ALTER TABLE public.kanban_card_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view checklist" ON public.kanban_card_checklist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert checklist" ON public.kanban_card_checklist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update checklist" ON public.kanban_card_checklist FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete checklist" ON public.kanban_card_checklist FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_checklist_updated_at BEFORE UPDATE ON public.kanban_card_checklist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();