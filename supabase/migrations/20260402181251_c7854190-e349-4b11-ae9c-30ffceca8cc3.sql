
CREATE TABLE public.kanban_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT 'border-t-blue-500',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view columns" ON public.kanban_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert columns" ON public.kanban_columns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update columns" ON public.kanban_columns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete columns" ON public.kanban_columns FOR DELETE TO authenticated USING (true);

INSERT INTO public.kanban_columns (title, slug, position, color) VALUES
  ('Pendências', 'pending', 0, 'border-t-amber-500'),
  ('Agendamentos', 'scheduled', 1, 'border-t-blue-500'),
  ('Sem Resposta', 'no_response', 2, 'border-t-rose-500'),
  ('Concluídos', 'done', 3, 'border-t-emerald-500');
