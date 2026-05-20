import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

type UserAccessResult = {
  role: string;
  permissions: Record<string, boolean> | null;
};

async function fetchUserAccess(accessToken: string): Promise<UserAccessResult> {
  const res = await fetch('/api/my-access', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`access_fetch_failed:${res.status}`);
  }
  return res.json() as Promise<UserAccessResult>;
}

export function useUserAccess() {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: ['user-access', user?.id],
    queryFn: async () => {
      if (!session?.access_token) {
        return { role: 'user', permissions: null } satisfies UserAccessResult;
      }
      return fetchUserAccess(session.access_token);
    },
    enabled: !!user && !!session?.access_token,
    staleTime: 60 * 1000,
    retry: 1,
  });
}
