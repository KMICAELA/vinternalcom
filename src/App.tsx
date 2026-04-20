import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { QuarterProvider } from "./contexts/QuarterContext";
import RequireAuth from "./components/RequireAuth";
import AppLayout from "./components/AppLayout";
import Login from "./pages/Login";
import DashboardPage from "./pages/DashboardPage";
import HighlightsPage from "./pages/HighlightsPage";
import FundsPage from "./pages/FundsPage";
import DirectsPage from "./pages/DirectsPage";
import UnderlyingPortfolioPage from "./pages/UnderlyingPortfolioPage";
import PortfolioPage from "./pages/PortfolioPage";
import ConsolidatedPage from "./pages/ConsolidatedPage";
import SettingsPage from "./pages/SettingsPage";
import SharePage from "./pages/SharePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/share/:token" element={<SharePage />} />
            <Route
              element={
                <RequireAuth>
                  <QuarterProvider>
                    <AppLayout />
                  </QuarterProvider>
                </RequireAuth>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/highlights" element={<HighlightsPage />} />
              <Route path="/funds" element={<FundsPage />} />
              <Route path="/directs" element={<DirectsPage />} />
              <Route path="/underlying" element={<UnderlyingPortfolioPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/consolidated" element={<ConsolidatedPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
