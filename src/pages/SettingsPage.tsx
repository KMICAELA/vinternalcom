import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings, useFunds } from "@/hooks/usePortfolioData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Save, Lock } from "lucide-react";

const QUARTERS = ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26", "2Q26", "3Q26", "4Q26"];
const QUARTER_DATES: Record<string, string> = {
  "1Q24": "2024-03-31", "2Q24": "2024-06-30", "3Q24": "2024-09-30", "4Q24": "2024-12-31",
  "1Q25": "2025-03-31", "2Q25": "2025-06-30", "3Q25": "2025-09-30", "4Q25": "2025-12-31",
  "1Q26": "2026-03-31", "2Q26": "2026-06-30", "3Q26": "2026-09-30", "4Q26": "2026-12-31",
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings = {} } = useAppSettings();
  const { data: funds = [] } = useFunds();

  const activeQuarter = (settings.active_quarter as any) || { quarter: "3Q25", date: "2025-09-30" };
  const [selectedQuarter, setSelectedQuarter] = useState(activeQuarter.quarter);

  const saveActiveQuarter = async () => {
    const date = QUARTER_DATES[selectedQuarter] || "";
    const { error } = await supabase.from("app_settings").upsert(
      { key: "active_quarter", value: { quarter: selectedQuarter, date } as any },
      { onConflict: "key" }
    );
    if (error) { toast.error(error.message); return; }
    toast.success(`Active quarter set to ${selectedQuarter}`);
    qc.invalidateQueries({ queryKey: ["app-settings"] });
  };

  const lockQuarter = async () => {
    const date = QUARTER_DATES[selectedQuarter];
    if (!date) return;
    // Save to quarterly_history as locked
    const { error } = await supabase.from("quarterly_history").upsert(
      { quarter: selectedQuarter, quarter_date: date, locked: true } as any,
      { onConflict: "quarter_date" }
    );
    if (error) { toast.error(error.message); return; }

    // Move to next quarter
    const idx = QUARTERS.indexOf(selectedQuarter);
    if (idx < QUARTERS.length - 1) {
      const next = QUARTERS[idx + 1];
      const nextDate = QUARTER_DATES[next];
      await supabase.from("app_settings").upsert(
        { key: "active_quarter", value: { quarter: next, date: nextDate } as any },
        { onConflict: "key" }
      );
      setSelectedQuarter(next);
    }

    toast.success(`${selectedQuarter} locked. Moved to next quarter.`);
    qc.invalidateQueries({ queryKey: ["app-settings"] });
    qc.invalidateQueries({ queryKey: ["quarterly-history"] });
  };

  return (
    <div className="p-6 max-w-[800px] mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Quarter management & fund configuration</p>
      </div>

      {/* Active Quarter */}
      <div className="border border-border rounded-lg p-6 bg-card space-y-4">
        <h2 className="text-sm font-medium">Active Quarter</h2>
        <div className="flex items-center gap-3">
          <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUARTERS.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">→ {QUARTER_DATES[selectedQuarter] || ''}</span>
          <Button size="sm" onClick={saveActiveQuarter} className="gap-2">
            <Save className="h-3.5 w-3.5" /> Set Active
          </Button>
          <Button size="sm" variant="outline" onClick={lockQuarter} className="gap-2">
            <Lock className="h-3.5 w-3.5" /> Lock & Next
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">All calculations use the active quarter's end date as the reporting date.</p>
      </div>

      {/* Fund List */}
      <div className="border border-border rounded-lg p-6 bg-card space-y-4">
        <h2 className="text-sm font-medium">Fund Registry ({funds.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fund Name</TableHead>
              <TableHead className="text-right">Commitment</TableHead>
              <TableHead>Vintage</TableHead>
              <TableHead>Strategy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {funds.map((f: any) => (
              <TableRow key={f.id} className="text-sm">
                <TableCell className="font-medium">{f.fund_name}</TableCell>
                <TableCell className="text-right font-mono">${Number(f.commitment_amount).toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground">{f.vintage_year || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{f.strategy || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
