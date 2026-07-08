/** Limite máximo por anexo no Kanban (5 GB). */
export const KANBAN_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024;

export const KANBAN_MAX_FILE_SIZE_LABEL = '5 GB';

/** Acima disso usa upload resumável (TUS) direto ao Storage. */
export const KANBAN_RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;

/** Até este tamanho pode tentar a API (base64); acima vai direto ao Storage. */
export const KANBAN_API_UPLOAD_MAX_BYTES = 48 * 1024 * 1024;

export function formatKanbanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function validateKanbanFileSize(file: File): string | null {
  if (file.size > KANBAN_MAX_FILE_SIZE_BYTES) {
    return `${file.name}: excede o limite de ${KANBAN_MAX_FILE_SIZE_LABEL} (tamanho: ${formatKanbanFileSize(file.size)}).`;
  }
  if (file.size < 1) {
    return `${file.name}: arquivo vazio.`;
  }
  return null;
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  rar: 'application/octet-stream',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  wmv: 'video/x-ms-wmv',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
};

export function resolveKanbanFileContentType(file: File): string {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  if (EXT_CONTENT_TYPE[ext]) return EXT_CONTENT_TYPE[ext];
  if (file.type) return file.type;
  return 'application/octet-stream';
}
