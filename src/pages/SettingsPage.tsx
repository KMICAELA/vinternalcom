import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import FxRatesSection from "@/components/settings/FxRatesSection";

const SettingsPage = () => {
  const { user, role } = useAuth();
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setUserCount(count ?? 0));
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          User roles, taxonomy, FX rates, and LP share links.
        </p>
      </div>

      <Card className="p-6 bg-card border-border">
        <h2 className="text-sm font-medium text-foreground mb-4">Your account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-mono text-xs">{user?.email}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Role</span>
            <Badge variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total users</span>
            <span className="font-mono text-xs">{userCount ?? "—"}</span>
          </div>
        </div>
      </Card>

      <FxRatesSection />

      <Card className="p-6 bg-card border-border">
        <h2 className="text-sm font-medium text-foreground mb-2">Coming soon</h2>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
          <li>Users &amp; roles management (invite, promote, revoke)</li>
          <li>FX rates audit log &amp; auto-fetch (ECB / Frankfurter)</li>
          <li>Taxonomy editor (regions, themes, industries, SDGs, instruments, rounds)</li>
          <li>LP share token management</li>
        </ul>
      </Card>
    </div>
  );
};

export default SettingsPage;
