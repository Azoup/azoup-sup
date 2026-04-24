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

// Normalize a name: lowercase + strip accents
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Match a person name (e.g. "Beatriz", "Flávia") against profile display_names
 * (e.g. "bea.azoup", "flavia.andreotti", "gianluca"). Matches when the
 * normalized first name of either side is a prefix of the other's first token.
 */
async function findProfileIdByName(name: string): Promise<string | null> {
  const norm = normalize(name);
  const firstName = norm.split(/[\s.]+/)[0];
  if (!firstName) return null;

  // 1) Exact (case-insensitive) match first
  const { data: exact } = await supabase
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', name)
    .maybeSingle();
  if (exact?.id) return exact.id;

  // 2) Pull all profiles and match by first-name prefix (handles "Beatriz" ↔ "bea.azoup")
  const { data: all } = await supabase.from('profiles').select('id, display_name');
  if (!all) return null;
  // Prefer longer/closer matches
  let best: { id: string; score: number } | null = null;
  for (const p of all) {
    if (!p.display_name) continue;
    const dn = normalize(p.display_name);
    const dnFirst = dn.split(/[\s.]+/)[0];
    if (!dnFirst) continue;
    let score = 0;
    if (dnFirst === firstName) score = 100;
    else if (dnFirst.startsWith(firstName)) score = 80 - (dnFirst.length - firstName.length);
    else if (firstName.startsWith(dnFirst) && dnFirst.length >= 3) score = 60 - (firstName.length - dnFirst.length);
    if (score > 0 && (!best || score > best.score)) best = { id: p.id, score };
  }
  return best?.id || null;
}

/**
 * Resolves the developer's auth user id by their developer record id.
 */
export async function resolveDeveloperUserId(developerId: string | null | undefined): Promise<string | null> {
  if (!developerId) return null;
  const { data: dev } = await supabase.from('developers').select('name').eq('id', developerId).maybeSingle();
  if (!dev?.name) return null;
  return findProfileIdByName(dev.name);
}

/**
 * Resolves the analyst's auth user id by their analyst record id.
 */
export async function resolveAnalystUserId(analystId: string | null | undefined): Promise<string | null> {
  if (!analystId) return null;
  const { data: an } = await supabase.from('analysts').select('name').eq('id', analystId).maybeSingle();
  if (!an?.name) return null;
  return findProfileIdByName(an.name);
}

/**
 * Notifies both the developer and analyst responsible for a card.
 * Skips the actor and de-duplicates if dev/analyst resolve to same user.
 */
export async function notifyDevAndAnalyst(params: {
  cardId: string;
  cardTitle: string;
  developerId: string | null | undefined;
  analystId: string | null | undefined;
  actionType: 'edit' | 'comment' | 'attachment' | 'status' | 'assignee';
  actorId: string | null | undefined;
  actorName: string;
  message: string;
}) {
  const [devUserId, analystUserId] = await Promise.all([
    resolveDeveloperUserId(params.developerId),
    resolveAnalystUserId(params.analystId),
  ]);
  const recipients = new Set<string>();
  if (devUserId) recipients.add(devUserId);
  if (analystUserId) recipients.add(analystUserId);
  if (params.actorId) recipients.delete(params.actorId);
  await Promise.all(
    Array.from(recipients).map((rid) =>
      notifyDev({
        cardId: params.cardId,
        cardTitle: params.cardTitle,
        recipientId: rid,
        actionType: params.actionType,
        actorId: params.actorId,
        actorName: params.actorName,
        message: params.message,
      })
    )
  );
}
