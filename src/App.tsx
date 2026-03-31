import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
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
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useRole();
  if (loading || isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard-bu" element={<ProtectedRoute><DashboardBU /></ProtectedRoute>} />
            <Route path="/kanban-dashboard" element={<ProtectedRoute><KanbanDashboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/analysts" element={<AdminRoute><Analysts /></AdminRoute>} />
            <Route path="/entries" element={<AdminRoute><Entries /></AdminRoute>} />
            <Route path="/entries-bu" element={<AdminRoute><EntriesBU /></AdminRoute>} />
            <Route path="/business-units" element={<AdminRoute><BusinessUnits /></AdminRoute>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
