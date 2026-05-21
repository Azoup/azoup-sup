/** Extrai arquivos de imagem do clipboard (Ctrl+V), com nome e tipo válidos. */
export function filesFromClipboardData(data: DataTransfer | null): File[] {
  if (!data?.items?.length) return [];

  const files: File[] = [];
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (!item.type.startsWith('image/')) continue;

    const raw = item.getAsFile();
    if (!raw || raw.size < 16) continue;

    if (raw.name?.trim()) {
      files.push(raw);
      continue;
    }

    const ext = item.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
    files.push(new File([raw], `colagem-${Date.now()}-${i}.${ext}`, { type: item.type || 'image/png' }));
  }

  return files;
}
