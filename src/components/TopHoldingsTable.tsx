import { topUnderlyingHoldings, formatCurrency } from "@/data/portfolioData";
import { cn } from "@/lib/utils";

const TopHoldingsTable = () => {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 border-b border-border">
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Company</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fund</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Round</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fund FMV</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">MOIC</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH Cost</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH FMV</th>
          </tr>
        </thead>
        <tbody>
          {topUnderlyingHoldings.map((h, i) => {
            const moicVal = parseFloat(h.moic.replace("x", ""));
            return (
              <tr key={i} className="table-row-hover border-b border-border/50">
                <td className="p-3 font-medium text-foreground">{h.company}</td>
                <td className="p-3 text-sm text-muted-foreground">{h.fund}</td>
                <td className="p-3">
                  <span className="inline-block rounded-md bg-surface-3 px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    {h.round}
                  </span>
                </td>
                <td className="p-3 text-right font-mono text-sm text-foreground">{formatCurrency(h.fmv, true)}</td>
                <td className={cn("p-3 text-right font-mono text-sm font-medium", moicVal >= 1 ? "text-positive" : "text-negative")}>
                  {h.moic}
                </td>
                <td className="p-3 text-right font-mono text-sm text-muted-foreground">{formatCurrency(h.twhCost, true)}</td>
                <td className="p-3 text-right font-mono text-sm text-foreground">{formatCurrency(h.twhFMV, true)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TopHoldingsTable;
