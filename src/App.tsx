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
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { getFirstAllowedPath } from "@/lib/allowedRoutes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children, screen }: { children: React.ReactNode; screen?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { canView, isLoading: permsLoading } = usePermissions();
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  if (authLoading || permsLoading) {
    return <AppLoadingScreen />;
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
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  if (loading || isLoading || permsLoading) {
    return <AppLoadingScreen />;
  }
  if (!isAdmin) return <Navigate to={getFirstAllowedPath(canView)} replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  const { canView, isLoading: permsLoading } = usePermissions();
  if (!user) return <Auth />;
  if (loading || permsLoading) return <AppLoadingScreen />;
  return <Navigate to={getFirstAllowedPath(canView)} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <AuthSessionSync />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/" element={<ProtectedRoute screen="kanban"><Index /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute screen="dashboard"><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard-bu" element={<ProtectedRoute screen="dashboard_bu"><DashboardBU /></ProtectedRoute>} />
            <Route path="/kanban-dashboard" element={<ProtectedRoute screen="kanban_dashboard"><KanbanDashboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute screen="profile_log"><Profile /></ProtectedRoute>} />
            <Route path="/analysts" element={<ProtectedRoute screen="analysts"><Analysts /></ProtectedRoute>} />
            <Route path="/entries" element={<ProtectedRoute screen="entries"><Entries /></ProtectedRoute>} />
            <Route path="/entries-bu" element={<ProtectedRoute screen="entries_bu"><EntriesBU /></ProtectedRoute>} />
            <Route path="/business-units" element={<ProtectedRoute screen="business_units"><BusinessUnits /></ProtectedRoute>} />
            <Route path="/kanban-dev" element={<ProtectedRoute screen="kanban_dev"><KanbanDev /></ProtectedRoute>} />
            <Route path="/dashboard-dev" element={<ProtectedRoute screen="dashboard_dev"><DashboardDev /></ProtectedRoute>} />
            <Route path="/developers" element={<ProtectedRoute screen="developers"><Developers /></ProtectedRoute>} />
            <Route path="/digisac-dashboard" element={<ProtectedRoute screen="digisac_dashboard"><DigisacDashboard /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
