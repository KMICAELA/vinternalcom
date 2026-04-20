import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LogoMark from "@/components/LogoMark";
import { fmtUSD, fmtMultiple } from "@/lib/format";
import { Loader2, AlertCircle } from "lucide-react";

type ReportPayload = {
  quarter: {
    label: string;
    quarter_end_date: string;
  };
  kpis: {
    portfolio_value: number;
    contributions: number;
    distributions: number;
    tvpi: number | null;
    dpi: number | null;
    fund_count: number;
    direct_count: number;
  };
  top_funds: Array<{
    id: string;
    name: string;
    nav: number;
    contributions: number;
    distributions: number;
    tvpi: number | null;
    dpi: number | null;
  }>;
  top_directs: Array<{
    id: string;
    name: string;
    what_they_do: string | null;
    cost: number;
    fmv: number;
    proceeds: number;
    moic: number | null;
  }>;
  highlights: Array<{ category: string; body_md: string; position: number }>;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const SharePage = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/share-report?token=${encodeURIComponent(token)}`,
          { method: "GET" },
        );
        const body = await res.json();
        if (!res.ok) {
          setError(body?.error ?? "Unable to load report");
          return;
        }
        setData(body as ReportPayload);
      } catch (e: any) {
        setError(e?.message ?? "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md p-8 bg-card border-border text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">Report unavailable</h1>
          <p className="text-sm text-muted-foreground">{error ?? "Unknown error"}</p>
        </Card>
      </div>
    );
  }

  const { quarter, kpis, top_funds, top_directs, highlights } = data;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-[1100px] mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark size={32} />
            <div>
              <div className="text-sm font-semibold text-foreground">LP Quarterly Report</div>
              <div className="text-xs text-muted-foreground">{quarter.label}</div>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            Read-only
          </Badge>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-8 space-y-8">
        {/* KPIs */}
        <section>
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
            Portfolio snapshot
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Portfolio value" value={fmtUSD(kpis.portfolio_value, { compact: true })} />
            <KpiCard label="Contributions" value={fmtUSD(kpis.contributions, { compact: true })} />
            <KpiCard label="Distributions" value={fmtUSD(kpis.distributions, { compact: true })} />
            <KpiCard label="TVPI" value={fmtMultiple(kpis.tvpi)} sub={`DPI ${fmtMultiple(kpis.dpi)}`} />
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {kpis.fund_count} funds · {kpis.direct_count} direct investments
          </div>
        </section>

        {/* Top funds */}
        {top_funds.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Top funds by NAV
            </h2>
            <Card className="bg-card border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Fund</th>
                    <th className="px-4 py-3 font-medium text-right">Contrib.</th>
                    <th className="px-4 py-3 font-medium text-right">NAV</th>
                    <th className="px-4 py-3 font-medium text-right">Distrib.</th>
                    <th className="px-4 py-3 font-medium text-right">TVPI</th>
                  </tr>
                </thead>
                <tbody>
                  {top_funds.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-foreground font-medium">{f.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtUSD(f.contributions, { compact: true })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtUSD(f.nav, { compact: true })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtUSD(f.distributions, { compact: true })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMultiple(f.tvpi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Top directs */}
        {top_directs.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Top direct investments by FMV
            </h2>
            <Card className="bg-card border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 font-medium text-right">Cost</th>
                    <th className="px-4 py-3 font-medium text-right">FMV</th>
                    <th className="px-4 py-3 font-medium text-right">MOIC</th>
                  </tr>
                </thead>
                <tbody>
                  {top_directs.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="text-foreground font-medium">{d.name}</div>
                        {d.what_they_do && (
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {d.what_they_do}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtUSD(d.cost, { compact: true })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtUSD(d.fmv, { compact: true })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMultiple(d.moic)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Highlights */}
        {highlights.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Quarter highlights
            </h2>
            <div className="space-y-3">
              {highlights.map((h, i) => (
                <Card key={i} className="p-5 bg-card border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-2">{h.category}</h3>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {h.body_md}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        <footer className="border-t border-border pt-6 text-xs text-muted-foreground text-center">
          Confidential — for limited partner use only.
        </footer>
      </main>
    </div>
  );
};

const KpiCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <Card className="p-4 bg-card border-border">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold text-foreground tabular-nums mt-1">{value}</div>
    {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
  </Card>
);

export default SharePage;
