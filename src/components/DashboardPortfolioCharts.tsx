import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { AlertTriangle } from "lucide-react";
import { INNOVATION_TYPES, normalizeInnovationType } from "@/lib/reconciliation/normalize";

type CompanyRow = {
  id: string;
  type: string[] | null;
  region: string[] | null;
  industry: string[] | null;
};

interface Bucket {
  name: string;
  value: number;
}

const PALETTE = [
  "hsl(38 92% 50%)",   // amber
  "hsl(199 89% 48%)",  // sky
  "hsl(160 64% 45%)",  // emerald
  "hsl(280 65% 60%)",  // violet
  "hsl(346 77% 50%)",  // rose
  "hsl(217 91% 60%)",  // blue
  "hsl(24 95% 53%)",   // orange
  "hsl(173 58% 39%)",  // teal
];

const TYPE_PALETTE: Record<string, string> = {
  "Deep Tech": "hsl(199 89% 48%)",
  "Tech Based": "hsl(160 64% 45%)",
  "Tech Enabled": "hsl(38 92% 50%)",
  Unclassified: "hsl(220 9% 46%)",
};

const UNCLASSIFIED = "Unclassified";

/**
 * Bucketing helper — counts each company at most once per bucket.
 * For multi-value fields (e.g. "Deep Tech, Tech Based"), the company
 * counts once toward EACH value. Empty values count once toward
 * "Unclassified" so the gap is visible.
 *
 * For Innovation Type specifically we run values through the
 * canonical-clamp normalizer; anything that doesn't match flows
 * into the `unmapped` set surfaced in the chart header.
 */
