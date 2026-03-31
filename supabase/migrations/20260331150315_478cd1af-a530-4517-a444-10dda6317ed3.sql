
-- Kanban labels table
CREATE TABLE public.kanban_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.kanban_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view labels" ON public.kanban_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert labels" ON public.kanban_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update labels" ON public.kanban_labels FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete labels" ON public.kanban_labels FOR DELETE TO authenticated USING (true);

-- Kanban cards table
CREATE TABLE public.kanban_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  position INTEGER NOT NULL DEFAULT 0,
  analyst_id UUID REFERENCES public.analysts(id) ON DELETE SET NULL,
  image_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view cards" ON public.kanban_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert cards" ON public.kanban_cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update cards" ON public.kanban_cards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete cards" ON public.kanban_cards FOR DELETE TO authenticated USING (true);

-- Junction table for card labels
CREATE TABLE public.kanban_card_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.kanban_labels(id) ON DELETE CASCADE,
  UNIQUE(card_id, label_id)
);
ALTER TABLE public.kanban_card_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view card_labels" ON public.kanban_card_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert card_labels" ON public.kanban_card_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete card_labels" ON public.kanban_card_labels FOR DELETE TO authenticated USING (true);

-- User permissions table for granular access control
CREATE TABLE public.user_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  permission_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, permission_key)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage permissions" ON public.user_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own permissions" ON public.user_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Storage bucket for kanban card images
INSERT INTO storage.buckets (id, name, public) VALUES ('kanban-images', 'kanban-images', true);
CREATE POLICY "Authenticated users can upload kanban images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'kanban-images');
CREATE POLICY "Anyone can view kanban images" ON storage.objects FOR SELECT USING (bucket_id = 'kanban-images');
CREATE POLICY "Authenticated users can delete kanban images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'kanban-images');

-- Enable realtime for kanban_cards
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_cards;
