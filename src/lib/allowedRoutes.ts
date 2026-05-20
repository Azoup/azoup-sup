/** Ordem de prioridade da “home” após login (primeira rota com *_view permitido). */
export const ROUTE_PRIORITY: ReadonlyArray<{ path: string; screen: string }> = [
  { path: '/', screen: 'kanban' },
  { path: '/kanban-dashboard', screen: 'kanban_dashboard' },
  { path: '/kanban-dev', screen: 'kanban_dev' },
  { path: '/dashboard-dev', screen: 'dashboard_dev' },
  { path: '/dashboard', screen: 'dashboard' },
  { path: '/dashboard-bu', screen: 'dashboard_bu' },
  { path: '/digisac-dashboard', screen: 'digisac_dashboard' },
  { path: '/entries', screen: 'entries' },
  { path: '/entries-bu', screen: 'entries_bu' },
  { path: '/analysts', screen: 'analysts' },
  { path: '/developers', screen: 'developers' },
  { path: '/business-units', screen: 'business_units' },
  { path: '/profile', screen: 'profile_log' },
];

export function getFirstAllowedPath(canView: (screen: string) => boolean): string {
  for (const { path, screen } of ROUTE_PRIORITY) {
    if (canView(screen)) return path;
  }
  return '/profile';
}
