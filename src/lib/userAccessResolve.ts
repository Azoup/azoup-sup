/** Junta API + fallback. Falha total lança — nunca vira “Padrão” sintético. */
export function resolveUserAccessResult<T>(
  api: T | null,
  supabase: T | null,
): T {
  if (api) return api;
  if (supabase) return supabase;
  throw new Error('user_access_unavailable');
}
