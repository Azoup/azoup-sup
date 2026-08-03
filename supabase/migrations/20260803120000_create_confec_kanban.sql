-- Kanban Confec: board paralelo ao Kanban DEV (tickets do sistema novo).

-- Columns
CREATE TABLE public.confec_kanban_columns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  slug text NOT NULL,
  color text NOT NULL DEFAULT 'border-t-blue-500',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.confec_kanban_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view confec columns" ON public.confec_kanban_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert confec columns" ON public.confec_kanban_columns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update confec columns" ON public.confec_kanban_columns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete confec columns" ON public.confec_kanban_columns FOR DELETE TO authenticated USING (true);

INSERT INTO public.confec_kanban_columns (title, slug, color, position) VALUES
  ('Backlog', 'backlog', 'border-t-gray-500', 0),
  ('Analisados', 'analisados', 'border-t-blue-500', 1),
  ('Em andamento', 'em-andamento', 'border-t-amber-500', 2),
  ('Finalizados', 'finalizados', 'border-t-emerald-500', 3);

-- Cards
CREATE SEQUENCE public.confec_kanban_ticket_number_seq;

CREATE TABLE public.confec_kanban_cards (
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  dev_notes text,
  ticket_number integer NOT NULL DEFAULT nextval('public.confec_kanban_ticket_number_seq')
);
ALTER SEQUENCE public.confec_kanban_ticket_number_seq OWNED BY public.confec_kanban_cards.ticket_number;
CREATE UNIQUE INDEX confec_kanban_cards_ticket_number_unique
  ON public.confec_kanban_cards (ticket_number);
ALTER TABLE public.confec_kanban_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view confec cards" ON public.confec_kanban_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert confec cards" ON public.confec_kanban_cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update confec cards" ON public.confec_kanban_cards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete confec cards" ON public.confec_kanban_cards FOR DELETE TO authenticated USING (true);
CREATE TRIGGER update_confec_cards_updated_at
  BEFORE UPDATE ON public.confec_kanban_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.confec_kanban_cards.dev_notes IS
  'Observações e correções técnicas registradas no card.';
COMMENT ON COLUMN public.confec_kanban_cards.ticket_number IS
  'Número sequencial do ticket no Kanban Confec (ex.: #0001).';

-- Labels
CREATE TABLE public.confec_kanban_labels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.confec_kanban_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view confec labels" ON public.confec_kanban_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert confec labels" ON public.confec_kanban_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update confec labels" ON public.confec_kanban_labels FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete confec labels" ON public.confec_kanban_labels FOR DELETE TO authenticated USING (true);

CREATE TABLE public.confec_kanban_card_labels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES public.confec_kanban_cards(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.confec_kanban_labels(id) ON DELETE CASCADE
);
ALTER TABLE public.confec_kanban_card_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view confec card labels" ON public.confec_kanban_card_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert confec card labels" ON public.confec_kanban_card_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth delete confec card labels" ON public.confec_kanban_card_labels FOR DELETE TO authenticated USING (true);

-- Images
CREATE TABLE public.confec_kanban_card_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES public.confec_kanban_cards(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.confec_kanban_card_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view confec card images" ON public.confec_kanban_card_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert confec card images" ON public.confec_kanban_card_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth delete confec card images" ON public.confec_kanban_card_images FOR DELETE TO authenticated USING (true);

-- Comments
CREATE TABLE public.confec_kanban_card_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES public.confec_kanban_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.confec_kanban_card_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view confec comments" ON public.confec_kanban_card_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert confec comments" ON public.confec_kanban_card_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update own confec comments" ON public.confec_kanban_card_comments FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users or admin can delete confec comments" ON public.confec_kanban_card_comments FOR DELETE TO authenticated USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_confec_comments_updated_at
  BEFORE UPDATE ON public.confec_kanban_card_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Files metadata
CREATE TABLE public.confec_kanban_card_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.confec_kanban_cards(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID,
  uploaded_by_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_confec_kanban_card_files_card_id ON public.confec_kanban_card_files(card_id);
ALTER TABLE public.confec_kanban_card_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view confec card files" ON public.confec_kanban_card_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert confec card files" ON public.confec_kanban_card_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth delete confec card files" ON public.confec_kanban_card_files FOR DELETE TO authenticated USING (true);

-- Storage bucket for attachments (5 GB, same MIME set as DEV)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'confec-kanban-files',
  'confec-kanban-files',
  true,
  5368709120,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm','video/x-msvideo','video/x-matroska',
    'video/mpeg','video/x-ms-wmv',
    'application/pdf',
    'text/plain','text/csv','text/xml','application/xml',
    'application/json',
    'application/zip','application/x-zip-compressed',
    'application/x-7z-compressed','application/gzip','application/x-tar',
    'application/x-rar-compressed','application/vnd.rar','application/x-compressed','application/rar',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Auth view confec kanban files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'confec-kanban-files');

CREATE POLICY "Public can view confec kanban files"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'confec-kanban-files');

CREATE POLICY "Auth upload confec kanban files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'confec-kanban-files');

CREATE POLICY "Auth update confec kanban files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'confec-kanban-files');

CREATE POLICY "Auth delete confec kanban files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'confec-kanban-files');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.confec_kanban_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.confec_kanban_card_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.confec_kanban_card_files;
ALTER PUBLICATION supabase_realtime ADD TABLE public.confec_kanban_card_images;
ALTER PUBLICATION supabase_realtime ADD TABLE public.confec_kanban_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.confec_kanban_labels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.confec_kanban_card_labels;
