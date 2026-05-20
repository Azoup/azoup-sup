import { supabase } from '@/integrations/supabase/client';

/** Não deve falhar operações do Kanban (evita getUser com JWT ES256). */
export async function logActivity(action: string, details?: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user?.id) return;

    const { error } = await supabase.from('activity_logs').insert({
      user_id: user.id,
      user_email: user.email || '',
      action,
      details: details || null,
    });
    if (error) {
      console.warn('[activity]', error.message);
    }
  } catch (err) {
    console.warn('[activity]', err);
  }
}
