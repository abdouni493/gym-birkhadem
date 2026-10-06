import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { RequirePermission } from "@/components/RequirePermission";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Athletes } from "@/pages/Athletes";
import { Products } from "@/pages/Products";
import { Clients } from "@/pages/Clients";
import { Suppliers } from "@/pages/Suppliers";
import { PurchaseInvoices } from "@/pages/PurchaseInvoices";
import { Subscriptions } from "@/pages/Subscriptions";
import { Invoices } from "@/pages/Invoices";
import { POS } from "@/pages/POS";
import { Scanner } from "@/pages/Scanner";
import { Workers } from "@/pages/Workers";
import { Expenses } from "@/pages/Expenses";
import { Caisse } from "@/pages/Caisse";
import { Reports } from "@/pages/Reports";
import { Settings } from "@/pages/Settings";
import { CustomerDisplay } from "@/pages/CustomerDisplay";
import NotFound from "./pages/NotFound";
import { nextPath } from "@/lib/utils";

const queryClient = new QueryClient();

const LoadingScreen = () => (
  <div className="min-h-screen bg-gym-black flex items-center justify-center">
    <div className="text-center">
      <div className="w-16 h-16 bg-gold-gradient rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl font-bold text-gym-black">G</span>
      </div>
      <div className="w-8 h-8 border-2 border-gym-gold border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p className="text-gym-gold/60 mt-4">Chargement…</p>
    </div>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <LoadingScreen />;
  if (!user) {
    const next = location.pathname === "/dashboard" ? "" : `?next=${encodeURIComponent(location.pathname)}`;
    return <Navigate to={`/login${next}`} replace />;
  }
  return <>{children}</>;
};

/**
 * A page behind both sign-in and an interface permission.
 * `interfaceKey` must match a key in src/lib/permissions.ts.
 */
const Page = ({ interfaceKey, children }: { interfaceKey: string; children: React.ReactNode }) => (
  <ProtectedRoute>
    <RequirePermission interfaceKey={interfaceKey}>
      <Layout>{children}</Layout>
    </RequirePermission>
  </ProtectedRoute>
);

const AppRoutes = () => {
  const { user, isLoading, language } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;

  return (
    <Routes key={language}>
      <Route path="/login" element={user ? <Navigate to={nextPath(location.search)} replace /> : <Login />} />
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />

      <Route path="/dashboard"          element={<Page interfaceKey="dashboard"><Dashboard /></Page>} />
      <Route path="/athletes"           element={<Page interfaceKey="athletes"><Athletes /></Page>} />
      {/* Add/edit now happen in-page via dialogs; keep old links working. */}
      <Route path="/athletes/add"       element={<Navigate to="/athletes" replace />} />
      <Route path="/athletes/edit/:id"  element={<Navigate to="/athletes" replace />} />
      <Route path="/products"           element={<Page interfaceKey="products"><Products /></Page>} />
      <Route path="/clients"            element={<Page interfaceKey="clients"><Clients /></Page>} />
      <Route path="/suppliers"          element={<Page interfaceKey="suppliers"><Suppliers /></Page>} />
      <Route path="/purchase-invoices"  element={<Page interfaceKey="purchase_invoices"><PurchaseInvoices /></Page>} />
      <Route path="/subscriptions"      element={<Page interfaceKey="subscriptions"><Subscriptions /></Page>} />
      <Route path="/invoices"           element={<Page interfaceKey="invoices"><Invoices /></Page>} />
      <Route path="/pos"                element={<Page interfaceKey="pos"><POS /></Page>} />
      <Route path="/scanner"            element={<Page interfaceKey="scanner"><Scanner /></Page>} />
      <Route path="/workers"            element={<Page interfaceKey="workers"><Workers /></Page>} />
      <Route path="/expenses"           element={<Page interfaceKey="expenses"><Expenses /></Page>} />
      <Route path="/caisse"             element={<Page interfaceKey="caisse"><Caisse /></Page>} />
      <Route path="/reports"            element={<Page interfaceKey="reports"><Reports /></Page>} />
      <Route path="/settings"           element={<Page interfaceKey="settings"><Settings /></Page>} />
      <Route path="/cards"              element={<Navigate to="/athletes" replace />} />

      {/* Customer-facing screen: any signed-in staff account, no sidebar/header. */}
      <Route path="/display"            element={<ProtectedRoute><CustomerDisplay /></ProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
