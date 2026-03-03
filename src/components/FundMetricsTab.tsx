import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, TrendingUp, DollarSign, BarChart3 } from "lucide-react";
import { toast } from "sonner";

interface Quarter {
  id: string;
  label: string;
  sort_order: number;
}

interface FundMetric {
  id: string;
  quarter_id: string;
  contribution: number;
  distribution: number;
  nav: number;
}

interface FundMetricsTabProps {
  quarters: Quarter[];
  selectedQuarterId: string;
}

function useFundMetrics() {
  return useQuery({
    queryKey: ["fund_metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fund_metrics")
        .select("*")
        .order("quarter_id");
      if (error) throw error;
      return data as FundMetric[];
    },
  });
}

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatMultiple(val: number): string {
  return `${val.toFixed(2)}x`;
}

function formatPercent(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

/** Newton's method IRR from net cash flows. Cash flows are [CF0, CF1, ...] */
function calcIRR(cashFlows: number[], maxIter = 100, tol = 1e-7): number | null {
  if (cashFlows.length < 2) return null;
  let rate = 0.1;
  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const disc = Math.pow(1 + rate, t);
      npv += cashFlows[t] / disc;
      dnpv -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(dnpv) < 1e-12) return null;
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < tol) return newRate;
    rate = newRate;
    if (rate < -1) return null;
  }
  return null;
}

