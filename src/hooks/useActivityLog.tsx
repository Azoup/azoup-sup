import { supabase } from '@/integrations/supabase/client';

export async function logActivity(action: string, details?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('activity_logs').insert({
    user_id: user.id,
    user_email: user.email || '',
    action,
    details: details || null,
  });
}
