import { supabase } from '@/integrations/supabase/client';
import type { KanbanCardFileRow } from '@/lib/kanbanCardFiles';
import {
  uploadKanbanFileViaApi,
  type KanbanCardFilesTable,
  type KanbanFilesBucket,
} from '@/lib/uploadKanbanFileApi';

function resolveContentType(file: File): string {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  if (ext === 'rar' || ext === 'zip') return 'application/octet-stream';
  return file.type || 'application/octet-stream';
}

/** Upload direto ao Storage (fallback quando a API não está disponível). */
async function uploadKanbanFileDirect(
  bucket: KanbanFilesBucket,
  filesTable: KanbanCardFilesTable,
  cardId: string,
  file: File,
  userId?: string,
  userEmail?: string,
): Promise<KanbanCardFileRow> {
  const ext = file.name.split('.').pop() || 'bin';
  const contentType = resolveContentType(file);
  const path = `${cardId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: false });
  if (uploadError) throw uploadError;

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

/** Envia anexo de ticket: API (service role) com fallback para upload direto. */
export async function uploadKanbanFileForCard(
  bucket: KanbanFilesBucket,
  filesTable: KanbanCardFilesTable,
  cardId: string,
  file: File,
  userId?: string,
  userEmail?: string,
): Promise<KanbanCardFileRow> {
  try {
    return await uploadKanbanFileViaApi(bucket, filesTable, cardId, file);
  } catch (apiErr) {
    console.warn('[kanban] upload de arquivo via API falhou, tentando storage direto', apiErr);
    return uploadKanbanFileDirect(bucket, filesTable, cardId, file, userId, userEmail);
  }
}