function countMultiValue(
  rows: CompanyRow[],
  pick: (r: CompanyRow) => string[] | null,
): { buckets: Bucket[]; unclassified: number } {
  const counts = new Map<string, number>();
  let unclassified = 0;
  for (const r of rows) {
    const vals = pick(r) ?? [];
    if (vals.length === 0) {
      unclassified += 1;
      continue;
    }
    const seen = new Set<string>();
    for (const v of vals) {
      const k = v.trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const buckets = Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  return { buckets, unclassified };
}

function countInnovationType(rows: CompanyRow[]): {
  buckets: Bucket[];
  unmapped: { value: string; count: number }[];
  unclassified: number;
} {
  const mappedCounts = new Map<string, number>();
  const unmappedCounts = new Map<string, number>();
  let unclassified = 0;
  for (const r of rows) {
    const vals = r.type ?? [];
    if (vals.length === 0) {
      unclassified += 1;
      continue;
    }
    // Re-normalize at read-time so we catch any pre-existing legacy values
    // (the ingest also normalizes, but we don't want to assume DB is clean).
    const { mapped, unmapped } = normalizeInnovationType(vals.join(","));
    if (mapped.length === 0 && unmapped.length === 0) {
      unclassified += 1;
      continue;
    }
    for (const m of mapped) mappedCounts.set(m, (mappedCounts.get(m) ?? 0) + 1);
    for (const u of unmapped) unmappedCounts.set(u, (unmappedCounts.get(u) ?? 0) + 1);
  }
  // Always render all 3 canonical buckets even if zero, so gaps are visible
  const buckets: Bucket[] = INNOVATION_TYPES.map((t) => ({ name: t, value: mappedCounts.get(t) ?? 0 }));
  if (unclassified > 0) buckets.push({ name: UNCLASSIFIED, value: unclassified });
  const unmapped = Array.from(unmappedCounts.entries()).map(([value, count]) => ({ value, count }));
  return { buckets, unmapped, unclassified };
}

function topNWithOther(buckets: Bucket[], n: number, unclassified: number): Bucket[] {
  const withoutZero = buckets.filter((b) => b.value > 0);
  if (withoutZero.length <= n) {
    if (unclassified > 0) return [...withoutZero, { name: UNCLASSIFIED, value: unclassified }];
    return withoutZero;
  }
  const top = withoutZero.slice(0, n);
  const other = withoutZero.slice(n).reduce((s, b) => s + b.value, 0);
  const out: Bucket[] = [...top];
  if (other > 0) out.push({ name: "Other", value: other });
  if (unclassified > 0) out.push({ name: UNCLASSIFIED, value: unclassified });
  return out;
}

export default function DashboardPortfolioCharts({ quarterId }: { quarterId: string | undefined }) {
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quarterId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Quarter-active: any company with a direct snapshot OR underlying holding for this quarter
      const [companiesRes, directsRes, directSnapsRes, underlyingRes] = await Promise.all([
        supabase.from("companies").select("id, type, region, industry"),
        supabase.from("directs").select("id, company_id"),
        supabase.from("direct_quarter_snapshots").select("direct_id").eq("quarter_id", quarterId),
        supabase.from("underlying_holdings").select("company_id").eq("quarter_id", quarterId),
      ]);
      if (cancelled) return;
      const directIdToCompany = new Map<string, string>();
      (directsRes.data ?? []).forEach((d: any) => directIdToCompany.set(d.id, d.company_id));
      const ids = new Set<string>();
      (directSnapsRes.data ?? []).forEach((s: any) => {
        const cid = directIdToCompany.get(s.direct_id);
        if (cid) ids.add(cid);
      });
      (underlyingRes.data ?? []).forEach((u: any) => {
        if (u.company_id) ids.add(u.company_id);
      });
      const all = (companiesRes.data ?? []) as CompanyRow[];
      setRows(all.filter((c) => ids.has(c.id)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [quarterId]);

  const innovation = useMemo(() => countInnovationType(rows), [rows]);
  const region = useMemo(() => {
    const { buckets, unclassified } = countMultiValue(rows, (r) => r.region);
    if (unclassified > 0) buckets.push({ name: UNCLASSIFIED, value: unclassified });
    return buckets;
  }, [rows]);
  const industry = useMemo(() => {
    const { buckets, unclassified } = countMultiValue(rows, (r) => r.industry);
    return topNWithOther(buckets, 10, unclassified);
  }, [rows]);

  if (loading) {
    return (
      <Card className="p-6 bg-card border-border text-sm text-muted-foreground">
        Loading portfolio breakdowns…
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-6 bg-card border-border text-sm text-muted-foreground">
        No active companies in this quarter — charts will appear once holdings are ingested.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Innovation Type — donut */}
      <Card className="p-5 bg-card border-border">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Innovation type</div>
            <div className="text-sm text-foreground/80 mt-0.5">{rows.length} active companies</div>
          </div>
        </div>
        <ChartContainer config={{}} className="h-[220px]">
          <PieChart>
            <Pie
              data={innovation.buckets.filter((b) => b.value > 0)}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={85}
              paddingAngle={2}
            >
              {innovation.buckets
                .filter((b) => b.value > 0)
                .map((b) => (
                  <Cell key={b.name} fill={TYPE_PALETTE[b.name] ?? PALETTE[0]} />
                ))}
            </Pie>
            <Tooltip content={<ChartTooltipContent />} />
          </PieChart>
        </ChartContainer>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
          {innovation.buckets.map((b) => (
            <div key={b.name} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: TYPE_PALETTE[b.name] ?? PALETTE[0] }}
              />
              <span className="text-muted-foreground">{b.name}</span>
              <span className="text-foreground tabular-nums">{b.value}</span>
            </div>
          ))}
        </div>
        {innovation.unmapped.length > 0 && (
          <div className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-200">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
            <div>
              {innovation.unmapped.length} unmapped value{innovation.unmapped.length > 1 ? "s" : ""}{" "}
              — fix in source xlsx:{" "}
              <span className="font-mono">
                {innovation.unmapped.map((u) => `${u.value} (${u.count})`).join(", ")}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Industry — horizontal bar, top 10 + Other */}
      <Card className="p-5 bg-card border-border">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Industry</div>
        <div className="text-sm text-foreground/80 mb-3">Top 10 + Other</div>
        <ChartContainer config={{}} className="h-[280px]">
          <BarChart data={industry} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {industry.map((b, i) => (
                <Cell
                  key={b.name}
                  fill={
                    b.name === UNCLASSIFIED
                      ? "hsl(220 9% 46%)"
                      : b.name === "Other"
                        ? "hsl(220 9% 60%)"
                        : PALETTE[i % PALETTE.length]
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </Card>

      {/* Region — horizontal bar */}
      <Card className="p-5 bg-card border-border">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Region</div>
        <div className="text-sm text-foreground/80 mb-3">
          Companies counted in each region they operate
        </div>
        <ChartContainer config={{}} className="h-[280px]">
          <BarChart data={region} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {region.map((b, i) => (
                <Cell
                  key={b.name}
                  fill={b.name === UNCLASSIFIED ? "hsl(220 9% 46%)" : PALETTE[i % PALETTE.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </Card>
    </div>
  );
}
