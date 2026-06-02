import { useQuery } from '@tanstack/react-query';
import {
  commentAuthorProfileQueryKey,
  fetchCommentAuthorProfile,
} from '@/lib/commentAuthorProfiles';

/** Pré-carrega foto/nome do usuário logado para comentários otimistas. */
export function useCommentAuthorProfile(userId: string | undefined) {
  return useQuery({
    queryKey: commentAuthorProfileQueryKey(userId ?? ''),
    queryFn: () => fetchCommentAuthorProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
