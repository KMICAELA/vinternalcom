import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Save, X, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

interface Holding {
  id: string;
  company_name: string;
  sector: string | null;
  region: string | null;
  twh_cost: number;
  twh_fmv: number;
  type: string | null;
  quarter_date?: string;
}

interface EditRow {
  id: string;
  company_name: string;
  sector: string;
  region: string;
  twh_cost: string;
  twh_fmv: string;
  type: string;
  isNew?: boolean;
}

const toEditRow = (h: Holding): EditRow => ({
  id: h.id,
  company_name: h.company_name,
  sector: h.sector || "",
  region: h.region || "",
  twh_cost: String(h.twh_cost || 0),
  twh_fmv: String(h.twh_fmv || 0),
  type: h.type || "",
});

const InventoryTable = ({ data, quarterDate }: { data: Holding[]; quarterDate?: string }) => {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const qc = useQueryClient();
  const { toast } = useToast();

  const sorted = [...data].sort((a, b) => Number(b.twh_fmv) - Number(a.twh_fmv));
  const totalCost = sorted.reduce((s, h) => s + Number(h.twh_cost), 0);
  const totalFMV = sorted.reduce((s, h) => s + Number(h.twh_fmv), 0);

  const startEditing = () => {
    setRows(sorted.map(toEditRow));
    setDeletedIds([]);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setRows([]);
    setDeletedIds([]);
  };

  const updateRow = (idx: number, field: keyof EditRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        company_name: "",
        sector: "",
        region: "",
        twh_cost: "0",
        twh_fmv: "0",
        type: "",
        isNew: true,
      },
    ]);
  };

  const removeRow = (idx: number) => {
    const row = rows[idx];
    if (!row.isNew) setDeletedIds((prev) => [...prev, row.id]);
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!quarterDate) return;
    setSaving(true);
    try {
      // Delete removed rows
      for (const id of deletedIds) {
        const { error } = await supabase.from("underlying_portfolio_holdings").delete().eq("id", id);
        if (error) throw error;
      }

      // Upsert existing and insert new
      for (const row of rows) {
        const payload = {
          company_name: row.company_name,
          sector: row.sector || null,
          region: row.region || null,
          twh_cost: Number(row.twh_cost) || 0,
          twh_fmv: Number(row.twh_fmv) || 0,
          type: row.type || null,
          quarter_date: quarterDate,
        };

        if (row.isNew) {
          const { error } = await supabase.from("underlying_portfolio_holdings").insert(payload);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("underlying_portfolio_holdings").update(payload).eq("id", row.id);
          if (error) throw error;
        }
      }

      qc.invalidateQueries({ queryKey: ["underlying-portfolio"] });
      toast({ title: "Saved", description: "Underlying portfolio updated." });
      setEditing(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // EDIT MODE
  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Editing Underlying Portfolio</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" /> Add Company
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Company</th>
                <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Sector</th>
                <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Region</th>
                <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
                <th className="text-right p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH Cost</th>
                <th className="text-right p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH FMV</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border/50">
                  <td className="p-1.5"><Input value={row.company_name} onChange={(e) => updateRow(idx, "company_name", e.target.value)} className="h-8 text-sm" placeholder="Company name" /></td>
                  <td className="p-1.5"><Input value={row.sector} onChange={(e) => updateRow(idx, "sector", e.target.value)} className="h-8 text-sm" placeholder="Sector" /></td>
                  <td className="p-1.5"><Input value={row.region} onChange={(e) => updateRow(idx, "region", e.target.value)} className="h-8 text-sm" placeholder="Region" /></td>
                  <td className="p-1.5"><Input value={row.type} onChange={(e) => updateRow(idx, "type", e.target.value)} className="h-8 text-sm" placeholder="Type" /></td>
                  <td className="p-1.5"><Input type="number" value={row.twh_cost} onChange={(e) => updateRow(idx, "twh_cost", e.target.value)} className="h-8 text-sm text-right" /></td>
                  <td className="p-1.5"><Input type="number" value={row.twh_fmv} onChange={(e) => updateRow(idx, "twh_fmv", e.target.value)} className="h-8 text-sm text-right" /></td>
                  <td className="p-1.5">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeRow(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // VIEW MODE
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={startEditing}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Company</th>
              <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Sector</th>
              <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Region</th>
              <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH Cost</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH FMV</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">MOIC</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const cost = Number(h.twh_cost);
              const fmv = Number(h.twh_fmv);
              const moic = cost > 0 ? fmv / cost : 0;
              return (
                <tr key={h.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                  <td className="p-3 font-medium text-foreground">{h.company_name}</td>
                  <td className="p-3 text-muted-foreground">{h.sector || "—"}</td>
                  <td className="p-3 text-muted-foreground">{h.region || "—"}</td>
                  <td className="p-3">
                    {h.type && (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        h.type === 'Deep Tech' ? "bg-primary/10 text-primary" :
                        h.type === 'Tech Enabled' ? "bg-accent/50 text-accent-foreground" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {h.type}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono text-foreground">{cost > 0 ? fmt(cost) : "—"}</td>
                  <td className="p-3 text-right font-mono text-foreground">{fmv > 0 ? fmt(fmv) : "—"}</td>
                  <td className={cn("p-3 text-right font-mono font-medium", cost > 0 ? (moic >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive") : "text-muted-foreground")}>
                    {cost > 0 ? `${moic.toFixed(2)}x` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted border-t border-border">
              <td className="p-3 font-semibold text-foreground" colSpan={4}>Total ({sorted.length} companies)</td>
              <td className="p-3 text-right font-mono font-semibold text-foreground">{fmt(totalCost)}</td>
              <td className="p-3 text-right font-mono font-semibold text-foreground">{fmt(totalFMV)}</td>
              <td className={cn("p-3 text-right font-mono font-semibold", totalCost > 0 && totalFMV / totalCost >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {totalCost > 0 ? (totalFMV / totalCost).toFixed(2) : "0.00"}x
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default InventoryTable;
