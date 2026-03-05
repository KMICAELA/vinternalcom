import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDirectInvestments } from "@/hooks/usePortfolioData";
import { formatCurrency, formatMultiple } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
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
  const { data: directs = [], isLoading } = useDirectInvestments();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [newDirect, setNewDirect] = useState({
    company_name: "", investment_date: "", instrument: "SAFE", round: "Seed",
    cost_basis: 0, ownership_percentage: 0, co_investors: "", strategy: "",
  });

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
    setEditingId(d.id);
    setEditData({ ...d });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { id, created_at, updated_at, ...rest } = editData;
    const { error } = await supabase.from("direct_investments").update(rest).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["direct-investments"] });
    setEditingId(null);
  };

  const totals = directs.reduce((acc: any, d: any) => ({
    cost: acc.cost + Number(d.cost_basis),
    // FMV and proceeds would come from quarterly valuations — simplified here
  }), { cost: 0 });

  // Summary cards
  const totalCost = directs.reduce((s: number, d: any) => s + Number(d.cost_basis), 0);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Direct Co-Investments</h1>
          <p className="text-sm text-muted-foreground">TWH direct investments — manually managed</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-3.5 w-3.5" /> Add Direct
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Invested", value: formatCurrency(totalCost) },
          { label: "Total FMV", value: "—" },
          { label: "Total Proceeds", value: "—" },
          { label: "Blended MOIC", value: "—" },
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
              <TableHead>Co-Investors</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {directs.map((d: any) => {
              const isEditing = editingId === d.id;
              const data = isEditing ? editData : d;
              const days = d.investment_date ? Math.floor((Date.now() - new Date(d.investment_date).getTime()) / 86400000) : 0;

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
                      : formatCurrency(Number(d.cost_basis))}
                  </TableCell>
                  <TableCell>
                    {isEditing ? <Input className="h-7 text-xs" value={data.co_investors || ""}
                      onChange={e => setEditData({ ...data, co_investors: e.target.value })} />
                      : <span className="text-muted-foreground">{d.co_investors || '—'}</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{days || '—'}</TableCell>
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
