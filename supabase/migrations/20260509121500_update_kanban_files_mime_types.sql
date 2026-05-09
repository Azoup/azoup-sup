-- Migration to allow .rar files and other compressed formats in kanban storage buckets
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm',
    'application/pdf',
    'text/plain','text/csv','text/xml','application/xml',
    'application/json',
    'application/zip','application/x-zip-compressed',
    'application/x-rar-compressed', 'application/vnd.rar', 'application/x-compressed', 'application/rar',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
]
WHERE id IN ('kanban-files', 'dev-kanban-files');
