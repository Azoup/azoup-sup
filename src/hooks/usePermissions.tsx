import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';

export function usePermissions() {
  const { user } = useAuth();
  const { isAdmin } = useRole();

  const { data: permissions, isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      if (!user) return {};
      const { data } = await supabase
        .from('user_permissions')
        .select('permission_key, allowed')
        .eq('user_id', user.id);
      const map: Record<string, boolean> = {};
      data?.forEach(p => { map[p.permission_key] = p.allowed; });
      return map;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const hasPermission = (key: string): boolean => {
    if (isAdmin) return true;
    return permissions?.[key] === true;
  };

  const canView = (screen: string): boolean => hasPermission(`${screen}_view`);

  return { permissions: permissions || {}, isLoading, hasPermission, canView };
}

// Map route paths to screen permission keys
export const ROUTE_SCREEN_MAP: Record<string, string> = {
  '/': 'kanban',
  '/kanban-dashboard': 'kanban_dashboard',
  '/dashboard': 'dashboard',
  '/dashboard-bu': 'dashboard_bu',
  '/entries': 'entries',
  '/entries-bu': 'entries_bu',
  '/analysts': 'analysts',
  '/business-units': 'business_units',
  '/profile': 'profile_log',
};
