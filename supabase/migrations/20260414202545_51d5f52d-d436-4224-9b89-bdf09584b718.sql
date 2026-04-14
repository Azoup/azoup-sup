
-- Developers table
CREATE TABLE public.developers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  photo_url text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view developers" ON public.developers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert developers" ON public.developers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update developers" ON public.developers FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_developers_updated_at BEFORE UPDATE ON public.developers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Dev Kanban Columns
CREATE TABLE public.dev_kanban_columns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  slug text NOT NULL,
  color text NOT NULL DEFAULT 'border-t-blue-500',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dev_kanban_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view dev columns" ON public.dev_kanban_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert dev columns" ON public.dev_kanban_columns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update dev columns" ON public.dev_kanban_columns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete dev columns" ON public.dev_kanban_columns FOR DELETE TO authenticated USING (true);

-- Default columns
INSERT INTO public.dev_kanban_columns (title, slug, color, position) VALUES
  ('Backlog', 'backlog', 'border-t-gray-500', 0),
  ('Analisados', 'analisados', 'border-t-blue-500', 1),
  ('Em andamento', 'em-andamento', 'border-t-amber-500', 2),
  ('Finalizados', 'finalizados', 'border-t-emerald-500', 3);

-- Dev Kanban Cards
CREATE TABLE public.dev_kanban_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'backlog',
  analyst_id uuid REFERENCES public.analysts(id),
  developer_id uuid REFERENCES public.developers(id),
  image_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dev_kanban_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view dev cards" ON public.dev_kanban_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert dev cards" ON public.dev_kanban_cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update dev cards" ON public.dev_kanban_cards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete dev cards" ON public.dev_kanban_cards FOR DELETE TO authenticated USING (true);
CREATE TRIGGER update_dev_cards_updated_at BEFORE UPDATE ON public.dev_kanban_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Dev Kanban Labels
CREATE TABLE public.dev_kanban_labels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dev_kanban_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view dev labels" ON public.dev_kanban_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert dev labels" ON public.dev_kanban_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update dev labels" ON public.dev_kanban_labels FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete dev labels" ON public.dev_kanban_labels FOR DELETE TO authenticated USING (true);

-- Dev Card Labels junction
CREATE TABLE public.dev_kanban_card_labels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES public.dev_kanban_cards(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.dev_kanban_labels(id) ON DELETE CASCADE
);
ALTER TABLE public.dev_kanban_card_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view dev card labels" ON public.dev_kanban_card_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert dev card labels" ON public.dev_kanban_card_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth delete dev card labels" ON public.dev_kanban_card_labels FOR DELETE TO authenticated USING (true);

-- Dev Card Images
CREATE TABLE public.dev_kanban_card_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES public.dev_kanban_cards(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dev_kanban_card_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view dev card images" ON public.dev_kanban_card_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert dev card images" ON public.dev_kanban_card_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth delete dev card images" ON public.dev_kanban_card_images FOR DELETE TO authenticated USING (true);

-- Dev Card Comments
CREATE TABLE public.dev_kanban_card_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES public.dev_kanban_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dev_kanban_card_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view dev comments" ON public.dev_kanban_card_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert dev comments" ON public.dev_kanban_card_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update own dev comments" ON public.dev_kanban_card_comments FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users or admin can delete dev comments" ON public.dev_kanban_card_comments FOR DELETE TO authenticated USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_dev_comments_updated_at BEFORE UPDATE ON public.dev_kanban_card_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for developer photos
INSERT INTO storage.buckets (id, name, public) VALUES ('developer-photos', 'developer-photos', true);
CREATE POLICY "Public read developer photos" ON storage.objects FOR SELECT USING (bucket_id = 'developer-photos');
CREATE POLICY "Auth upload developer photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'developer-photos');
CREATE POLICY "Auth update developer photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'developer-photos');
CREATE POLICY "Auth delete developer photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'developer-photos');

-- Enable realtime for dev kanban cards
ALTER PUBLICATION supabase_realtime ADD TABLE public.dev_kanban_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dev_kanban_card_comments;
