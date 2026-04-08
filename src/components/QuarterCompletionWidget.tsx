import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFunds, useDirectInvestments } from "@/hooks/usePortfolioData";
import { Progress } from "@/components/ui/progress";
import { Check, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { quarterDate: string; quarterLabel: string; }

export default function QuarterCompletionWidget({ quarterDate, quarterLabel }: Props) {
  const { data: funds = [] } = useFunds();
  const { data: directs = [] } = useDirectInvestments();

  const { data: trackingRecords = [] } = useQuery({
    queryKey: ["completion-tracking", quarterDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("quarterly_report_tracking")
        .select("fund_id, status, report_type")
        .eq("quarter_date", quarterDate)
        .eq("report_type", "quarterly_report");
      return data || [];
    },
  });

  const { data: confirmedFS = [] } = useQuery({
    queryKey: ["completion-fs", quarterDate],
    queryFn: async () => {
      const { data } = await supabase.from("fund_financial_statements").select("fund_id").eq("quarter_date", quarterDate).eq("confirmed", true);
      return data || [];
    },
  });

  const { data: directVals = [] } = useQuery({
    queryKey: ["completion-dv", quarterDate],
    queryFn: async () => {
      const { data } = await supabase.from("direct_quarterly_valuations").select("company_id").eq("quarter_date", quarterDate);
      return data || [];
    },
  });

  const { data: cashflowStatus } = useQuery({
    queryKey: ["completion-cf", quarterDate],
    queryFn: async () => {
      const { data: live } = await supabase.from("fund_level_cashflows").select("id").gte("cashflow_date", quarterDate.slice(0, 7) + "-01").lte("cashflow_date", quarterDate);
      const { data: staged } = await supabase.from("staged_internal_data").select("id").eq("quarter_date", quarterDate).eq("data_type", "lp_cashflow").in("status", ["pending_review", "approved"]);
      return { live: live?.length || 0, staged: staged?.length || 0 };
    },
  });

  const { data: navStatus } = useQuery({
    queryKey: ["completion-nav", quarterDate],
    queryFn: async () => {
      const { data } = await supabase.from("portfolio_snapshots").select("id").eq("quarter_date", quarterDate).maybeSingle();
      return !!data;
    },
  });

  const { data: commentaryStatus } = useQuery({
    queryKey: ["completion-commentary", quarterDate],
    queryFn: async () => {
      const { data } = await supabase.from("quarterly_commentary").select("id").eq("quarter_date", quarterDate);
      return (data?.length || 0) > 0;
    },
  });

  const { data: highlightCount = 0 } = useQuery({
    queryKey: ["completion-highlights", quarterDate],
    queryFn: async () => {
      const { data } = await supabase.from("highlight_entries").select("id").eq("quarter_date", quarterDate);
      return data?.length || 0;
    },
  });

  const approvedCount = trackingRecords.filter((r: any) => r.status === "approved").length;
  const naCount = trackingRecords.filter((r: any) => r.status === "na").length;
  const totalActiveFunds = funds.length - naCount;
  const pendingReviewCount = trackingRecords.filter((r: any) => ["extracted", "review"].includes(r.status)).length;
  const awaitingCount = trackingRecords.filter((r: any) => r.status === "not_received").length;

  const fsComplete = totalActiveFunds > 0 && approvedCount >= totalActiveFunds;
  const dvComplete = directs.length > 0 && directVals.length >= directs.length;
  const cfComplete = (cashflowStatus?.live || 0) > 0;
  const navComplete = !!navStatus;
  const commComplete = !!commentaryStatus;
  const hlComplete = highlightCount > 0;

  const fundReportDetail = trackingRecords.length > 0
    ? `${approvedCount}/${totalActiveFunds} approved${pendingReviewCount > 0 ? `, ${pendingReviewCount} in review` : ""}${awaitingCount > 0 ? `, ${awaitingCount} awaiting` : ""}`
    : `${confirmedFS.length}/${funds.length} funds confirmed`;

  const items = [
    { label: "Fund Reports", detail: fundReportDetail, done: fsComplete },
    { label: "Direct Valuations", detail: `${directVals.length}/${directs.length} confirmed`, done: dvComplete },
    { label: "LP Cashflows", detail: cfComplete ? "Recorded" : (cashflowStatus?.staged || 0) > 0 ? "Pending review" : "Not submitted", done: cfComplete },
    { label: "NAV Snapshot", detail: navComplete ? "Recorded" : "Not submitted", done: navComplete },
    { label: "Commentary", detail: commComplete ? "Recorded" : "Not submitted", done: commComplete },
    { label: "Highlights", detail: hlComplete ? `${highlightCount} entries confirmed` : "Not submitted", done: hlComplete },
  ];

  const completedCount = items.filter(i => i.done).length;
  const pct = Math.round((completedCount / items.length) * 100);

  return (
    <div className="analytics-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{quarterLabel} Data Status</h3>
        <span className="text-xs text-muted-foreground font-mono">{pct}%</span>
      </div>

      {pendingReviewCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-400">{pendingReviewCount} report{pendingReviewCount !== 1 ? "s" : ""} awaiting review</span>
        </div>
      )}
      {awaitingCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-xs text-destructive">{awaitingCount} fund{awaitingCount !== 1 ? "s" : ""} haven't reported yet</span>
        </div>
      )}

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-2.5">
            {item.done ? (
              <Check className="h-3.5 w-3.5 text-[hsl(var(--positive))] shrink-0" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            )}
            <span className={cn("text-xs flex-1", item.done ? "text-foreground" : "text-muted-foreground")}>{item.label}</span>
            <span className="text-[10px] text-muted-foreground">{item.detail}</span>
          </div>
        ))}
      </div>

      <Progress value={pct} className="h-1.5 bg-muted" />
    </div>
  );
}
