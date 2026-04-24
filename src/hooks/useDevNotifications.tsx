import { supabase } from '@/integrations/supabase/client';

interface NotifyArgs {
  cardId: string;
  cardTitle: string;
  recipientId: string | null | undefined;
  actionType: 'edit' | 'comment' | 'attachment' | 'status' | 'assignee';
  actorId: string | null | undefined;
  actorName: string;
  message: string;
}

/**
 * Creates a notification for the responsible user of a DEV Kanban card.
 * Skips if there's no recipient or if recipient is the actor (no self-notify).
 */
export async function notifyDev({
  cardId,
  cardTitle,
  recipientId,
  actionType,
  actorId,
  actorName,
  message,
}: NotifyArgs) {
  if (!recipientId) return;
  if (actorId && actorId === recipientId) return;

  try {
    await (supabase as any).from('dev_kanban_notifications').insert({
      recipient_id: recipientId,
      card_id: cardId,
      card_title: cardTitle,
      action_type: actionType,
      actor_id: actorId || null,
      actor_name: actorName || 'Alguém',
      message,
    });
  } catch (e) {
    // Silently swallow — notification failures should not break primary flow.
    console.warn('[notifyDev] failed:', e);
  }
}

/**
 * Resolves the developer's auth user id by their developer record id.
 * The "developer" table has a `name` and `id` but no auth user_id link.
 * We try to match by display_name in profiles. Returns null if not found.
 */
export async function resolveDeveloperUserId(developerId: string | null | undefined): Promise<string | null> {
  if (!developerId) return null;
  const { data: dev } = await supabase.from('developers').select('name').eq('id', developerId).maybeSingle();
  if (!dev?.name) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .ilike('display_name', dev.name)
    .maybeSingle();
  return profile?.id || null;
}
