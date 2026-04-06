import { useState, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings, useFunds } from "@/hooks/usePortfolioData";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, Lock, ArrowRight, AlertTriangle, Database, Loader2, CheckCircle2 } from "lucide-react";
import { QUARTER_REGISTRY } from "@/data/quarterRegistry.legacy";

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
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  const activeQuarter = (settings.active_quarter as any) || { quarter: "3Q25", date: "2025-09-30" };
  const [selectedQuarter, setSelectedQuarter] = useState(activeQuarter.quarter);

  // Check if current quarter is locked
  const { data: quarterHistory = [] } = useQuery({
    queryKey: ["quarterly-history"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quarterly_history").select("*").order("quarter_date");
      if (error) throw error;
      return data || [];
    },
  });

  const isCurrentLocked = quarterHistory.some((q: any) => q.quarter === activeQuarter.quarter && q.locked);

  const nextQuarterLabel = useMemo(() => {
    const idx = QUARTERS.indexOf(activeQuarter.quarter);
    return idx < QUARTERS.length - 1 ? QUARTERS[idx + 1] : null;
  }, [activeQuarter.quarter]);

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

  const advanceToNextQuarter = async () => {
    if (!nextQuarterLabel) return;
    const nextDate = QUARTER_DATES[nextQuarterLabel];

    // Set next quarter as active
    const { error } = await supabase.from("app_settings").upsert(
      { key: "active_quarter", value: { quarter: nextQuarterLabel, date: nextDate } as any },
      { onConflict: "key" }
    );
    if (error) { toast.error(error.message); return; }

    setSelectedQuarter(nextQuarterLabel);
    setAdvanceModalOpen(false);
    toast.success(`Advanced to ${nextQuarterLabel}. All fund FS statuses reset to Pending.`);
    qc.invalidateQueries({ queryKey: ["app-settings"] });
    qc.invalidateQueries({ queryKey: ["quarterly-history"] });
  };

  return (
    <div className="p-6 max-w-[800px] mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Quarter management & fund configuration</p>
      </div>

      {/* Quarter Management */}
      <div className="border border-border rounded-lg p-6 bg-card space-y-5">
        <h2 className="text-sm font-medium">Quarter Management</h2>

        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border rounded-lg p-4 bg-muted/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Active Quarter</p>
            <p className="text-lg font-semibold font-mono mt-1">{activeQuarter.quarter}</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-muted/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Quarter End Date</p>
            <p className="text-lg font-semibold font-mono mt-1">{activeQuarter.date}</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-muted/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</p>
            <p className="text-lg font-semibold mt-1">
              {isCurrentLocked ? (
                <span className="text-[hsl(var(--positive))] flex items-center gap-1.5">
                  <Lock className="h-4 w-4" /> Locked
                </span>
              ) : (
                <span className="text-[hsl(var(--warning))]">In Progress</span>
              )}
            </p>
          </div>
        </div>

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
        </div>

        {/* Advance to Next Quarter */}
        {isCurrentLocked && nextQuarterLabel && (
          <div className="border border-[hsl(var(--gold))]/30 rounded-lg p-4 bg-[hsl(var(--gold))]/5 space-y-2">
            <p className="text-sm font-medium text-foreground">
              {activeQuarter.quarter} is locked. Ready to advance?
            </p>
            <p className="text-xs text-muted-foreground">
              This will set <strong>{nextQuarterLabel}</strong> as the new active quarter. All fund FS upload statuses will reset to "Pending" for the new period. Historical data is preserved.
            </p>
            <Button
              size="sm"
              onClick={() => setAdvanceModalOpen(true)}
              className="gap-2 bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90"
            >
              <ArrowRight className="h-3.5 w-3.5" /> Advance to {nextQuarterLabel}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">All calculations use the active quarter's end date as the reporting date.</p>
      </div>

      {/* Quarterly History */}
      <div className="border border-border rounded-lg p-6 bg-card space-y-4">
        <h2 className="text-sm font-medium">Quarterly History</h2>
        {quarterHistory.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarter</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Net TVPI</TableHead>
                <TableHead className="text-right">Gross TVPI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quarterHistory.map((q: any) => (
                <TableRow key={q.id} className="text-sm">
                  <TableCell className="font-medium">{q.quarter}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{q.quarter_date}</TableCell>
                  <TableCell className="text-center">
                    {q.locked ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--positive))]/20 text-[hsl(var(--positive))] font-medium">Locked</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Draft</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{Number(q.net_tvpi).toFixed(2)}x</TableCell>
                  <TableCell className="text-right font-mono">{Number(q.gross_tvpi).toFixed(2)}x</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No quarters locked yet. Lock a quarter from the Funds tab to create a historical data point.</p>
        )}
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

      {/* Advance Quarter Confirmation Modal */}
      <Dialog open={advanceModalOpen} onOpenChange={setAdvanceModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advance to {nextQuarterLabel}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>Set <strong>{nextQuarterLabel}</strong> as the new active quarter</li>
              <li>All fund FS upload statuses will reset to "Pending"</li>
              <li>All historical data and locked snapshots remain intact</li>
            </ul>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/20">
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] shrink-0" />
              <p className="text-xs text-[hsl(var(--warning))]">Make sure all {activeQuarter.quarter} data has been reviewed before advancing.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceModalOpen(false)}>Cancel</Button>
            <Button
              onClick={advanceToNextQuarter}
              className="gap-2 bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90"
            >
              <ArrowRight className="h-3.5 w-3.5" /> Advance to {nextQuarterLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
