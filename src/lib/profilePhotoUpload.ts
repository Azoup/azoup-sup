import { supabase } from '@/integrations/supabase/client';
import {
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

  const object = storageObjectFromPublicUrl(photoUrl);
  if (object) {
    const { data, error } = await supabase.storage
      .from(object.bucket)
      .createSignedUrl(object.path, 60 * 60 * 24 * 7);
    if (!error && data?.signedUrl) {
      if (cacheBust == null) return data.signedUrl;
      const sep = data.signedUrl.includes('?') ? '&' : '?';
      return `${data.signedUrl}${sep}t=${cacheBust}`;
    }
  }

  return profilePhotoSrc(photoUrl, cacheBust);
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
  const bust = Date.now();
  const displayUrl =
    (await resolvePhotoDisplayUrl(publicUrl, bust)) ?? URL.createObjectURL(file);

  return { publicUrl, displayUrl, storagePath };
}
