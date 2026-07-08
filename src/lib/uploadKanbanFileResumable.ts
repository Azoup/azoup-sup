import { Upload as TusUpload } from 'tus-js-client';
import { supabase } from '@/integrations/supabase/client';
import type { KanbanCardFileRow } from '@/lib/kanbanCardFiles';
import {
  KANBAN_RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  resolveKanbanFileContentType,
} from '@/lib/kanbanFileUploadLimits';
import type { KanbanCardFilesTable, KanbanFilesBucket } from '@/lib/uploadKanbanFileApi';

export function shouldUseResumableKanbanUpload(fileSize: number): boolean {
  return fileSize > KANBAN_RESUMABLE_UPLOAD_THRESHOLD_BYTES;
}

async function insertKanbanFileRow(
  filesTable: KanbanCardFilesTable,
  cardId: string,
  path: string,
  bucket: KanbanFilesBucket,
  file: File,
  contentType: string,
  userId?: string,
  userEmail?: string,
): Promise<KanbanCardFileRow> {
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  const { data, error } = await supabase
    .from(filesTable)
    .insert({
      card_id: cardId,
      file_url: urlData.publicUrl,
      file_path: path,
      file_name: file.name,
      file_type: contentType,
      file_size: file.size,
      uploaded_by: userId,
      uploaded_by_email: userEmail || '',
    })
    .select('id, card_id, file_url, file_path, file_name, file_type, file_size, created_at')
    .single();

  if (error) throw error;
  return data as KanbanCardFileRow;
}

/** Upload resumável (TUS) para arquivos grandes — vídeos, ZIP, RAR, etc. */
export async function uploadKanbanFileResumable(
  bucket: KanbanFilesBucket,
  filesTable: KanbanCardFilesTable,
  cardId: string,
  file: File,
  userId?: string,
  userEmail?: string,
  onProgress?: (progress: number) => void,
): Promise<KanbanCardFileRow> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sessão expirada — faça login novamente.');
  }

  const ext = file.name.split('.').pop() || 'bin';
  const contentType = resolveKanbanFileContentType(file);
  const path = `${cardId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  await new Promise<void>((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (onProgress && bytesTotal > 0) {
          onProgress(Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)));
        }
      },
      onSuccess: () => resolve(),
    });

    void upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      })
      .catch(reject);
  });

  onProgress?.(100);
  return insertKanbanFileRow(filesTable, cardId, path, bucket, file, contentType, userId, userEmail);
}
