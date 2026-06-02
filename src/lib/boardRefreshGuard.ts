/** Ignora eventos realtime causados por writes locais (evita refetch completo do board). */
let pendingSkips = 0;
/** Janela extra após writes locais (eventos realtime atrasados). */
let suppressRealtimeUntil = 0;

const REALTIME_GRACE_MS = 4_000;

export function markBoardLocalWrite(count = 1): void {
  pendingSkips += count;
  suppressRealtimeUntil = Date.now() + REALTIME_GRACE_MS;
}

export function consumeBoardRealtimeSkip(): boolean {
  if (pendingSkips > 0) {
    pendingSkips -= 1;
    return true;
  }
  if (Date.now() < suppressRealtimeUntil) return true;
  return false;
}

/** Para testes. */
export function resetBoardRefreshGuard(): void {
  pendingSkips = 0;
  suppressRealtimeUntil = 0;
}
