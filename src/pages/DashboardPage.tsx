import { useEffect, useState } from "react";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { fmtUSD, fmtMultiple, calcTvpi, calcDpi } from "@/lib/format";
import { Briefcase, Target, TrendingUp, Wallet } from "lucide-react";

type Totals = {
  twh_contributions: number;
  twh_distributions: number;
  twh_nav: number;
  twh_directs_fmv: number;
  twh_directs_cost: number;
  twh_directs_proceeds: number;
  fund_count: number;
  direct_count: number;
};

const empty: Totals = {
  twh_contributions: 0, twh_distributions: 0, twh_nav: 0,
  twh_directs_fmv: 0, twh_directs_cost: 0, twh_directs_proceeds: 0,
  fund_count: 0, direct_count: 0,
};

const KpiCard = ({ label, value, sub, icon: Icon }: {
  label: string; value: string; sub?: string; icon: React.ComponentType<{ className?: string }>;
}) => (
  <Card className="p-5 bg-card border-border">
    <div className="flex items-start justify-between">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <Icon className="h-4 w-4 text-primary/60" />
    </div>
    <div className="mt-2 text-2xl font-semibold font-mono">{value}</div>
    {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
  </Card>
);

export default function DashboardPage() {
  const { selected, loading: qLoading } = useSelectedQuarter();
  const [totals, setTotals] = useState<Totals>(empty);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    (async () => {
      const [fundSnaps, directSnaps, directs, funds] = await Promise.all([
        supabase.from("fund_quarter_snapshots").select("twh_contributions_usd, twh_distributions_usd, twh_nav_usd").eq("quarter_id", selected.id),
        supabase.from("direct_quarter_snapshots").select("twh_fmv_usd, twh_proceeds_usd, direct_id").eq("quarter_id", selected.id),
        supabase.from("directs").select("id, twh_cost_usd"),
        supabase.from("funds").select("id", { count: "exact", head: true }).eq("archived", false),
      ]);
      const f = fundSnaps.data ?? [];
      const ds = directSnaps.data ?? [];
      const dCost = new Map((directs.data ?? []).map((d) => [d.id, Number(d.twh_cost_usd)]));
      const directIds = new Set(ds.map((d) => d.direct_id));
      const t: Totals = {
        twh_contributions: f.reduce((s, x) => s + Number(x.twh_contributions_usd), 0),
        twh_distributions: f.reduce((s, x) => s + Number(x.twh_distributions_usd), 0),
        twh_nav: f.reduce((s, x) => s + Number(x.twh_nav_usd), 0),
        twh_directs_fmv: ds.reduce((s, x) => s + Number(x.twh_fmv_usd), 0),
        twh_directs_proceeds: ds.reduce((s, x) => s + Number(x.twh_proceeds_usd), 0),
        twh_directs_cost: Array.from(directIds).reduce((s, id) => s + (dCost.get(id) ?? 0), 0),
        fund_count: funds.count ?? 0,
        direct_count: directIds.size,
      };
      setTotals(t);
      setLoading(false);
    })();
  }, [selected]);

  if (qLoading || !selected) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const totalContrib = totals.twh_contributions + totals.twh_directs_cost;
  const totalDistrib = totals.twh_distributions + totals.twh_directs_proceeds;
  const totalValue = totals.twh_nav + totals.twh_directs_fmv;
  const tvpi = calcTvpi(totalContrib, totalDistrib, totalValue);
  const dpi = calcDpi(totalContrib, totalDistrib);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          TWH Americas Fund I · {selected.label} · {selected.status === "final" ? "Final" : "Draft"}
        </p>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading metrics…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="TWH Total Value" value={fmtUSD(totalValue, { compact: true })} sub={`NAV ${fmtUSD(totals.twh_nav, { compact: true })} + Directs FMV ${fmtUSD(totals.twh_directs_fmv, { compact: true })}`} icon={Wallet} />
            <KpiCard label="TWH Contributions" value={fmtUSD(totalContrib, { compact: true })} sub={`Funds ${fmtUSD(totals.twh_contributions, { compact: true })} + Directs ${fmtUSD(totals.twh_directs_cost, { compact: true })}`} icon={TrendingUp} />
            <KpiCard label="TVPI" value={fmtMultiple(tvpi)} sub={`DPI ${fmtMultiple(dpi)}`} icon={TrendingUp} />
            <KpiCard label="Portfolio" value={`${totals.fund_count} funds · ${totals.direct_count} directs`} icon={Briefcase} />
          </div>

          <Card className="p-6 bg-card border-border">
            <div className="text-sm text-muted-foreground">
              Welcome back. Use the quarter selector in the header to jump between reporting periods.
              The full Funds, Directs, and Underlying Portfolio breakdowns are available from the sidebar.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
