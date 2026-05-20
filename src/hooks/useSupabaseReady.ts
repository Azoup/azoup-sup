import { useAuth } from '@/hooks/useAuth';

/** Sessão Supabase pronta para queries autenticadas (evita cache vazio antes do login). */
export function useSupabaseReady() {
  const { session, loading } = useAuth();
  return {
    ready: !loading && !!session?.access_token,
    session,
    userId: session?.user?.id,
  };
}
