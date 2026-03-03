import { cn } from "@/lib/utils";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

interface DirectsTableProps {
  data: any[];
}

const DirectsTable = ({ data }: DirectsTableProps) => {
  const totalCost = data.reduce((s, d) => s + Number(d.company?.cost_basis || 0), 0);
  const totalFMV = data.reduce((s, d) => s + Number(d.current_valuation || 0), 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Company</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Strategy</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Cost</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">FMV</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">MOIC</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Co-Investors</th>
          </tr>
        </thead>
        <tbody>
          {data.map((dv: any, i: number) => {
            const co = dv.company || {};
            const cost = Number(co.cost_basis || 0);
            const fmv = Number(dv.current_valuation || 0);
            const moic = cost > 0 ? fmv / cost : 0;
            return (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                <td className="p-3 font-medium text-foreground">{co.company_name || "—"}</td>
                <td className="p-3 text-muted-foreground">{co.strategy || "—"}</td>
                <td className="p-3 text-right font-mono text-foreground">{fmt(cost)}</td>
                <td className="p-3 text-right font-mono text-foreground">{fmt(fmv)}</td>
                <td className={cn("p-3 text-right font-mono font-medium", moic >= 1 ? "text-green-600" : "text-red-500")}>
                  {moic.toFixed(2)}x
                </td>
                <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{co.co_investors || "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted border-t border-border">
            <td className="p-3 font-semibold text-foreground" colSpan={2}>Total ({data.length} investments)</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">{fmt(totalCost)}</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">{fmt(totalFMV)}</td>
            <td className={cn("p-3 text-right font-mono font-semibold", totalCost > 0 && totalFMV / totalCost >= 1 ? "text-green-600" : "text-red-500")}>
              {totalCost > 0 ? (totalFMV / totalCost).toFixed(2) : "0.00"}x
            </td>
            <td className="p-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default DirectsTable;
