import { uploadPhotoViaApi } from '@/lib/uploadPhotoApi';

export type ProfilePhotoUploadResult = {
  publicUrl: string;
  blobPreview: string;
};

/** Envia foto de perfil via API (grava no Storage e na tabela profiles). */
export async function uploadProfilePhotoFile(
  userId: string,
  file: File,
): Promise<ProfilePhotoUploadResult> {
  const { publicUrl, blobPreview } = await uploadPhotoViaApi(
    'profile-photos',
    'profiles',
    userId,
    file,
  );
  return { publicUrl, blobPreview };
}
