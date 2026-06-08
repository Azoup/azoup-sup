import { uploadKanbanImageForCard, type KanbanCardImageRow } from '@/lib/uploadKanbanImage';
import type { KanbanCardImagesTable } from '@/lib/uploadKanbanImageApi';
import { markBoardLocalWrite } from '@/lib/boardRefreshGuard';

/** Envia várias imagens em paralelo (muito mais rápido que sequencial). */
export async function uploadKanbanImagesParallel(
  imagesTable: KanbanCardImagesTable,
  cardId: string,
  files: File[],
): Promise<{ uploaded: number; failed: number; images: KanbanCardImageRow[] }> {
  if (files.length === 0) return { uploaded: 0, failed: 0, images: [] };

  const results = await Promise.allSettled(
    files.map((file, index) => uploadKanbanImageForCard(imagesTable, cardId, file, index)),
  );

  let uploaded = 0;
  let failed = 0;
  const images: KanbanCardImageRow[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      uploaded++;
      const row = r.value.image ?? {
        id: `pending-${Date.now()}-${images.length}`,
        card_id: cardId,
        image_url: r.value.publicUrl,
      };
      images.push(row);
    } else {
      failed++;
    }
  }

  if (uploaded > 0) markBoardLocalWrite(uploaded + 2);
  return { uploaded, failed, images };
}
