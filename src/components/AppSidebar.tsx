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
  ChevronRight,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import LogoMark from "@/components/LogoMark";

type Leaf = { title: string; url: string; icon: any };
type Group = { title: string; icon: any; basePaths: string[]; children: Leaf[] };
type Item = Leaf | Group;

const items: Item[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Highlights", url: "/highlights", icon: Sparkles },
  { title: "Directs", url: "/directs", icon: Target },
  {
    title: "Funds",
    icon: Briefcase,
    basePaths: ["/funds", "/underlying"],
    children: [
      { title: "Funds", url: "/funds", icon: Briefcase },
      { title: "Underlying Portfolio", url: "/underlying", icon: Layers },
    ],
  },
  { title: "Portfolio", url: "/portfolio", icon: Building2 },
  { title: "TWH Consolidated", url: "/consolidated", icon: Wallet },
  { title: "Reports", url: "/reports", icon: Inbox },
  { title: "Settings", url: "/settings", icon: Settings },
];

const adminItems: Item[] = [
  { title: "Reconciliation", url: "/admin/reconciliation", icon: ShieldCheck },
  { title: "Extraction Sandbox", url: "/admin/extraction-sandbox", icon: FlaskConical },
  { title: "Cleanup", url: "/admin/cleanup", icon: Trash2 },
];

function isGroup(i: Item): i is Group {
  return (i as Group).children !== undefined;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const { role } = useAuth();
  const navItems: Item[] = role === "admin" ? [...items, ...adminItems] : items;

  const isUrlActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath === url || currentPath.startsWith(url + "/");

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
                if (!isGroup(item)) {
                  const active = isUrlActive(item.url);
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
                }

                const groupActive = item.basePaths.some((p) => isUrlActive(p));

                if (collapsed) {
                  // Show parent as link to first child when collapsed
                  const first = item.children[0];
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={groupActive}>
                        <NavLink to={first.url}>
                          <item.icon className="h-4 w-4" />
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <Collapsible key={item.title} defaultOpen={groupActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={groupActive}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.title}>
                              <SidebarMenuSubButton asChild isActive={isUrlActive(child.url)}>
                                <NavLink to={child.url}>
                                  <child.icon className="h-3.5 w-3.5" />
                                  <span>{child.title}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
