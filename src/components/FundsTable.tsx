import { fundHoldings, formatCurrency } from "@/data/portfolioData";
import { cn } from "@/lib/utils";

const parseMultiplier = (v: string) => parseFloat(v.replace("x", ""));
const parsePercent = (v: string) => parseFloat(v.replace("%", ""));

const MultiplierCell = ({ value }: { value: string }) => {
  const n = parseMultiplier(value);
  return (
    <span className={cn("font-mono text-sm", n >= 1 ? "text-positive" : "text-negative")}>
      {value}
    </span>
  );
};

const IRRCell = ({ value }: { value: string }) => {
  const n = parsePercent(value);
  return (
    <span className={cn("font-mono text-sm", n >= 0 ? "text-positive" : "text-negative")}>
      {value}
    </span>
  );
};

const FundsTable = () => {
  const totalCommitment = fundHoldings.reduce((s, f) => s + f.twhCommitment, 0);
  const totalContributions = fundHoldings.reduce((s, f) => s + f.twhContributions, 0);
  const totalNAV = fundHoldings.reduce((s, f) => s + f.twhNAV, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 border-b border-border">
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fund</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Commitment</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Contributed</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">NAV</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">PIC</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">TVPI</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">MOIC</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">IRR</th>
          </tr>
        </thead>
        <tbody>
          {fundHoldings.map((fund, i) => (
            <tr key={i} className="table-row-hover border-b border-border/50">
              <td className="p-3">
                <div className="font-medium text-foreground text-sm">{fund.name}</div>
                <div className="text-xs text-muted-foreground">{fund.twhPercent} ownership · {fund.startDate}</div>
              </td>
              <td className="p-3 text-right font-mono text-sm text-foreground">{formatCurrency(fund.twhCommitment, true)}</td>
              <td className="p-3 text-right font-mono text-sm text-foreground">{formatCurrency(fund.twhContributions, true)}</td>
              <td className="p-3 text-right font-mono text-sm text-foreground">{formatCurrency(fund.twhNAV, true)}</td>
              <td className="p-3 text-right"><MultiplierCell value={fund.pic} /></td>
              <td className="p-3 text-right"><MultiplierCell value={fund.tvpi} /></td>
              <td className="p-3 text-right"><MultiplierCell value={fund.moic} /></td>
              <td className="p-3 text-right"><IRRCell value={fund.irr} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-2 border-t border-border">
            <td className="p-3 font-semibold text-foreground">Total ({fundHoldings.length} funds)</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">{formatCurrency(totalCommitment, true)}</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">{formatCurrency(totalContributions, true)}</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">{formatCurrency(totalNAV, true)}</td>
            <td className="p-3 text-right font-mono font-semibold text-muted-foreground">0.51x</td>
            <td className="p-3 text-right font-mono font-semibold text-positive">1.42x</td>
            <td className="p-3" />
            <td className="p-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default FundsTable;
