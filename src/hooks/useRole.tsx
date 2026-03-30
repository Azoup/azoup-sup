import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useRole() {
  const { user } = useAuth();

  const { data: role, isLoading } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user) return 'user';
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      return (data?.role as string) || 'user';
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return {
    role: role || 'user',
    isAdmin: role === 'admin',
    isLoading,
  };
}
