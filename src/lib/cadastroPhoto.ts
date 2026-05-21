import { supabase } from '@/integrations/supabase/client';
import { primePhotoDisplayCache } from '@/lib/photoDisplayCache';
import { normalizeProfilePhotoUrl, profilePhotoSrc } from '@/lib/profilePhotoUrl';
import { resolvePhotoDisplayUrl } from '@/lib/profilePhotoUpload';

export type CadastroPhotoBucket = 'analyst-photos' | 'developer-photos';

export type CadastroPhotoUploadResult = {
  publicUrl: string;
  displayUrl: string;
  blobPreview: string;
};

/** Upload para bucket de analista/desenvolvedor. */
export async function uploadCadastroPhotoFile(
  bucket: CadastroPhotoBucket,
  recordId: string,
  file: File,
): Promise<CadastroPhotoUploadResult> {
  const blobPreview = URL.createObjectURL(file);
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${recordId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (uploadError) {
    URL.revokeObjectURL(blobPreview);
    throw uploadError;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const publicUrl = normalizeProfilePhotoUrl(data.publicUrl) ?? data.publicUrl;
  const displayUrl =
    (await resolvePhotoDisplayUrl(publicUrl, Date.now())) ?? blobPreview;

  if (displayUrl !== blobPreview) {
    primePhotoDisplayCache(publicUrl, displayUrl);
  }

  return { publicUrl, displayUrl, blobPreview };
}
