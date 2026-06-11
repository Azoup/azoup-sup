import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AppRealtimeSync } from '@/components/AppRealtimeSync';
import { DigisacSlaSyncRunner } from '@/components/DigisacSlaSyncRunner';
import { NotificationsBell } from '@/components/NotificationsBell';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppRealtimeSync />
      <DigisacSlaSyncRunner />
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <SidebarTrigger />
            <NotificationsBell />
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

