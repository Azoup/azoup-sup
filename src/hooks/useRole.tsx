import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { runTimedQuery } from '@/lib/supabaseTimedQuery';

export function useRole() {
  const { user } = useAuth();

  const { data: role, isLoading, isError } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user) return 'user';
      return runTimedQuery(async () => {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        return (data?.role as string) || 'user';
      });
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const resolvedRole = isError ? 'user' : (role || 'user');

  return {
    role: resolvedRole,
    isAdmin: resolvedRole === 'admin',
    isLoading: isLoading && !isError,
  };
}
