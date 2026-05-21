import { getConfiguredSupabaseProjectRef } from '@/lib/supabaseProject';

export type PhotoBucket = 'analyst-photos' | 'developer-photos' | 'profile-photos';
export type PhotoTable = 'analysts' | 'developers' | 'profiles';

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

export type UploadPhotoApiResult = {
  publicUrl: string;
  blobPreview: string;
};

/** Upload via API (service role) — evita corrupção do proxy REST em arquivos binários. */
export async function uploadPhotoViaApi(
  bucket: PhotoBucket,
  table: PhotoTable,
  recordId: string,
  file: File,
): Promise<UploadPhotoApiResult> {
  const token = getStoredAccessToken();
  if (!token) throw new Error('Sessão expirada — faça login novamente.');

  const blobPreview = URL.createObjectURL(file);
  const fileBase64 = await fileToBase64(file);

  const res = await fetch('/api/upload-photo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      bucket,
      table,
      record_id: recordId,
      file_name: file.name,
      content_type: file.type || 'image/jpeg',
      file_base64: fileBase64,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    public_url?: string;
  };

  if (!res.ok) {
    URL.revokeObjectURL(blobPreview);
    throw new Error(json.message || json.error || `Erro ${res.status} ao enviar foto`);
  }

  const publicUrl = json.public_url?.trim();
  if (!publicUrl) {
    URL.revokeObjectURL(blobPreview);
    throw new Error('Resposta inválida do servidor ao enviar foto');
  }

  return { publicUrl, blobPreview };
}
