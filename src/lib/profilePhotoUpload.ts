import { supabase } from '@/integrations/supabase/client';
import {
  isExternalPhotoUrl,
  isSignedStorageUrl,
  normalizeProfilePhotoUrl,
  profilePhotoSrc,
  storageObjectFromPublicUrl,
} from '@/lib/profilePhotoUrl';
import { canLoadImageUrl, primePhotoDisplayCache } from '@/lib/photoDisplayCache';

/** URL que o navegador consegue carregar. Buckets públicos usam URL direta (mais estável). */
export async function resolvePhotoDisplayUrl(
  photoUrl: string | null | undefined,
  cacheBust?: number,
): Promise<string | undefined> {
  if (!photoUrl?.trim()) return undefined;

  const normalized = normalizeProfilePhotoUrl(photoUrl);
  if (!normalized) return undefined;

  if (isSignedStorageUrl(normalized)) return normalized;

  if (isExternalPhotoUrl(normalized) && !storageObjectFromPublicUrl(normalized)) {
    return normalized;
  }

  const publicSrc = profilePhotoSrc(normalized, cacheBust);
  if (publicSrc?.includes('/object/public/')) {
    if (await canLoadImageUrl(publicSrc)) return publicSrc;
  }

  const object = storageObjectFromPublicUrl(normalized);
  if (object) {
    const { data, error } = await supabase.storage
      .from(object.bucket)
      .createSignedUrl(object.path, 60 * 60 * 24 * 7);
    if (!error && data?.signedUrl) {
      if (await canLoadImageUrl(data.signedUrl)) return data.signedUrl;
    }
  }

  if (publicSrc && (await canLoadImageUrl(publicSrc))) return publicSrc;
  return publicSrc;
}

export type ProfilePhotoUploadResult = {
  publicUrl: string;
  displayUrl: string;
  storagePath: string;
  blobPreview: string;
};

/** Envia foto ao bucket profile-photos e devolve URL pública (DB) + URL para exibir. */
export async function uploadProfilePhotoFile(
  userId: string,
  file: File,
): Promise<ProfilePhotoUploadResult> {
  const blobPreview = URL.createObjectURL(file);
  const ext = file.name.split('.').pop() || 'jpg';
  const storagePath = `${userId}/${Date.now()}.${ext}`;
  const contentType = file.type || 'image/jpeg';

  const { error: upErr } = await supabase.storage
    .from('profile-photos')
    .upload(storagePath, file, { upsert: true, contentType });
  if (upErr) {
    URL.revokeObjectURL(blobPreview);
    throw upErr;
  }

  const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(storagePath);
  const publicUrl = normalizeProfilePhotoUrl(urlData.publicUrl) ?? urlData.publicUrl;
  const displayUrl = (await resolvePhotoDisplayUrl(publicUrl, Date.now())) ?? blobPreview;

  if (displayUrl !== blobPreview) {
    primePhotoDisplayCache(publicUrl, displayUrl);
  }

  return { publicUrl, displayUrl, storagePath, blobPreview };
}
