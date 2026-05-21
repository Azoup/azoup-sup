import { supabase } from '@/integrations/supabase/client';
import { normalizeProfilePhotoUrl } from '@/lib/profilePhotoUrl';
import { photoUrlForDatabase } from '@/lib/profilePhotoUpload';

export type CadastroPhotoBucket = 'analyst-photos' | 'developer-photos';
export type CadastroTable = 'analysts' | 'developers';

export async function uploadCadastroPhotoFile(
  bucket: CadastroPhotoBucket,
  recordId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${recordId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return normalizeProfilePhotoUrl(data.publicUrl) ?? data.publicUrl;
}

export async function saveCadastroPhotoUrl(
  table: CadastroTable,
  recordId: string,
  rawUrl: string,
): Promise<string> {
  const url = photoUrlForDatabase(rawUrl);
  if (!url) throw new Error('URL de foto inválida');
  const { error } = await supabase.from(table).update({ photo_url: url }).eq('id', recordId);
  if (error) throw error;
  return url;
}
