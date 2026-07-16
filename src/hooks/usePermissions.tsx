import { useAuth } from '@/hooks/useAuth';
import { useUserAccess, useAccessReady } from '@/hooks/useUserAccess';
import { isPermissionAllowed } from '@/lib/fetchUserAccess';

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
  digisac_sla_history_view: false,
  digisac_nps_view: false,
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
  const accessReady = useAccessReady();
  const { data } = useUserAccess();

  const userId = user?.id;
  if (!userId) {
    return {
      permissions: {},
      isLoading: false,
      hasPermission: () => false,
      canView: () => false,
    };
  }

  const isAdmin = accessReady && data?.role === 'admin';
  const permissions = accessReady ? (data?.permissions ?? null) : null;
  const isLoading = !accessReady;

  const hasPermission = (key: string): boolean => {
    if (!accessReady) return false;
    if (isAdmin) return true;
    if (permissions) return isPermissionAllowed(permissions[key]);
    return DEFAULT_USER_PERMISSIONS[key] === true;
  };

  const canView = (screen: string): boolean => hasPermission(`${screen}_view`);

  return {
    permissions: permissions || {},
    isLoading,
    hasPermission,
    canView,
  };
}

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
  '/digisac-sla-history': 'digisac_sla_history',
  '/digisac-nps': 'digisac_nps',
};
