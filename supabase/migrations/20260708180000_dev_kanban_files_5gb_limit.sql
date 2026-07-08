-- Aumenta limite de anexos do Kanban DEV (e suporte) para 5 GB e amplia tipos MIME.
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
WHERE id IN ('dev-kanban-files', 'kanban-files');
