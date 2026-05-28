import { useAppRealtimeSync } from '@/hooks/useAppRealtimeSync';

/** Ativa sincronização em tempo real em todas as rotas autenticadas. */
export function AppRealtimeSync() {
  useAppRealtimeSync();
  return null;
}
