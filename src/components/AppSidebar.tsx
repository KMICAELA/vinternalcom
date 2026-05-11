import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  Briefcase,
  Target,
  Layers,
  Building2,
  Wallet,
  Inbox,
  Settings,
  ShieldCheck,
  FlaskConical,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import LogoMark from "@/components/LogoMark";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Highlights", url: "/highlights", icon: Sparkles },
  { title: "Funds", url: "/funds", icon: Briefcase },
  { title: "Directs", url: "/directs", icon: Target },
  { title: "Underlying Portfolio", url: "/underlying", icon: Layers },
  { title: "Portfolio", url: "/portfolio", icon: Building2 },
  { title: "TWH Consolidated", url: "/consolidated", icon: Wallet },
  { title: "Reports", url: "/reports", icon: Inbox },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const { role } = useAuth();
  const navItems =
    role === "admin"
      ? [
          ...items,
          { title: "Reconciliation", url: "/admin/reconciliation", icon: ShieldCheck },
          { title: "Extraction Sandbox", url: "/admin/extraction-sandbox", icon: FlaskConical },
          { title: "Cleanup", url: "/admin/cleanup", icon: Trash2 },
        ]
      : items;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className={`flex items-center gap-2 px-4 py-4 ${collapsed ? "justify-center" : ""}`}>
          <LogoMark size={24} />
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">TWH-1 Portfolio</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Internal Tool
              </div>
            </div>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active =
                  item.url === "/"
                    ? currentPath === "/"
                    : currentPath === item.url || currentPath.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink to={item.url} end={item.url === "/"}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
