import { supabase } from '@/integrations/supabase/client';
import {
  isExternalPhotoUrl,
  isSignedStorageUrl,
  normalizeProfilePhotoUrl,
  profilePhotoSrc,
  storageObjectFromPublicUrl,
} from '@/lib/profilePhotoUrl';

/** URL que o navegador consegue carregar (assinada; fallback pública). */
export async function resolvePhotoDisplayUrl(
  photoUrl: string | null | undefined,
  cacheBust?: number,
): Promise<string | undefined> {
  if (!photoUrl?.trim()) return undefined;

  const normalized = normalizeProfilePhotoUrl(photoUrl);
  if (!normalized) return undefined;

  if (isSignedStorageUrl(normalized) || (isExternalPhotoUrl(normalized) && !storageObjectFromPublicUrl(normalized))) {
    return normalized;
  }

  const object = storageObjectFromPublicUrl(normalized);
  if (object) {
    const { data, error } = await supabase.storage
      .from(object.bucket)
      .createSignedUrl(object.path, 60 * 60 * 24 * 7);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  }

  return profilePhotoSrc(normalized, cacheBust);
}

export type ProfilePhotoUploadResult = {
  publicUrl: string;
  displayUrl: string;
  storagePath: string;
};

/** Envia foto ao bucket profile-photos e devolve URL pública (DB) + URL para exibir (assinada). */
export async function uploadProfilePhotoFile(
  userId: string,
  file: File,
): Promise<ProfilePhotoUploadResult> {
  const ext = file.name.split('.').pop() || 'jpg';
  const storagePath = `${userId}/${Date.now()}.${ext}`;
  const contentType = file.type || 'image/jpeg';

  const { error: upErr } = await supabase.storage
    .from('profile-photos')
    .upload(storagePath, file, { upsert: true, contentType });
  if (upErr) throw upErr;

  const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(storagePath);
  const publicUrl = normalizeProfilePhotoUrl(urlData.publicUrl) ?? urlData.publicUrl;
  const displayUrl =
    (await resolvePhotoDisplayUrl(publicUrl, Date.now())) ?? URL.createObjectURL(file);

  return { publicUrl, displayUrl, storagePath };
}

/** Normaliza URL antes de gravar no banco (cadastro ou link manual). */
export function photoUrlForDatabase(url: string): string | null {
  const normalized = normalizeProfilePhotoUrl(url);
  if (!normalized) return null;
  if (!isExternalPhotoUrl(normalized)) return normalized;
  return normalized;
}
