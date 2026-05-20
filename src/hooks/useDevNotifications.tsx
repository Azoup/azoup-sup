import { supabase } from '@/integrations/supabase/client';

type CardType = 'dev' | 'support';
type NotifyActionType = 'edit' | 'comment' | 'attachment' | 'status' | 'assignee';

interface NotifyArgs {
  cardId: string;
  cardTitle: string;
  recipientId: string | null | undefined;
  actionType: NotifyActionType;
  actorId: string | null | undefined;
  actorName: string;
  message: string;
  cardType?: CardType;
}

/**
 * Creates a notification for the responsible user of a Kanban card (DEV or Support).
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
  cardType = 'dev',
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
      card_type: cardType,
    });
  } catch (e) {
    // Silently swallow — notification failures should not break primary flow.
    console.warn('[notifyDev] failed:', e);
  }
}

/**
 * Notifies only the analyst responsible for a Support Kanban card.
 * Skips if actor is the analyst.
 */
export async function notifySupportAnalyst(params: {
  cardId: string;
  cardTitle: string;
  analystId: string | null | undefined;
  actionType: NotifyActionType;
  actorId: string | null | undefined;
  actorName: string;
  message: string;
}) {
  return notifySupportResponsible(params);
}

/**
 * DEV-style notification for the responsible analyst in Support Kanban.
 * Keeps the original helper available while centralizing the working flow.
 */
export async function notifySupportResponsible(params: {
  cardId: string;
  cardTitle: string;
  analystId: string | null | undefined;
  actionType: NotifyActionType;
  actorId: string | null | undefined;
  actorName: string;
  message: string;
}) {
  const analystUserId = await resolveAnalystUserId(params.analystId);
  if (!analystUserId) return;
  if (params.actorId && params.actorId === analystUserId) return;
  await notifyDev({
    cardId: params.cardId,
    cardTitle: params.cardTitle,
    recipientId: analystUserId,
    actionType: params.actionType,
    actorId: params.actorId,
    actorName: params.actorName,
    message: params.message,
    cardType: 'support',
  });
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
const analystUserIdCache = new Map<string, string | null>();
const developerUserIdCache = new Map<string, string | null>();

async function findProfileIdByName(name: string): Promise<string | null> {
  const norm = normalize(name);
  const firstName = norm.split(/[\s.]+/)[0];
  if (!firstName) return null;

  const viaRpc = await resolveProfileIdByNameViaRpc(name);
  if (viaRpc) return viaRpc;

  // Exact (case-insensitive) match
  const { data: exact } = await supabase
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', name)
    .maybeSingle();
  if (exact?.id) return exact.id;

  // Prefix match — limit rows (evita carregar todos os perfis)
  const { data: all } = await supabase
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', `${firstName}%`)
    .limit(40);
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

async function resolveProfileIdByNameViaRpc(name: string): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc('resolve_profile_id_by_name', {
    name_input: name,
  });

  if (error) {
    console.warn('[resolve_profile_id_by_name] failed:', error);
    return null;
  }

  return data || null;
}

/**
 * Resolves the developer's auth user id by their developer record id.
 */
export async function resolveDeveloperUserId(developerId: string | null | undefined): Promise<string | null> {
  if (!developerId) return null;
  if (developerUserIdCache.has(developerId)) {
    return developerUserIdCache.get(developerId) ?? null;
  }
  const { data: dev } = await supabase.from('developers').select('name').eq('id', developerId).maybeSingle();
  if (!dev?.name) {
    developerUserIdCache.set(developerId, null);
    return null;
  }
  const userId = (await findProfileIdByName(dev.name)) || (await resolveProfileIdByNameViaRpc(dev.name));
  developerUserIdCache.set(developerId, userId);
  return userId;
}

/**
 * Resolves the analyst's auth user id by their analyst record id.
 */
export async function resolveAnalystUserId(analystId: string | null | undefined): Promise<string | null> {
  if (!analystId) return null;
  if (analystUserIdCache.has(analystId)) {
    return analystUserIdCache.get(analystId) ?? null;
  }
  const { data: an } = await supabase.from('analysts').select('name').eq('id', analystId).maybeSingle();
  if (!an?.name) {
    analystUserIdCache.set(analystId, null);
    return null;
  }
  const userId = (await findProfileIdByName(an.name)) || (await resolveProfileIdByNameViaRpc(an.name));
  analystUserIdCache.set(analystId, userId);
  return userId;
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
  actionType: NotifyActionType;
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
