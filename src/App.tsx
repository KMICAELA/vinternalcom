import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import FundsPage from "./pages/FundsPage";
import UnderlyingPortfolioPage from "./pages/UnderlyingPortfolioPage";
import DirectsPage from "./pages/DirectsPage";
import ConsolidatedPage from "./pages/ConsolidatedPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import AddQuarterlyData from "./pages/AddQuarterlyData";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/funds" element={<FundsPage />} />
            <Route path="/underlying" element={<UnderlyingPortfolioPage />} />
            <Route path="/directs" element={<DirectsPage />} />
            <Route path="/consolidated" element={<ConsolidatedPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/add-quarterly-data" element={<AddQuarterlyData />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
