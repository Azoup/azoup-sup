/** Ordem de prioridade da “home” após login (primeira rota com *_view permitido). */
export const ROUTE_PRIORITY: ReadonlyArray<{ path: string; screen: string }> = [
  { path: '/', screen: 'kanban' },
  { path: '/kanban-dashboard', screen: 'kanban_dashboard' },
  { path: '/kanban-dev', screen: 'kanban_dev' },
  { path: '/kanban-confec', screen: 'kanban_confec' },
  { path: '/dashboard-dev', screen: 'dashboard_dev' },
  { path: '/dashboard', screen: 'dashboard' },
  { path: '/dashboard-bu', screen: 'dashboard_bu' },
  { path: '/recorrencia-contatos', screen: 'dashboard_bu' },
  { path: '/digisac-dashboard', screen: 'digisac_dashboard' },
  { path: '/digisac-sla-history', screen: 'digisac_sla_history' },
  { path: '/digisac-nps', screen: 'digisac_nps' },
  { path: '/entries', screen: 'entries' },
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
