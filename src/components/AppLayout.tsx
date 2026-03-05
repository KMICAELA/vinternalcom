import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Building2, Layers, Briefcase, Target, BarChart3, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import ChatWidget from "./ChatWidget";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/funds", icon: Building2, label: "Funds" },
  { to: "/directs", icon: Target, label: "Directs" },
  { to: "/underlying", icon: Layers, label: "Underlying Portfolio" },
  { to: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { to: "/consolidated", icon: BarChart3, label: "TWH Consolidated" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

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
            <div>
              <h1 className="text-sm font-semibold text-foreground">TWH Americas</h1>
              <p className="text-[10px] text-muted-foreground">Fund I, LP</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

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
              {!collapsed && <span>{label}</span>}
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
