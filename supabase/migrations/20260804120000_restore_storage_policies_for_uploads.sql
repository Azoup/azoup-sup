-- Restaura políticas RLS de storage.objects (sumiram no projeto remoto).
-- Necessário para upload normal e TUS (resumável / arquivos grandes: vídeo, ZIP).
-- TUS exige SELECT + INSERT + UPDATE (com WITH CHECK).

DO $$
DECLARE
  b text;
BEGIN
  FOREACH b IN ARRAY ARRAY[
    'dev-kanban-files',
    'kanban-files',
    'confec-kanban-files',
    'kanban-images',
    'analyst-photos',
    'developer-photos',
    'profile-photos'
  ]
  LOOP
    -- SELECT (authenticated) — INSERT ... RETURNING precisa disso
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = format('Auth select %s', b)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L)',
        format('Auth select %s', b), b
      );
    END IF;

    -- SELECT público (buckets públicos de mídia/anexo)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = format('Public select %s', b)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT TO anon USING (bucket_id = %L)',
        format('Public select %s', b), b
      );
    END IF;

    -- INSERT
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = format('Auth insert %s', b)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)',
        format('Auth insert %s', b), b
      );
    END IF;

    -- UPDATE (TUS/resumable precisa de USING + WITH CHECK)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = format('Auth update %s', b)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)',
        format('Auth update %s', b), b, b
      );
    END IF;

    -- DELETE
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = format('Auth delete %s', b)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)',
        format('Auth delete %s', b), b
      );
    END IF;
  END LOOP;
END $$;

-- Confec já tinha políticas antigas sem WITH CHECK no UPDATE — reforça para TUS
DROP POLICY IF EXISTS "Auth update confec kanban files" ON storage.objects;
CREATE POLICY "Auth update confec kanban files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'confec-kanban-files')
  WITH CHECK (bucket_id = 'confec-kanban-files');

-- Garante limite 5 GB e MIME amplos nos buckets de anexo
UPDATE storage.buckets
SET
  file_size_limit = 5368709120,
  allowed_mime_types = ARRAY[
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
WHERE id IN ('dev-kanban-files', 'kanban-files', 'confec-kanban-files');
