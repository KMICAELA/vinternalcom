import { cn } from "@/lib/utils";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

interface Transaction {
  id: string;
  company_name: string;
  fund_name: string;
  status: string | null;
  transaction_date: string | null;
  instrument: string | null;
  round: string | null;
  investment_cost: number;
  fmv: number;
  proceeds: number;
  twh_pct: number;
  twh_cost: number;
  twh_fmv: number;
  twh_proceeds: number;
}

const UnderlyingPortfolioTable = ({ data }: { data: Transaction[] }) => {
  const sorted = [...data].sort((a, b) => {
    const cmp = a.company_name.localeCompare(b.company_name);
    if (cmp !== 0) return cmp;
    return (a.transaction_date || "").localeCompare(b.transaction_date || "");
  });

  const totals = sorted.reduce(
    (acc, t) => ({
      investment_cost: acc.investment_cost + Number(t.investment_cost),
      fmv: acc.fmv + Number(t.fmv),
      proceeds: acc.proceeds + Number(t.proceeds),
      twh_cost: acc.twh_cost + Number(t.twh_cost),
      twh_fmv: acc.twh_fmv + Number(t.twh_fmv),
      twh_proceeds: acc.twh_proceeds + Number(t.twh_proceeds),
    }),
    { investment_cost: 0, fmv: 0, proceeds: 0, twh_cost: 0, twh_fmv: 0, twh_proceeds: 0 }
  );

  const moic = (cost: number, fmv: number) => (cost > 0 ? fmv / cost : 0);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "2-digit" });
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Company</th>
            <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fund</th>
            <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
            <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
            <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Instrument</th>
            <th className="text-left p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Round</th>
            <th className="text-right p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Inv. Cost</th>
            <th className="text-right p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">FMV</th>
            <th className="text-right p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">MOIC</th>
            <th className="text-right p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH %</th>
            <th className="text-right p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH Cost</th>
            <th className="text-right p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH FMV</th>
            <th className="text-right p-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH MOIC</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const ic = Number(t.investment_cost);
            const f = Number(t.fmv);
            const tc = Number(t.twh_cost);
            const tf = Number(t.twh_fmv);
            const m = moic(ic, f);
            const tm = moic(tc, tf);
            return (
              <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                <td className="p-2 font-medium text-foreground whitespace-nowrap">{t.company_name}</td>
                <td className="p-2 text-muted-foreground text-xs whitespace-nowrap">{t.fund_name}</td>
                <td className="p-2">
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    t.status === "Active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                    t.status === "Write-off" ? "bg-destructive/10 text-destructive" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {t.status || "—"}
                  </span>
                </td>
                <td className="p-2 text-muted-foreground text-xs whitespace-nowrap">{formatDate(t.transaction_date)}</td>
                <td className="p-2 text-muted-foreground text-xs">{t.instrument || "—"}</td>
                <td className="p-2 text-muted-foreground text-xs">{t.round || "—"}</td>
                <td className="p-2 text-right font-mono text-xs text-muted-foreground">{ic > 0 ? fmt(ic) : "—"}</td>
                <td className="p-2 text-right font-mono text-xs text-muted-foreground">{f > 0 ? fmt(f) : "—"}</td>
                <td className={cn("p-2 text-right font-mono text-xs font-medium", ic > 0 ? (m >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive") : "text-muted-foreground")}>
                  {ic > 0 ? `${m.toFixed(2)}x` : "—"}
                </td>
                <td className="p-2 text-right font-mono text-xs text-muted-foreground">{Number(t.twh_pct) > 0 ? pct(Number(t.twh_pct)) : "—"}</td>
                <td className="p-2 text-right font-mono text-xs text-foreground">{tc > 0 ? fmt(tc) : "—"}</td>
                <td className="p-2 text-right font-mono text-xs text-foreground">{tf > 0 ? fmt(tf) : "—"}</td>
                <td className={cn("p-2 text-right font-mono text-xs font-medium", tc > 0 ? (tm >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive") : "text-muted-foreground")}>
                  {tc > 0 ? `${tm.toFixed(2)}x` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted border-t border-border">
            <td className="p-2 font-semibold text-foreground" colSpan={6}>Total ({sorted.length} transactions)</td>
            <td className="p-2 text-right font-mono font-semibold text-muted-foreground">{fmt(totals.investment_cost)}</td>
            <td className="p-2 text-right font-mono font-semibold text-muted-foreground">{fmt(totals.fmv)}</td>
            <td className={cn("p-2 text-right font-mono font-semibold", moic(totals.investment_cost, totals.fmv) >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {totals.investment_cost > 0 ? `${moic(totals.investment_cost, totals.fmv).toFixed(2)}x` : "—"}
            </td>
            <td className="p-2"></td>
            <td className="p-2 text-right font-mono font-semibold text-foreground">{fmt(totals.twh_cost)}</td>
            <td className="p-2 text-right font-mono font-semibold text-foreground">{fmt(totals.twh_fmv)}</td>
            <td className={cn("p-2 text-right font-mono font-semibold", moic(totals.twh_cost, totals.twh_fmv) >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {totals.twh_cost > 0 ? `${moic(totals.twh_cost, totals.twh_fmv).toFixed(2)}x` : "—"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default UnderlyingPortfolioTable;
