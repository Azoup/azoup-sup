import { supabase } from '@/integrations/supabase/client';
import type { KanbanCardFileRow } from '@/lib/kanbanCardFiles';
import {
  KANBAN_API_UPLOAD_MAX_BYTES,
  resolveKanbanFileContentType,
  validateKanbanFileSize,
} from '@/lib/kanbanFileUploadLimits';
import {
  uploadKanbanFileViaApi,
  type KanbanCardFilesTable,
  type KanbanFilesBucket,
} from '@/lib/uploadKanbanFileApi';
import {
  shouldUseResumableKanbanUpload,
  uploadKanbanFileResumable,
} from '@/lib/uploadKanbanFileResumable';

export type KanbanFileUploadProgress = (progress: number) => void;

/** Upload direto ao Storage (arquivos pequenos/médios). */
async function uploadKanbanFileDirect(
  bucket: KanbanFilesBucket,
  filesTable: KanbanCardFilesTable,
  cardId: string,
  file: File,
  userId?: string,
  userEmail?: string,
  onProgress?: KanbanFileUploadProgress,
): Promise<KanbanCardFileRow> {
  const ext = file.name.split('.').pop() || 'bin';
  const contentType = resolveKanbanFileContentType(file);
  const path = `${cardId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  onProgress?.(10);

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: false });
  if (uploadError) throw uploadError;

  onProgress?.(90);

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
  onProgress?.(100);
  return data as KanbanCardFileRow;
}

/**
 * Envia anexo de ticket.
 * - Até ~48 MB: tenta API (service role), com fallback para Storage direto.
 * - Acima de 6 MB: upload resumável (TUS) direto ao Storage.
 */
export async function uploadKanbanFileForCard(
  bucket: KanbanFilesBucket,
  filesTable: KanbanCardFilesTable,
  cardId: string,
  file: File,
  userId?: string,
  userEmail?: string,
  onProgress?: KanbanFileUploadProgress,
): Promise<KanbanCardFileRow> {
  const sizeError = validateKanbanFileSize(file);
  if (sizeError) throw new Error(sizeError);

  if (shouldUseResumableKanbanUpload(file.size)) {
    return uploadKanbanFileResumable(
      bucket,
      filesTable,
      cardId,
      file,
      userId,
      userEmail,
      onProgress,
    );
  }

  if (file.size <= KANBAN_API_UPLOAD_MAX_BYTES) {
    try {
      onProgress?.(20);
      const row = await uploadKanbanFileViaApi(bucket, filesTable, cardId, file);
      onProgress?.(100);
      return row;
    } catch (apiErr) {
      console.warn('[kanban] upload de arquivo via API falhou, tentando storage direto', apiErr);
    }
  }

  return uploadKanbanFileDirect(bucket, filesTable, cardId, file, userId, userEmail, onProgress);
}
