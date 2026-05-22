/** Ignora eventos realtime causados por writes locais (evita refetch completo do board). */
let pendingSkips = 0;

export function markBoardLocalWrite(count = 1): void {
  pendingSkips += count;
}

export function consumeBoardRealtimeSkip(): boolean {
  if (pendingSkips > 0) {
    pendingSkips -= 1;
    return true;
  }
  return false;
}
