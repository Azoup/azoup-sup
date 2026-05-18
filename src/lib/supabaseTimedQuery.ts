import { withTimeout } from '@/lib/withTimeout';

export const SUPABASE_QUERY_TIMEOUT_MS = 20_000;

/** Executa uma query Supabase com limite de tempo (evita spinner infinito no UI). */
export async function runTimedQuery<T>(fn: () => Promise<T>, ms = SUPABASE_QUERY_TIMEOUT_MS): Promise<T> {
  return withTimeout(fn(), ms, 'O servidor demorou a responder. Tente fechar e abrir o cartão novamente.');
}
