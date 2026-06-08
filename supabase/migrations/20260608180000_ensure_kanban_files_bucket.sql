-- Garante buckets de anexos do Kanban (suporte e dev) com políticas idempotentes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kanban-files',
  'kanban-files',
  true,
  104857600,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm',
    'application/pdf',
    'text/plain','text/csv','text/xml','application/xml',
    'application/json',
    'application/zip','application/x-zip-compressed',
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dev-kanban-files',
  'dev-kanban-files',
  true,
  104857600,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm',
    'application/pdf',
    'text/plain','text/csv','text/xml','application/xml',
    'application/json',
    'application/zip','application/x-zip-compressed',
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public access to kanban-files'
  ) THEN
    CREATE POLICY "Public access to kanban-files"
      ON storage.objects FOR SELECT
      TO public USING (bucket_id = 'kanban-files');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can upload to kanban-files'
  ) THEN
    CREATE POLICY "Authenticated users can upload to kanban-files"
      ON storage.objects FOR INSERT
      TO authenticated WITH CHECK (bucket_id = 'kanban-files');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can update their own kanban-files'
  ) THEN
    CREATE POLICY "Users can update their own kanban-files"
      ON storage.objects FOR UPDATE
      TO authenticated USING (bucket_id = 'kanban-files' AND auth.uid() = owner);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can delete their own kanban-files'
  ) THEN
    CREATE POLICY "Users can delete their own kanban-files"
      ON storage.objects FOR DELETE
      TO authenticated USING (bucket_id = 'kanban-files' AND auth.uid() = owner);
  END IF;
END $$;
