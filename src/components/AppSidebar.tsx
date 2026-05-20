import { useEffect, useState, useMemo } from 'react';
import { LayoutDashboard, PenLine, Users, LogOut, Headset, Building2, FileSpreadsheet, BarChart3, UserCircle, Code2, FolderKanban, ChevronDown, GripVertical } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useSignOut } from '@/hooks/useSignOut';
import { usePermissions, ROUTE_SCREEN_MAP } from '@/hooks/usePermissions';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type LeafItem = { id: string; type: 'leaf'; title: string; url: string; icon: any };
type GroupItem = { id: string; type: 'group'; title: string; icon: any; children: LeafItem[] };
type MenuItem = LeafItem | GroupItem;

const DEFAULT_MENU: MenuItem[] = [
  { id: 'kanban', type: 'leaf', title: 'Kanban Pendências', url: '/', icon: LayoutDashboard },
  { id: 'kanban-dashboard', type: 'leaf', title: 'Dashboard Kanban', url: '/kanban-dashboard', icon: BarChart3 },
  { id: 'kanban-dev', type: 'leaf', title: 'Kanban DEV', url: '/kanban-dev', icon: Code2 },
  { id: 'dashboard-dev', type: 'leaf', title: 'Dashboard DEV', url: '/dashboard-dev', icon: BarChart3 },
  { id: 'dashboard', type: 'leaf', title: 'Dashboard Dúvidas', url: '/dashboard', icon: BarChart3 },
  { id: 'dashboard-bu', type: 'leaf', title: 'Dashboard B.U', url: '/dashboard-bu', icon: Building2 },
  { id: 'digisac-dashboard', type: 'leaf', title: 'Dashboard Digisac', url: '/digisac-dashboard', icon: Headset },
  { id: 'entries', type: 'leaf', title: 'Lançamentos Dúvidas', url: '/entries', icon: PenLine },
  { id: 'entries-bu', type: 'leaf', title: 'Lançamentos B.U', url: '/entries-bu', icon: FileSpreadsheet },
  {
    id: 'cadastros',
    type: 'group',
    title: 'Cadastros',
    icon: FolderKanban,
    children: [
      { id: 'analysts', type: 'leaf', title: 'Analistas', url: '/analysts', icon: Users },
      { id: 'developers', type: 'leaf', title: 'Desenvolvedores', url: '/developers', icon: Code2 },
      { id: 'business-units', type: 'leaf', title: 'Unidades', url: '/business-units', icon: Building2 },
    ],
  },
  { id: 'profile', type: 'leaf', title: 'Perfil', url: '/profile', icon: UserCircle },
];

const STORAGE_KEY = 'sidebar-menu-order-v1';

function loadOrder(userId: string | undefined): MenuItem[] {
  if (!userId) return DEFAULT_MENU;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    if (!raw) return DEFAULT_MENU;
    const saved = JSON.parse(raw) as { topIds: string[]; childIds: string[] };
    const byId = new Map<string, MenuItem>(DEFAULT_MENU.map(i => [i.id, i]));
    const ordered: MenuItem[] = [];
    saved.topIds.forEach(id => { const it = byId.get(id); if (it) { ordered.push(it); byId.delete(id); } });
    byId.forEach(it => ordered.push(it));
    // reorder children of cadastros
    const group = ordered.find(i => i.id === 'cadastros') as GroupItem | undefined;
    if (group) {
      const cByDef = DEFAULT_MENU.find(i => i.id === 'cadastros') as GroupItem;
      const childMap = new Map(cByDef.children.map(c => [c.id, c]));
      const newChildren: LeafItem[] = [];
      saved.childIds?.forEach(id => { const c = childMap.get(id); if (c) { newChildren.push(c); childMap.delete(id); } });
      childMap.forEach(c => newChildren.push(c));
      group.children = newChildren;
    }
    return ordered;
  } catch {
    return DEFAULT_MENU;
  }
}

function saveOrder(userId: string, items: MenuItem[]) {
  const topIds = items.map(i => i.id);
  const group = items.find(i => i.id === 'cadastros') as GroupItem | undefined;
  const childIds = group ? group.children.map(c => c.id) : [];
  localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify({ topIds, childIds }));
}

