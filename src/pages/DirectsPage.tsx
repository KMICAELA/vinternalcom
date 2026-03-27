import { useState, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDirectInvestments, useActiveQuarter } from "@/hooks/usePortfolioData";
import { getQuarterData } from "@/data/quarterRegistry";
import { formatCurrency, formatMultiple } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const INSTRUMENTS = ["SAFE", "Note", "Pref. Equity", "Common Equity", "SPV"];
const ROUNDS = ["Pre-Seed", "Seed", "A", "B", "C+"];

export default function DirectsPage() {
  const qc = useQueryClient();
  const activeQuarter = useActiveQuarter();
  const { data: directs = [], isLoading } = useDirectInvestments();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [newDirect, setNewDirect] = useState({
    company_name: "", investment_date: "", instrument: "SAFE", round: "Seed",
    cost_basis: 0, ownership_percentage: 0, co_investors: "", strategy: "",
  });

  // Fetch valuations for active quarter
  const { data: valuations = [] } = useQuery({
    queryKey: ["direct-valuations", activeQuarter.date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_quarterly_valuations")
        .select("*")
        .eq("quarter_date", activeQuarter.date);
      if (error) throw error;
      return data || [];
    },
  });

  // Build valuation map: company_id → { fmv, proceeds }
  const valMap = new Map<string, { fmv: number; proceeds: number }>();
  for (const v of valuations) {
    valMap.set(v.company_id, { fmv: Number(v.current_valuation || 0), proceeds: Number(v.realized_proceeds_this_quarter || 0) });
  }

  const handleAdd = async () => {
    if (!newDirect.company_name) return;
    const { error } = await supabase.from("direct_investments").insert(newDirect);
    if (error) { toast.error(error.message); return; }
    toast.success("Direct investment added");
    qc.invalidateQueries({ queryKey: ["direct-investments"] });
    setAddOpen(false);
    setNewDirect({ company_name: "", investment_date: "", instrument: "SAFE", round: "Seed", cost_basis: 0, ownership_percentage: 0, co_investors: "", strategy: "" });
  };

  const startEdit = (d: any) => {
    const val = valMap.get(d.id);
    setEditingId(d.id);
    setEditData({ ...d, current_fmv: val?.fmv ?? 0, current_proceeds: val?.proceeds ?? 0 });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { id, created_at, updated_at, current_fmv, current_proceeds, ...rest } = editData;
    const { error } = await supabase.from("direct_investments").update(rest).eq("id", editingId);
    if (error) { toast.error(error.message); return; }

    // Upsert valuation for active quarter
    const { error: valErr } = await supabase.from("direct_quarterly_valuations").upsert({
      company_id: editingId,
      quarter_date: activeQuarter.date,
      current_valuation: current_fmv || 0,
      realized_proceeds_this_quarter: current_proceeds || 0,
    }, { onConflict: "company_id,quarter_date" } as any);
    if (valErr) console.error("Valuation upsert error:", valErr);

    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["direct-investments"] });
    qc.invalidateQueries({ queryKey: ["direct-valuations"] });
    setEditingId(null);
  };

  // Filter directs by quarter
  const activeDirects = useMemo(() => {
    return directs.filter((d: any) => {
      if (!d.investment_date) return false;
      return d.investment_date <= activeQuarter.date;
    });
  }, [directs, activeQuarter.date]);

  const totalCost = activeDirects.reduce((s: number, d: any) => s + Number(d.cost_basis), 0);
  const totalFmv = activeDirects.reduce((s: number, d: any) => s + (valMap.get(d.id)?.fmv || 0), 0);
  const totalProceeds = activeDirects.reduce((s: number, d: any) => s + (valMap.get(d.id)?.proceeds || 0), 0);
  const blendedMoic = totalCost > 0 ? (totalFmv + totalProceeds) / totalCost : 0;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Direct Co-Investments</h1>
          <p className="text-sm text-muted-foreground">TWH direct investments · {activeQuarter.quarter}</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-3.5 w-3.5" /> Add Direct
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Invested", value: formatCurrency(totalCost) },
          { label: "Total FMV", value: totalFmv > 0 ? formatCurrency(totalFmv) : "—" },
          { label: "Total Proceeds", value: totalProceeds > 0 ? formatCurrency(totalProceeds) : "—" },
          { label: "Blended MOIC", value: blendedMoic > 0 ? formatMultiple(blendedMoic) : "—" },
        ].map(c => (
          <div key={c.label} className="border border-border rounded-lg p-4 bg-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className="text-lg font-mono font-semibold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-1 text-xs">
              <TableHead>Company</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Instrument</TableHead>
              <TableHead>Round</TableHead>
              <TableHead className="text-right">TWH Cost</TableHead>
              <TableHead className="text-right">FMV</TableHead>
              <TableHead className="text-right">Proceeds</TableHead>
              <TableHead className="text-right">MOIC</TableHead>
              <TableHead>Co-Investors</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeDirects.map((d: any) => {
              const isEditing = editingId === d.id;
              const data = isEditing ? editData : d;
              const val = valMap.get(d.id);
              const fmv = isEditing ? (editData.current_fmv || 0) : (val?.fmv || 0);
              const proceeds = isEditing ? (editData.current_proceeds || 0) : (val?.proceeds || 0);
              const cost = Number(data.cost_basis || 0);
              const moic = cost > 0 ? (fmv + proceeds) / cost : 0;

              return (
                <TableRow key={d.id} className="text-xs table-row-hover">
                  <TableCell>
                    {isEditing ? <Input className="h-7 text-xs" value={data.company_name}
                      onChange={e => setEditData({ ...data, company_name: e.target.value })} />
                      : <span className="font-medium">{d.company_name}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? <Input type="date" className="h-7 text-xs w-32" value={data.investment_date || ""}
                      onChange={e => setEditData({ ...data, investment_date: e.target.value })} />
                      : <span className="text-muted-foreground">{d.investment_date || '—'}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Select value={data.instrument || ""} onValueChange={v => setEditData({ ...data, instrument: v })}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>{INSTRUMENTS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span className="text-muted-foreground">{d.instrument || '—'}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Select value={data.round || ""} onValueChange={v => setEditData({ ...data, round: v })}>
                        <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROUNDS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span className="text-muted-foreground">{d.round || '—'}</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {isEditing ? <Input type="number" className="h-7 text-xs w-28 text-right" value={data.cost_basis}
                      onChange={e => setEditData({ ...data, cost_basis: Number(e.target.value) })} />
                      : formatCurrency(cost)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {isEditing ? <Input type="number" className="h-7 text-xs w-28 text-right" value={editData.current_fmv || 0}
                      onChange={e => setEditData({ ...editData, current_fmv: Number(e.target.value) })} />
                      : (fmv > 0 ? formatCurrency(fmv) : '—')}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {isEditing ? <Input type="number" className="h-7 text-xs w-28 text-right" value={editData.current_proceeds || 0}
                      onChange={e => setEditData({ ...editData, current_proceeds: Number(e.target.value) })} />
                      : (proceeds > 0 ? formatCurrency(proceeds) : '—')}
                  </TableCell>
                  <TableCell className={cn("text-right font-mono font-medium", moic >= 1 ? "text-positive" : "text-negative")}>
                    {moic > 0 ? formatMultiple(moic) : '—'}
                  </TableCell>
                  <TableCell>
                    {isEditing ? <Input className="h-7 text-xs" value={data.co_investors || ""}
                      onChange={e => setEditData({ ...data, co_investors: e.target.value })} />
                      : <span className="text-muted-foreground">{d.co_investors || '—'}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <button onClick={saveEdit} className="text-positive"><Save className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(d)} className="text-muted-foreground hover:text-foreground">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Direct Investment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Company Name</label>
              <Input value={newDirect.company_name} onChange={e => setNewDirect(p => ({ ...p, company_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Investment Date</label>
              <Input type="date" value={newDirect.investment_date} onChange={e => setNewDirect(p => ({ ...p, investment_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Instrument</label>
                <Select value={newDirect.instrument} onValueChange={v => setNewDirect(p => ({ ...p, instrument: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INSTRUMENTS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Round</label>
                <Select value={newDirect.round} onValueChange={v => setNewDirect(p => ({ ...p, round: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROUNDS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">TWH Cost ($)</label>
              <Input type="number" value={newDirect.cost_basis} onChange={e => setNewDirect(p => ({ ...p, cost_basis: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Co-Investors</label>
              <Input value={newDirect.co_investors} onChange={e => setNewDirect(p => ({ ...p, co_investors: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAdd}>Add Investment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
