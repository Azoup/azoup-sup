
CREATE TABLE public.kanban_card_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.kanban_card_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view comments" ON public.kanban_card_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert comments" ON public.kanban_card_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update own comments" ON public.kanban_card_comments FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own comments or admin" ON public.kanban_card_comments FOR DELETE TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_card_comments;
