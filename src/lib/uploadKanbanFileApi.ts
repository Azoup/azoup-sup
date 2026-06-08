import { getConfiguredSupabaseProjectRef } from '@/lib/supabaseProject';
import type { KanbanCardFileRow } from '@/lib/kanbanCardFiles';

export type KanbanFilesBucket = 'kanban-files' | 'dev-kanban-files';
export type KanbanCardFilesTable = 'kanban_card_files' | 'dev_kanban_card_files';

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

export async function uploadKanbanFileViaApi(
  bucket: KanbanFilesBucket,
  filesTable: KanbanCardFilesTable,
  cardId: string,
  file: File,
): Promise<KanbanCardFileRow> {
  const token = getStoredAccessToken();
  if (!token) throw new Error('Sessão expirada — faça login novamente.');

  const ext = file.name.split('.').pop() || 'bin';
  const isRar = ext.toLowerCase() === 'rar';
  const contentType = isRar ? 'application/octet-stream' : (file.type || 'application/octet-stream');
  const fileBase64 = await fileToBase64(file);

  const res = await fetch('/api/upload-kanban-file', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      card_id: cardId,
      files_table: filesTable,
      bucket,
      file_name: file.name,
      content_type: contentType,
      file_base64: fileBase64,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    file?: KanbanCardFileRow;
  };

  if (!res.ok) {
    throw new Error(json.message || json.error || `Erro ${res.status} ao enviar arquivo`);
  }

  if (!json.file?.id) {
    throw new Error('Resposta inválida do servidor ao enviar arquivo');
  }

  return json.file;
}
