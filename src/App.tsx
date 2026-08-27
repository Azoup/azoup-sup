import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, Outlet, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AuthSessionSync } from "@/components/AuthSessionSync";
import { usePermissions, ROUTE_SCREEN_MAP } from "@/hooks/usePermissions";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Analysts from "./pages/Analysts";
import Entries from "./pages/Entries";
import BusinessUnits from "./pages/BusinessUnits";
import Dashboard from "./pages/Dashboard";
import DashboardBU from "./pages/DashboardBU";
import ContactRecurrence from "./pages/ContactRecurrence";
import KanbanDashboard from "./pages/KanbanDashboard";
import KanbanDev from "./pages/KanbanDev";
import KanbanConfec from "./pages/KanbanConfec";
import DashboardDev from "./pages/DashboardDev";
import Developers from "./pages/Developers";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import DigisacDashboard from "./pages/DigisacDashboard";
import DigisacNpsDashboard from "./pages/DigisacNpsDashboard";
import DigisacSlaHistory from "./pages/DigisacSlaHistory";
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

function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Layout persistente: o menu não desmonta a cada clique de rota. */
function ProtectedLayout() {
  const { user, loading: authLoading } = useAuth();
  const { canView, isLoading: permsLoading } = usePermissions();
  const location = useLocation();

  if (authLoading || permsLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to={buildAuthPath()} replace />;
  }

  const screen = ROUTE_SCREEN_MAP[location.pathname];
  if (screen && !canView(screen)) {
    return <Navigate to={getFirstAllowedPath(canView)} replace />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  const { canView, isLoading: permsLoading } = usePermissions();

  if (loading || permsLoading) {
    return <FullPageSpinner />;
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
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Index />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard-bu" element={<DashboardBU />} />
        <Route path="/recorrencia-contatos" element={<ContactRecurrence />} />
        <Route path="/kanban-dashboard" element={<KanbanDashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/analysts" element={<Analysts />} />
        <Route path="/entries" element={<Entries />} />
        <Route path="/entries-bu" element={<Navigate to="/dashboard-bu" replace />} />
        <Route path="/business-units" element={<BusinessUnits />} />
        <Route path="/kanban-dev" element={<KanbanDev />} />
        <Route path="/kanban-confec" element={<KanbanConfec />} />
        <Route path="/dashboard-dev" element={<DashboardDev />} />
        <Route path="/developers" element={<Developers />} />
        <Route path="/digisac-dashboard" element={<DigisacDashboard />} />
        <Route path="/digisac-nps" element={<DigisacNpsDashboard />} />
        <Route path="/digisac-sla-history" element={<DigisacSlaHistory />} />
      </Route>
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
