import { supabase } from '@/integrations/supabase/client';
import { kanbanImageSrc } from '@/lib/kanbanImageUrl';

export type CommentAuthorProfile = { name: string; photo_url: string };

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
