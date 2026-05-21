import { supabase } from '@/integrations/supabase/client';
import { kanbanImageSrc } from '@/lib/kanbanImageUrl';
import { getConfiguredSupabaseProjectRef } from '@/lib/supabaseProject';
import {
  uploadKanbanImageViaApi,
  type KanbanCardImagesTable,
} from '@/lib/uploadKanbanImageApi';

function getStoredAccessToken(): string | null {
  const ref = getConfiguredSupabaseProjectRef();
  if (!ref || typeof window === 'undefined') return null;

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.includes(ref) || !key.includes('auth-token')) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as {
        access_token?: string;
        currentSession?: { access_token?: string };
      };
      const token = data.access_token ?? data.currentSession?.access_token;
      if (token) return token;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function buildKanbanImagePublicUrl(storagePath: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
  const encoded = storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base}/storage/v1/object/public/kanban-images/${encoded}`;
}

/** Upload direto ao Storage (binário intacto, sem proxy REST). */
async function uploadKanbanImageDirect(
  imagesTable: KanbanCardImagesTable,
  cardId: string,
  file: File,
  index = 0,
): Promise<{ publicUrl: string }> {
  const token = getStoredAccessToken();
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const base = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/\/$/, '');
  if (!token || !base || !anonKey) {
    throw new Error('Sessão ou configuração Supabase indisponível.');
  }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const storagePath = `${cardId}/${Date.now()}-${index}.${ext}`;
  const contentType = file.type || 'image/png';
  const encodedPath = storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const res = await fetch(`${base}/storage/v1/object/kanban-images/${encodedPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: file,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Falha no upload (${res.status})`);
  }

  const publicUrl = buildKanbanImagePublicUrl(storagePath);
  const { error } = await supabase.from(imagesTable).insert({ card_id: cardId, image_url: publicUrl });
  if (error) throw new Error(error.message);

  return { publicUrl };
}

export type UploadKanbanImageResult = {
  publicUrl: string;
};

/**
 * Envia imagem de ticket: API (service role) com fallback para upload direto binário.
 */
export async function uploadKanbanImageForCard(
  imagesTable: KanbanCardImagesTable,
  cardId: string,
  file: File,
  index = 0,
): Promise<UploadKanbanImageResult> {
  try {
    return await uploadKanbanImageViaApi(imagesTable, cardId, file);
  } catch (apiErr) {
    console.warn('[kanban] upload via API falhou, tentando storage direto', apiErr);
    return uploadKanbanImageDirect(imagesTable, cardId, file, index);
  }
}

/** URL pronta para exibir (normalizada). */
export function displayKanbanImageUrl(storedUrl: string): string {
  return kanbanImageSrc(storedUrl) ?? storedUrl;
}
