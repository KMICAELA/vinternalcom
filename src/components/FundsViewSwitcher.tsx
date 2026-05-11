import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function FundsViewSwitcher() {
  const tab = (active: boolean) =>
    cn(
      "px-3 py-1.5 text-sm rounded-md transition-colors",
      active
        ? "bg-card text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
      <NavLink to="/funds" end className={({ isActive }) => tab(isActive)}>
        Funds
      </NavLink>
      <NavLink to="/underlying" className={({ isActive }) => tab(isActive)}>
        Underlying Portfolio
      </NavLink>
    </div>
  );
}
