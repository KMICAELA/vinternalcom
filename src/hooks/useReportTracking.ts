import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TrackingRecord {
  id: string;
  fund_id: string;
  quarter: string;
  quarter_date: string;
  report_type: string;
  status: string;
  received_at: string | null;
  received_via: string | null;
  document_path: string | null;
  expected_by: string | null;
  days_since_quarter_end: number | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  reviewed_by: string | null;
  approved_at: string | null;
  notes: string | null;
}

export interface ReportingPattern {
  id: string;
  fund_id: string;
  report_type: string;
  avg_days_to_report: number | null;
  last_received_days: number | null;
  typical_format: string | null;
  typical_sender_email: string | null;
  notes: string | null;
}

export interface EnhancedFundTracking {
  fundId: string;
  fundName: string;
  strategy: string | null;
  currency: string;
  startDate: string | null;
  quarterlyReport: TrackingRecord | null;
  pcap: TrackingRecord | null;
  pattern: ReportingPattern | null;
  pcapPattern: ReportingPattern | null;
}

export interface TrackingSummary {
  approved: number;
  inReview: number;
  processing: number;
  awaiting: number;
  na: number;
  total: number;
  daysSinceQuarterEnd: number;
  quarterEndDate: string;
}

export function useReportTracking(quarterDate: string) {
  return useQuery({
    queryKey: ["report-tracking", quarterDate],
    queryFn: async () => {
      const [fundsRes, trackingRes, patternsRes, pcapRes] = await Promise.all([
        supabase.from("funds").select("id, fund_name, strategy, currency, start_date").order("fund_name"),
        supabase.from("quarterly_report_tracking").select("*").eq("quarter_date", quarterDate),
        supabase.from("fund_reporting_patterns").select("*"),
        supabase.from("pcap_extractions").select("id, fund_id, extraction_status, quarter_date").eq("quarter_date", quarterDate),
      ]);

      if (fundsRes.error) throw fundsRes.error;
      const funds = fundsRes.data || [];
      const tracking = (trackingRes.data || []) as TrackingRecord[];
      const patterns = (patternsRes.data || []) as ReportingPattern[];
      const pcaps = pcapRes.data || [];

      const trackingByFund: Record<string, Record<string, TrackingRecord>> = {};
      for (const t of tracking) {
        if (!trackingByFund[t.fund_id]) trackingByFund[t.fund_id] = {};
        trackingByFund[t.fund_id][t.report_type] = t;
      }

      const patternByFund: Record<string, Record<string, ReportingPattern>> = {};
      for (const p of patterns) {
        if (!patternByFund[p.fund_id]) patternByFund[p.fund_id] = {};
        patternByFund[p.fund_id][p.report_type] = p;
      }

      const pcapByFund: Record<string, any> = {};
      for (const p of pcaps) pcapByFund[p.fund_id] = p;

      const enhanced: EnhancedFundTracking[] = funds.map((f) => ({
        fundId: f.id,
        fundName: f.fund_name,
        strategy: f.strategy,
        currency: f.currency,
        startDate: f.start_date,
        quarterlyReport: trackingByFund[f.id]?.quarterly_report || null,
        pcap: trackingByFund[f.id]?.pcap || null,
        pattern: patternByFund[f.id]?.quarterly_report || null,
        pcapPattern: patternByFund[f.id]?.pcap || null,
      }));

      // Compute summary
      const qEnd = new Date(quarterDate + "T00:00:00");
      const now = new Date();
      const daysSince = Math.floor((now.getTime() - qEnd.getTime()) / (1000 * 60 * 60 * 24));

      let approved = 0, inReview = 0, processing = 0, awaiting = 0, na = 0;
      for (const e of enhanced) {
        const s = e.quarterlyReport?.status;
        if (!s || s === "not_received") awaiting++;
        else if (s === "approved") approved++;
        else if (s === "review" || s === "extracted") inReview++;
        else if (s === "received" || s === "processing") processing++;
        else if (s === "na") na++;
        else awaiting++;
      }

      const summary: TrackingSummary = {
        approved,
        inReview,
        processing,
        awaiting,
        na,
        total: enhanced.length,
        daysSinceQuarterEnd: Math.max(0, daysSince),
        quarterEndDate: quarterDate,
      };

      return { funds: enhanced, summary, pcapByFund };
    },
    enabled: !!quarterDate,
  });
}
