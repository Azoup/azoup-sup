import { LayoutDashboard, PenLine, Users, LogOut, Headset, Building2, FileSpreadsheet, BarChart3, UserCircle } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const allItems = [
  { title: 'Kanban Pendências', url: '/', icon: LayoutDashboard, adminOnly: false },
  { title: 'Dashboard Kanban', url: '/kanban-dashboard', icon: BarChart3, adminOnly: false },
  { title: 'Dashboard Dúvidas', url: '/dashboard', icon: BarChart3, adminOnly: false },
  { title: 'Dashboard B.U', url: '/dashboard-bu', icon: Building2, adminOnly: false },
  { title: 'Lançamentos Dúvidas', url: '/entries', icon: PenLine, adminOnly: true },
  { title: 'Lançamentos B.U', url: '/entries-bu', icon: FileSpreadsheet, adminOnly: true },
  { title: 'Analistas', url: '/analysts', icon: Users, adminOnly: true },
  { title: 'Unidades', url: '/business-units', icon: Building2, adminOnly: true },
  { title: 'Perfil', url: '/profile', icon: UserCircle, adminOnly: false },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, user } = useAuth();
  const { isAdmin } = useRole();

  const items = allItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center shrink-0">
            <Headset className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && <span className="font-heading text-lg font-bold text-sidebar-foreground">Suporte</span>}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === '/'} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && user && (
          <p className="px-4 text-xs text-sidebar-foreground/60 truncate mb-1">{user.email}</p>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="hover:bg-sidebar-accent text-sidebar-foreground/70">
              <LogOut className="mr-2 h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
