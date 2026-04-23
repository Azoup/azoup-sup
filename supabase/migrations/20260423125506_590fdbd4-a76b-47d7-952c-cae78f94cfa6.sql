-- Create storage bucket for dev kanban attachments (private, accessed via signed URLs or public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dev-kanban-files',
  'dev-kanban-files',
  true,
  104857600, -- 100 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm',
    'application/pdf',
    'text/plain','text/csv','text/xml','application/xml',
    'application/json',
    'application/zip','application/x-zip-compressed',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies for dev-kanban-files bucket
CREATE POLICY "Auth view dev kanban files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'dev-kanban-files');

CREATE POLICY "Public can view dev kanban files"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'dev-kanban-files');

CREATE POLICY "Auth upload dev kanban files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'dev-kanban-files');

CREATE POLICY "Auth update dev kanban files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'dev-kanban-files');

CREATE POLICY "Auth delete dev kanban files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'dev-kanban-files');

-- Table to store file attachments metadata for dev kanban cards
CREATE TABLE public.dev_kanban_card_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.dev_kanban_cards(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID,
  uploaded_by_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_dev_kanban_card_files_card_id ON public.dev_kanban_card_files(card_id);

ALTER TABLE public.dev_kanban_card_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view dev card files"
ON public.dev_kanban_card_files FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Auth insert dev card files"
ON public.dev_kanban_card_files FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Auth delete dev card files"
ON public.dev_kanban_card_files FOR DELETE
TO authenticated
USING (true);