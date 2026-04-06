import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Building2, Layers, Briefcase, Target, BarChart3, Settings, ChevronLeft, ChevronRight, CalendarDays, Sparkles, ClipboardCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { cn } from "@/lib/utils";
import ChatWidget from "./ChatWidget";
import LogoMark from "./LogoMark";
import { useQuarterContext } from "@/contexts/QuarterContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/highlights", icon: Sparkles, label: "Highlights" },
  { to: "/funds", icon: Building2, label: "Funds" },
  { to: "/directs", icon: Target, label: "Directs" },
  { to: "/underlying", icon: Layers, label: "Underlying Portfolio" },
  { to: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { to: "/consolidated", icon: BarChart3, label: "TWH Consolidated" },
  { to: "/review", icon: ClipboardCheck, label: "Review" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { selectedQuarter, availableQuarters, setSelectedDate } = useQuarterContext();

  // Pending review count for badge
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending-review-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("staged_fund_extractions")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending_review", "needs_revision"]);
      if (error) return 0;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-screen bg-card border-r border-border flex flex-col z-50 transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <LogoMark size={28} />
              <div>
                <h1 className="text-sm font-semibold text-foreground">TWH Americas</h1>
                <p className="text-[10px] text-muted-foreground">Fund I, LP</p>
              </div>
            </div>
          )}
          {collapsed && <LogoMark size={24} />}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Quarter Selector */}
        {!collapsed ? (
          <div className="px-3 py-3 border-b border-border">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Reporting Period</label>
            <Select value={selectedQuarter.date} onValueChange={setSelectedDate}>
              <SelectTrigger className="h-8 text-xs w-full">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {availableQuarters.map(q => (
                  <SelectItem key={q.date} value={q.date}>{q.quarter}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="px-2 py-3 border-b border-border flex justify-center">
            <span className="text-[10px] font-medium text-muted-foreground">{selectedQuarter.quarter}</span>
          </div>
        )}

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <span className="flex-1">{label}</span>
              )}
              {!collapsed && to === "/review" && pendingCount > 0 && (
                <Badge className="bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] border-0 text-[10px] px-1.5 py-0 h-4 min-w-[1.25rem] flex items-center justify-center">
                  {pendingCount}
                </Badge>
              )}
            </NavLink>
          ))}
        </nav>

        {!collapsed && (
          <div className="p-4 border-t border-border">
            <p className="text-[10px] text-muted-foreground text-center">Portfolio Performance Engine</p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className={cn("flex-1 transition-all duration-200", collapsed ? "ml-16" : "ml-56")}>
        <Outlet />
      </main>

      <ChatWidget />
    </div>
  );
}
