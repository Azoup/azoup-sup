import type { User } from '@supabase/supabase-js';

/** Nome do utilizador atual sem pedido extra à API. */
export function actorNameFromUser(user: User | null | undefined): string {
  if (!user) return 'Alguém';
  const meta = user.user_metadata as { display_name?: string; full_name?: string } | undefined;
  return (
    meta?.display_name ||
    meta?.full_name ||
    user.email?.split('@')[0] ||
    'Alguém'
  );
}
