import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FundCoverageStatus = "complete" | "in_review" | "missing" | "na";

export interface FundCoverage {
  fundId: string;
  fundName: string;
  strategy: string | null;
  vintageYear: number | null;
  startDate: string | null;
  status: FundCoverageStatus;
  fileName: string | null;
  extractionId: string | null;
}

export interface CoverageSummary {
  complete: number;
  inReview: number;
  missing: number;
  na: number;
  total: number;
}

function quarterToDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function isFundActiveForQuarter(fund: any, quarterDate: string): boolean {
  const qd = quarterToDate(quarterDate);
  if (fund.start_date) {
    const sd = new Date(fund.start_date + "T00:00:00");
    if (sd > qd) return false;
  }
  if (fund.vintage_year) {
    const qYear = qd.getFullYear();
    const qQuarter = Math.floor(qd.getMonth() / 3) + 1;
    // Fund is N/A if vintage year is strictly after the selected quarter's year
    // or if it's the same year but the fund hasn't started yet
    if (fund.vintage_year > qYear) return false;
  }
  return true;
}

export function useReportCoverage(quarterDate: string) {
  return useQuery({
    queryKey: ["report-coverage", quarterDate],
    queryFn: async () => {
      const [fundsRes, confirmedRes, stagedRes] = await Promise.all([
        supabase.from("funds").select("id, fund_name, strategy, vintage_year, start_date"),
        supabase
          .from("fund_financial_statements")
          .select("fund_id, file_path")
          .eq("quarter_date", quarterDate)
          .eq("confirmed", true),
        supabase
          .from("staged_fund_extractions")
          .select("fund_id, source_file_name, id, status")
          .eq("quarter_date", quarterDate)
          .eq("status", "pending_review"),
      ]);

      if (fundsRes.error) throw fundsRes.error;
      if (confirmedRes.error) throw confirmedRes.error;
      if (stagedRes.error) throw stagedRes.error;

      const funds = fundsRes.data || [];
      const confirmedSet = new Set((confirmedRes.data || []).map((r) => r.fund_id));
      const stagedMap = new Map(
        (stagedRes.data || []).map((r) => [r.fund_id, { fileName: r.source_file_name, id: r.id }])
      );

      const coverage: FundCoverage[] = funds.map((fund) => {
        const active = isFundActiveForQuarter(fund, quarterDate);
        if (!active) {
          return {
            fundId: fund.id,
            fundName: fund.fund_name,
            strategy: fund.strategy,
            vintageYear: fund.vintage_year,
            startDate: fund.start_date,
            status: "na" as FundCoverageStatus,
            fileName: null,
            extractionId: null,
          };
        }

        if (confirmedSet.has(fund.id)) {
          return {
            fundId: fund.id,
            fundName: fund.fund_name,
            strategy: fund.strategy,
            vintageYear: fund.vintage_year,
            startDate: fund.start_date,
            status: "complete" as FundCoverageStatus,
            fileName: null,
            extractionId: null,
          };
        }

        const staged = stagedMap.get(fund.id);
        if (staged) {
          return {
            fundId: fund.id,
            fundName: fund.fund_name,
            strategy: fund.strategy,
            vintageYear: fund.vintage_year,
            startDate: fund.start_date,
            status: "in_review" as FundCoverageStatus,
            fileName: staged.fileName,
            extractionId: staged.id,
          };
        }

        return {
          fundId: fund.id,
          fundName: fund.fund_name,
          strategy: fund.strategy,
          vintageYear: fund.vintage_year,
          startDate: fund.start_date,
          status: "missing" as FundCoverageStatus,
          fileName: null,
          extractionId: null,
        };
      });

      const summary: CoverageSummary = {
        complete: coverage.filter((c) => c.status === "complete").length,
        inReview: coverage.filter((c) => c.status === "in_review").length,
        missing: coverage.filter((c) => c.status === "missing").length,
        na: coverage.filter((c) => c.status === "na").length,
        total: coverage.length,
      };

      return { coverage, summary };
    },
    enabled: !!quarterDate,
  });
}
