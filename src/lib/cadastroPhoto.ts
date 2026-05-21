import { uploadPhotoViaApi } from '@/lib/uploadPhotoApi';

export type CadastroPhotoBucket = 'analyst-photos' | 'developer-photos';

export type CadastroPhotoUploadResult = {
  publicUrl: string;
  blobPreview: string;
};

const TABLE_BY_BUCKET: Record<CadastroPhotoBucket, 'analysts' | 'developers'> = {
  'analyst-photos': 'analysts',
  'developer-photos': 'developers',
};

/** Upload de foto de analista ou desenvolvedor (API + service role). */
export async function uploadCadastroPhotoFile(
  bucket: CadastroPhotoBucket,
  recordId: string,
  file: File,
): Promise<CadastroPhotoUploadResult> {
  const table = TABLE_BY_BUCKET[bucket];
  return uploadPhotoViaApi(bucket, table, recordId, file);
}
