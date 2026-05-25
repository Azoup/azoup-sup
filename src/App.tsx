import { useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AuthSessionSync } from "@/components/AuthSessionSync";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Analysts from "./pages/Analysts";
import Entries from "./pages/Entries";
import EntriesBU from "./pages/EntriesBU";
import BusinessUnits from "./pages/BusinessUnits";
import Dashboard from "./pages/Dashboard";
import DashboardBU from "./pages/DashboardBU";
import KanbanDashboard from "./pages/KanbanDashboard";
import KanbanDev from "./pages/KanbanDev";
import DashboardDev from "./pages/DashboardDev";
import Developers from "./pages/Developers";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import DigisacDashboard from "./pages/DigisacDashboard";
import { getFirstAllowedPath } from "@/lib/allowedRoutes";
import { buildAuthPath } from "@/lib/authPaths";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

function useHadAuthenticatedUser(user: ReturnType<typeof useAuth>['user']) {
  const hadUserRef = useRef(false);
  if (user) hadUserRef.current = true;
  return hadUserRef.current;
}

function RequireAuth({ children, screen }: { children: React.ReactNode; screen?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { canView, isLoading: permsLoading } = usePermissions();
  const hadUser = useHadAuthenticatedUser(user);

  if (authLoading || permsLoading || (!user && hadUser)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={buildAuthPath()} replace />;
  }

  if (screen && !canView(screen)) {
    return <Navigate to={getFirstAllowedPath(canView)} replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useRole();
  const { canView, isLoading: permsLoading } = usePermissions();
  const hadUser = useHadAuthenticatedUser(user);

  if (loading || isLoading || permsLoading || (!user && hadUser)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={buildAuthPath()} replace />;
  }

  if (!isAdmin) return <Navigate to={getFirstAllowedPath(canView)} replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  const { canView, isLoading: permsLoading } = usePermissions();
  const hadUser = useHadAuthenticatedUser(user);

  if (loading || permsLoading || (hadUser && !user)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={getFirstAllowedPath(canView)} replace />;
  }

  return <Auth />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthRoute />} />
      <Route path="/" element={<RequireAuth screen="kanban"><Index /></RequireAuth>} />
      <Route path="/dashboard" element={<RequireAuth screen="dashboard"><Dashboard /></RequireAuth>} />
      <Route path="/dashboard-bu" element={<RequireAuth screen="dashboard_bu"><DashboardBU /></RequireAuth>} />
      <Route path="/kanban-dashboard" element={<RequireAuth screen="kanban_dashboard"><KanbanDashboard /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth screen="profile_log"><Profile /></RequireAuth>} />
      <Route path="/analysts" element={<RequireAuth screen="analysts"><Analysts /></RequireAuth>} />
      <Route path="/entries" element={<RequireAuth screen="entries"><Entries /></RequireAuth>} />
      <Route path="/entries-bu" element={<RequireAuth screen="entries_bu"><EntriesBU /></RequireAuth>} />
      <Route path="/business-units" element={<RequireAuth screen="business_units"><BusinessUnits /></RequireAuth>} />
      <Route path="/kanban-dev" element={<RequireAuth screen="kanban_dev"><KanbanDev /></RequireAuth>} />
      <Route path="/dashboard-dev" element={<RequireAuth screen="dashboard_dev"><DashboardDev /></RequireAuth>} />
      <Route path="/developers" element={<RequireAuth screen="developers"><Developers /></RequireAuth>} />
      <Route path="/digisac-dashboard" element={<RequireAuth screen="digisac_dashboard"><DigisacDashboard /></RequireAuth>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AuthSessionSync />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