function SortableLeaf({ item, collapsed }: { item: LeafItem; collapsed: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <SidebarMenuItem ref={setNodeRef} style={style}>
      <SidebarMenuButton asChild>
        <NavLink to={item.url} end={item.url === '/'} className="hover:bg-sidebar-accent group" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
          {!collapsed && (
            <span {...attributes} {...listeners} className="cursor-grab opacity-0 group-hover:opacity-60 hover:opacity-100 mr-1" onClick={(e) => e.preventDefault()}>
              <GripVertical className="h-3 w-3" />
            </span>
          )}
          <item.icon className="mr-2 h-4 w-4" />
          {!collapsed && <span>{item.title}</span>}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SortableSubLeaf({ item }: { item: LeafItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `sub:${item.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <SidebarMenuSubItem ref={setNodeRef} style={style}>
      <SidebarMenuSubButton asChild>
        <NavLink to={item.url} className="hover:bg-sidebar-accent group" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
          <span {...attributes} {...listeners} className="cursor-grab opacity-0 group-hover:opacity-60 hover:opacity-100 mr-1" onClick={(e) => e.preventDefault()}>
            <GripVertical className="h-3 w-3" />
          </span>
          <item.icon className="mr-2 h-4 w-4" />
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function SortableGroup({ item, collapsed }: { item: GroupItem; collapsed: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [open, setOpen] = useState(true);
  return (
    <SidebarMenuItem ref={setNodeRef} style={style}>
      <Collapsible open={open} onOpenChange={setOpen} className="w-full">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="hover:bg-sidebar-accent group w-full">
            {!collapsed && (
              <span {...attributes} {...listeners} className="cursor-grab opacity-0 group-hover:opacity-60 hover:opacity-100 mr-1" onClick={(e) => e.stopPropagation()}>
                <GripVertical className="h-3 w-3" />
              </span>
            )}
            <item.icon className="mr-2 h-4 w-4" />
            {!collapsed && <span className="flex-1 text-left">{item.title}</span>}
            {!collapsed && <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        {!collapsed && (
          <CollapsibleContent>
            <SidebarMenuSub>
              <SortableContext items={item.children.map(c => `sub:${c.id}`)} strategy={verticalListSortingStrategy}>
                {item.children.map(c => <SortableSubLeaf key={c.id} item={c} />)}
              </SortableContext>
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </Collapsible>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { user } = useAuth();
  const signOut = useSignOut();
  const { canView, isLoading: permsLoading } = usePermissions();
  const [items, setItems] = useState<MenuItem[]>(DEFAULT_MENU);

  useEffect(() => { setItems(loadOrder(user?.id)); }, [user?.id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const visibleItems = useMemo(() => {
    if (permsLoading) return [];
    return items
      .map(item => {
        if (item.type === 'group') {
          const children = item.children.filter(c => {
            const screen = ROUTE_SCREEN_MAP[c.url];
            return !screen || canView(screen);
          });
          if (children.length === 0) return null;
          return { ...item, children };
        }
        const screen = ROUTE_SCREEN_MAP[item.url];
        if (screen && !canView(screen)) return null;
        return item;
      })
      .filter(Boolean) as MenuItem[];
  }, [items, canView, permsLoading]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !user) return;
    const aId = String(active.id);
    const oId = String(over.id);

    // sub items inside cadastros
    if (aId.startsWith('sub:') && oId.startsWith('sub:')) {
      const next = items.map(i => {
        if (i.id !== 'cadastros' || i.type !== 'group') return i;
        const oldIdx = i.children.findIndex(c => `sub:${c.id}` === aId);
        const newIdx = i.children.findIndex(c => `sub:${c.id}` === oId);
        if (oldIdx < 0 || newIdx < 0) return i;
        return { ...i, children: arrayMove(i.children, oldIdx, newIdx) };
      });
      setItems(next);
      saveOrder(user.id, next);
      return;
    }

    // top-level
    const oldIdx = items.findIndex(i => i.id === aId);
    const newIdx = items.findIndex(i => i.id === oId);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    setItems(next);
    saveOrder(user.id, next);
  };

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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SidebarMenu>
                <SortableContext items={visibleItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  {visibleItems.map(item =>
                    item.type === 'group'
                      ? <SortableGroup key={item.id} item={item} collapsed={collapsed} />
                      : <SortableLeaf key={item.id} item={item} collapsed={collapsed} />
                  )}
                </SortableContext>
              </SidebarMenu>
            </DndContext>
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
