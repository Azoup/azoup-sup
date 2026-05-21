import { normalizeProfilePhotoUrl } from '@/lib/profilePhotoUrl';

export const KANBAN_IMAGE_BUCKET = 'kanban-images';

/** Extrai o path do objeto no bucket kanban-images. */
export function kanbanImagePathFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const patterns = [
    /\/object\/public\/kanban-images\/([^?]+)/i,
    /\/object\/sign\/kanban-images\/([^?]+)/i,
    /\/render\/image\/public\/kanban-images\/([^?]+)/i,
    /\/kanban-images\/([^?]+)/i,
  ];

  for (const re of patterns) {
    const match = trimmed.match(re);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }

  if (!trimmed.includes('/') && /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function supabasePublicObjectUrl(path: string): string | null {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  if (!base) return null;
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base}/storage/v1/object/public/${KANBAN_IMAGE_BUCKET}/${encoded}`;
}

/**
 * URL exibível para imagens de ticket — corrige host legado, signed URLs e paths relativos.
 */
export function normalizeKanbanImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;

  const hostFixed = normalizeProfilePhotoUrl(url.trim()) ?? url.trim();
  const path = kanbanImagePathFromUrl(hostFixed);

  if (path) {
    return supabasePublicObjectUrl(path) ?? hostFixed;
  }

  if (hostFixed.startsWith('http://') || hostFixed.startsWith('https://')) {
    return hostFixed;
  }

  return supabasePublicObjectUrl(hostFixed.replace(/^\//, ''));
}

export function kanbanImageSrc(url: string | null | undefined): string | undefined {
  return normalizeKanbanImageUrl(url) ?? undefined;
}

/** URLs a tentar na ordem (normalizada → original), para thumbnail e lightbox. */
export function kanbanImageDisplayCandidates(url: string | null | undefined): string[] {
  if (!url?.trim()) return [];
  const raw = url.trim();
  const normalized = normalizeKanbanImageUrl(raw);
  const list = [normalized, raw].filter((u): u is string => !!u);
  return [...new Set(list)];
}
