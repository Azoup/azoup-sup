import { supabase } from '@/integrations/supabase/client';
import { normalizeProfilePhotoUrl } from '@/lib/profilePhotoUrl';
import { resolvePhotoDisplayUrl } from '@/lib/profilePhotoUpload';

export type CadastroPhotoBucket = 'analyst-photos' | 'developer-photos';

export type CadastroPhotoUploadResult = {
  publicUrl: string;
  displayUrl: string;
};

/** Upload para bucket de analista/desenvolvedor; retorna URL do banco + URL para exibir no avatar. */
export async function uploadCadastroPhotoFile(
  bucket: CadastroPhotoBucket,
  recordId: string,
  file: File,
): Promise<CadastroPhotoUploadResult> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${recordId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const publicUrl = normalizeProfilePhotoUrl(data.publicUrl) ?? data.publicUrl;
  const displayUrl =
    (await resolvePhotoDisplayUrl(publicUrl, Date.now())) ?? URL.createObjectURL(file);

  return { publicUrl, displayUrl };
}
