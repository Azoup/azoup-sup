import { getConfiguredSupabaseProjectRef } from '@/lib/supabaseProject';

export type KanbanCardImagesTable = 'kanban_card_images' | 'dev_kanban_card_images';

function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const ref = getConfiguredSupabaseProjectRef();
  if (!ref) return null;

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

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Upload de imagem de ticket via API (evita corrupção binária no proxy REST). */
export async function uploadKanbanImageViaApi(
  imagesTable: KanbanCardImagesTable,
  cardId: string,
  file: File,
): Promise<{ publicUrl: string }> {
  const token = getStoredAccessToken();
  if (!token) throw new Error('Sessão expirada — faça login novamente.');

  const fileBase64 = await fileToBase64(file);

  const res = await fetch('/api/upload-kanban-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      card_id: cardId,
      images_table: imagesTable,
      file_name: file.name,
      content_type: file.type || 'image/png',
      file_base64: fileBase64,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    public_url?: string;
  };

  if (!res.ok) {
    throw new Error(json.message || json.error || `Erro ${res.status} ao enviar imagem`);
  }

  const publicUrl = json.public_url?.trim();
  if (!publicUrl) {
    throw new Error('Resposta inválida do servidor ao enviar imagem');
  }

  return { publicUrl };
}
