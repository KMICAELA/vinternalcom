import { cn } from "@/lib/utils";

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
}

const UnderlyingPortfolioTable = ({ data }: { data: Holding[] }) => {
  const sorted = [...data].sort((a, b) => Number(b.twh_fmv) - Number(a.twh_fmv));
  const totalCost = sorted.reduce((s, h) => s + Number(h.twh_cost), 0);
  const totalFMV = sorted.reduce((s, h) => s + Number(h.twh_fmv), 0);

  return (
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
                <td className={cn("p-3 text-right font-mono font-medium", cost > 0 ? (moic >= 1 ? "text-green-600" : "text-red-500") : "text-muted-foreground")}>
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
            <td className={cn("p-3 text-right font-mono font-semibold", totalCost > 0 && totalFMV / totalCost >= 1 ? "text-green-600" : "text-red-500")}>
              {totalCost > 0 ? (totalFMV / totalCost).toFixed(2) : "0.00"}x
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default UnderlyingPortfolioTable;
