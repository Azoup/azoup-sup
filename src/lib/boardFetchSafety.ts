/** Evita substituir um board carregado por um fetch vazio (timeout/erro transitório). */
export function shouldRejectEmptyBoardFetch<T extends { cards?: unknown[] }>(
  next: T,
  fallback: T | undefined,
): boolean {
  if (!fallback) return false;
  const nextLen = Array.isArray(next.cards) ? next.cards.length : 0;
  const prevLen = Array.isArray(fallback.cards) ? fallback.cards.length : 0;
  return prevLen > 0 && nextLen === 0;
}