const FundMetricsTab = ({ quarters, selectedQuarterId }: FundMetricsTabProps) => {
  const queryClient = useQueryClient();
  const { data: allMetrics = [], isLoading } = useFundMetrics();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ quarterId: "", contribution: "", distribution: "", nav: "" });

  // Map quarter_id → quarter for sorting and labeling
  const quarterMap = useMemo(() => {
    const m: Record<string, Quarter> = {};
    quarters.forEach((q) => (m[q.id] = q));
    return m;
  }, [quarters]);

  // Sort metrics by quarter sort_order
  const sortedMetrics = useMemo(() => {
    return [...allMetrics].sort((a, b) => {
      const qa = quarterMap[a.quarter_id];
      const qb = quarterMap[b.quarter_id];
      return (qa?.sort_order ?? 0) - (qb?.sort_order ?? 0);
    });
  }, [allMetrics, quarterMap]);

  // Cumulative calculations
  const cumulativeData = useMemo(() => {
    let cumContrib = 0;
    let cumDistrib = 0;
    return sortedMetrics.map((m) => {
      cumContrib += Number(m.contribution);
      cumDistrib += Number(m.distribution);
      const tvpi = cumContrib > 0 ? (Number(m.nav) + cumDistrib) / cumContrib : 0;
      return {
        ...m,
        cumContribution: cumContrib,
        cumDistribution: cumDistrib,
        tvpi,
      };
    });
  }, [sortedMetrics]);

  // Net IRR from cash flow series: contributions are negative, distributions + final NAV are positive
  const netIRR = useMemo(() => {
    if (cumulativeData.length === 0) return null;
    const cashFlows = cumulativeData.map((m, i) => {
      const cf = -Number(m.contribution) + Number(m.distribution);
      // Add NAV to last period as terminal value
      if (i === cumulativeData.length - 1) return cf + Number(m.nav);
      return cf;
    });
    return calcIRR(cashFlows);
  }, [cumulativeData]);

  // Current quarter metrics
  const currentMetric = cumulativeData.find((m) => m.quarter_id === selectedQuarterId);

  // Quarters that don't have metrics yet (for the add form)
  const availableQuarters = quarters.filter(
    (q) => !allMetrics.some((m) => m.quarter_id === q.id) || (editingId && allMetrics.find((m) => m.id === editingId)?.quarter_id === q.id)
  );

  const upsertMutation = useMutation({
    mutationFn: async (data: { id?: string; quarter_id: string; contribution: number; distribution: number; nav: number }) => {
      if (data.id) {
        const { error } = await supabase.from("fund_metrics").update({
          contribution: data.contribution,
          distribution: data.distribution,
          nav: data.nav,
          updated_at: new Date().toISOString(),
        }).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fund_metrics").insert({
          quarter_id: data.quarter_id,
          contribution: data.contribution,
          distribution: data.distribution,
          nav: data.nav,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund_metrics"] });
      toast.success(editingId ? "Metrics updated" : "Metrics added");
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fund_metrics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund_metrics"] });
      toast.success("Metrics deleted");
    },
  });

  const resetForm = () => {
    setForm({ quarterId: "", contribution: "", distribution: "", nav: "" });
    setEditingId(null);
    setDialogOpen(false);
  };

  const openEdit = (m: FundMetric) => {
    setEditingId(m.id);
    setForm({
      quarterId: m.quarter_id,
      contribution: String(m.contribution),
      distribution: String(m.distribution),
      nav: String(m.nav),
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const contrib = parseFloat(form.contribution);
    const distrib = parseFloat(form.distribution);
    const nav = parseFloat(form.nav);
    if (!form.quarterId || isNaN(contrib) || isNaN(nav)) {
      toast.error("Please fill in required fields");
      return;
    }
    upsertMutation.mutate({
      id: editingId || undefined,
      quarter_id: form.quarterId,
      contribution: contrib,
      distribution: isNaN(distrib) ? 0 : distrib,
      nav,
    });
  };

  if (isLoading) {
    return <p className="text-muted-foreground text-center py-8">Loading metrics...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Cumulative Contributions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold font-mono text-foreground">
              {currentMetric ? formatCurrency(currentMetric.cumContribution) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Cumulative Distributions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold font-mono text-foreground">
              {currentMetric ? formatCurrency(currentMetric.cumDistribution) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Net TVPI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold font-mono ${currentMetric && currentMetric.tvpi >= 1 ? "text-[hsl(var(--positive))]" : "text-[hsl(var(--negative))]"}`}>
              {currentMetric ? formatMultiple(currentMetric.tvpi) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Net IRR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold font-mono ${netIRR !== null && netIRR >= 0 ? "text-[hsl(var(--positive))]" : "text-[hsl(var(--negative))]"}`}>
              {netIRR !== null ? formatPercent(netIRR) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-base font-semibold text-foreground">Quarterly Net Cash Flows</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Quarter
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Metrics" : "Add Quarterly Metrics"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Quarter</Label>
                  <Select value={form.quarterId} onValueChange={(v) => setForm((f) => ({ ...f, quarterId: v }))} disabled={!!editingId}>
                    <SelectTrigger><SelectValue placeholder="Select quarter" /></SelectTrigger>
                    <SelectContent>
                      {availableQuarters.map((q) => (
                        <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Contribution ($)</Label>
                  <Input type="number" placeholder="0" value={form.contribution} onChange={(e) => setForm((f) => ({ ...f, contribution: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Distribution ($)</Label>
                  <Input type="number" placeholder="0" value={form.distribution} onChange={(e) => setForm((f) => ({ ...f, distribution: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>NAV ($)</Label>
                  <Input type="number" placeholder="0" value={form.nav} onChange={(e) => setForm((f) => ({ ...f, nav: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button onClick={handleSubmit}>{editingId ? "Update" : "Add"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">Quarter</TableHead>
                <TableHead className="text-right text-muted-foreground">Contribution</TableHead>
                <TableHead className="text-right text-muted-foreground">Distribution</TableHead>
                <TableHead className="text-right text-muted-foreground">NAV</TableHead>
                <TableHead className="text-right text-muted-foreground">Cum. Contrib.</TableHead>
                <TableHead className="text-right text-muted-foreground">Cum. Distrib.</TableHead>
                <TableHead className="text-right text-muted-foreground">Net TVPI</TableHead>
                <TableHead className="text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cumulativeData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No metrics yet. Click "Add Quarter" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                cumulativeData.map((m) => (
                  <TableRow key={m.id} className="border-border table-row-hover">
                    <TableCell className="font-medium text-foreground">{quarterMap[m.quarter_id]?.label ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">{formatCurrency(Number(m.contribution))}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">{formatCurrency(Number(m.distribution))}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">{formatCurrency(Number(m.nav))}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(m.cumContribution)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(m.cumDistribution)}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${m.tvpi >= 1 ? "text-[hsl(var(--positive))]" : "text-[hsl(var(--negative))]"}`}>
                      {formatMultiple(m.tvpi)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(m.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default FundMetricsTab;
