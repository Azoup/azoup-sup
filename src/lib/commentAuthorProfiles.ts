import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { actorNameFromUser } from '@/lib/actorName';
import { kanbanImageSrc } from '@/lib/kanbanImageUrl';

export type CommentAuthorProfile = { name: string; photo_url: string };

export const COMMENT_AUTHOR_PROFILE_QUERY_KEY = 'comment-author-profile';

export function commentAuthorProfileQueryKey(userId: string) {
  return [COMMENT_AUTHOR_PROFILE_QUERY_KEY, userId] as const;
}

export async function fetchCommentAuthorProfile(
  userId: string,
): Promise<CommentAuthorProfile | null> {
  const map = await fetchCommentAuthorProfiles([userId]);
  return map[userId] ?? null;
}

type CommentDbRow = {
  id: string;
  card_id: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
};

export type EnrichedCommentRow = CommentDbRow & {
  display_name: string;
  photo_url: string;
};

/** Aplica nome/foto do perfil (mesma fonte do carregamento da lista). */
export function enrichCommentWithAuthorProfile<T extends CommentDbRow>(
  row: T,
  profileMap: Record<string, CommentAuthorProfile>,
  fallbackUser?: User | null,
): T & { display_name: string; photo_url: string } {
  const profile = profileMap[row.user_id];
  return {
    ...row,
    display_name:
      profile?.name ||
      actorNameFromUser(fallbackUser) ||
      row.user_email?.split('@')[0] ||
      '?',
    photo_url: profile?.photo_url || '',
  };
}

/** Perfis só dos autores do comentário (evita carregar tabelas analysts/developers inteiras). */
export async function fetchCommentAuthorProfiles(
  userIds: string[],
): Promise<Record<string, CommentAuthorProfile>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, photo_url')
    .in('id', unique);
  if (error) throw error;

  const map: Record<string, CommentAuthorProfile> = {};
  for (const p of profiles ?? []) {
    const photo = p.photo_url ? kanbanImageSrc(p.photo_url) : '';
    map[p.id] = {
      name: p.display_name || '',
      photo_url: photo || '',
    };
  }
  return map;
}
