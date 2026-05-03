import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';

// Default permissions for standard (non-admin) users
const DEFAULT_USER_PERMISSIONS: Record<string, boolean> = {
  kanban_view: false,
  kanban_create: false,
  kanban_edit: false,
  kanban_delete: false,
  kanban_dashboard_view: false,
  kanban_dashboard_create: false,
  kanban_dashboard_edit: false,
  kanban_dashboard_delete: false,
  profile_log_view: true,
  profile_log_edit: true,
  analysts_view: false,
  analysts_create: false,
  analysts_edit: false,
  analysts_delete: false,
  dashboard_view: false,
  digisac_dashboard_view: false,
  dashboard_bu_view: false,
  entries_view: false,
  entries_bu_view: false,
  business_units_view: false,
  kanban_dev_view: false,
  kanban_dev_create: false,
  kanban_dev_edit: false,
  kanban_dev_delete: false,
  dashboard_dev_view: false,
  developers_view: false,
  developers_create: false,
  developers_edit: false,
  developers_delete: false,
};

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
      // If no explicit permissions exist, return null to use defaults
      if (!data || data.length === 0) return null;
      const map: Record<string, boolean> = {};
      data.forEach(p => { map[p.permission_key] = p.allowed; });
      return map;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const hasPermission = (key: string): boolean => {
    if (isAdmin) return true;
    // If explicit permissions exist, use them; otherwise use defaults
    if (permissions) return permissions[key] === true;
    return DEFAULT_USER_PERMISSIONS[key] === true;
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
  '/kanban-dev': 'kanban_dev',
  '/dashboard-dev': 'dashboard_dev',
  '/developers': 'developers',
  '/digisac-dashboard': 'digisac_dashboard',
};
