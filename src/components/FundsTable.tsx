import { cn } from "@/lib/utils";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

interface FundsTableProps {
  data: any[];
}

const FundsTable = ({ data }: FundsTableProps) => {
  const totalNAV = data.reduce((s, r) => s + Number(r.reported_nav || 0), 0);
  const totalCalled = data.reduce((s, r) => s + Number(r.capital_called_to_date || 0), 0);
  const totalDist = data.reduce((s, r) => s + Number(r.distributions_to_date || 0), 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fund</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Commitment</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Called</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Distributed</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">NAV</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">TVPI</th>
            <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">IRR</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r: any, i: number) => {
            const fund = r.fund || {};
            const called = Number(r.capital_called_to_date || 0);
            const dist = Number(r.distributions_to_date || 0);
            const nav = Number(r.reported_nav || 0);
            const tvpi = called > 0 ? (dist + nav) / called : 0;
            const dpi = called > 0 ? dist / called : 0;
            const rvpi = called > 0 ? nav / called : 0;
            const tvpiValid = called === 0 || Math.abs(tvpi - (dpi + rvpi)) < 0.0001;
            const irr = r.reported_gross_irr;
            return (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{fund.fund_name || "—"}</span>
                    {fund.currency && fund.currency !== "USD" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold uppercase tracking-wide">{fund.currency}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{fund.strategy || ""} · {fund.vintage_year || ""}</div>
                  {!tvpiValid && <div className="text-xs text-destructive mt-0.5">⚠ TVPI ≠ DPI + RVPI</div>}
                </td>
                <td className="p-3 text-right font-mono text-foreground">{fmt(Number(fund.commitment_amount || 0))}</td>
                <td className="p-3 text-right font-mono text-foreground">{fmt(called)}</td>
                <td className="p-3 text-right font-mono text-foreground">{fmt(dist)}</td>
                <td className="p-3 text-right font-mono text-foreground">{fmt(nav)}</td>
                <td className={cn("p-3 text-right font-mono font-medium", called === 0 ? "text-muted-foreground" : tvpi >= 1 ? "text-green-600" : "text-red-500")}>
                  {called === 0 ? <span className="text-[10px] font-normal">Not yet called</span> : `${tvpi.toFixed(2)}x`}
                </td>
                <td className="p-3 text-right font-mono text-muted-foreground">
                  {irr != null ? `${(irr * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted border-t border-border">
            <td className="p-3 font-semibold text-foreground">Total ({data.length} funds)</td>
            <td className="p-3" />
            <td className="p-3 text-right font-mono font-semibold text-foreground">{fmt(totalCalled)}</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">{fmt(totalDist)}</td>
            <td className="p-3 text-right font-mono font-semibold text-foreground">{fmt(totalNAV)}</td>
            <td className="p-3" colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default FundsTable;
