import { directInvestments, formatCurrency } from "@/data/portfolioData";

const DirectsTable = () => {
  const totalCost = directInvestments.reduce((s, d) => s + d.cost, 0);
  const totalFMV = directInvestments.reduce((s, d) => s + d.fmv, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 border-b border-border">
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Company</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Round</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Cost</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">FMV</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">MOIC</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Co-Investors</th>
          </tr>
        </thead>
        <tbody>
          {directInvestments.map((inv, i) => (
            <tr key={i} className="table-row-hover border-b border-border/50">
              <td className="p-3 font-medium text-foreground">{inv.company}</td>
              <td className="p-3 font-mono text-sm text-muted-foreground">{inv.date}</td>
              <td className="p-3">
                <span className="inline-block rounded-md bg-surface-3 px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {inv.instrument}
                </span>
              </td>
              <td className="p-3 text-sm text-muted-foreground">{inv.round}</td>
              <td className="p-3 text-right font-mono text-sm text-foreground">{formatCurrency(inv.cost, true)}</td>
              <td className="p-3 text-right font-mono text-sm text-foreground">{formatCurrency(inv.fmv, true)}</td>
              <td className="p-3 text-right font-mono text-sm text-foreground">{inv.moic}</td>
              <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{inv.coInvestors}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-2 border-t border-border">
            <td className="p-3 font-semibold text-foreground" colSpan={4}>Total ({directInvestments.length} investments)</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">{formatCurrency(totalCost, true)}</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">{formatCurrency(totalFMV, true)}</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">1.00x</td>
            <td className="p-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default DirectsTable;
