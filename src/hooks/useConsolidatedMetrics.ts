import { useQuery } from "@tanstack/react-query";
import { useActiveQuarter } from "@/hooks/usePortfolioData";
import { supabase } from "@/integrations/supabase/client";

/**
 * Database-driven consolidated metrics hook.
 * Reads from quarterly_history table instead of hardcoded quarterRegistry.
 * Returns the same interface shape as before for backward compatibility.
 */

export interface QuarterHistoryRow {
  id: string;
  quarter: string;
  quarter_date: string;
  contribution: number;
  distribution: number;
  nav: number;
  net_tvpi: number;
  net_irr: number;
  gross_tvpi: number;
  gross_irr: number;
  locked: boolean;
  total_commitment: number;
  total_called: number;
  total_distributed: number;
  total_nav: number;
  unfunded: number;
  dpi: number;
  rvpi: number;
  pic: number;
  computation_source: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

function useQuarterlyHistoryQuery() {
  return useQuery({
    queryKey: ["consolidated-metrics-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quarterly_history")
        .select("*")
        .order("quarter_date");
      if (error) throw error;
      return (data || []) as QuarterHistoryRow[];
    },
  });
}

/**
 * Primary hook — returns the same shape consumers expect:
 * twhNavFromFunds, netTvpi, grossTvpi, totalCapitalCalls, etc.
 */
export function useConsolidatedMetrics() {
  const activeQuarter = useActiveQuarter();
  const { data: allQuarters = [], isLoading, error } = useQuarterlyHistoryQuery();

  const currentQuarter = allQuarters.find(q => q.quarter === activeQuarter.quarter) || null;

  // Return backward-compatible shape
  return {
    twhNavFromFunds: currentQuarter ? Number(currentQuarter.nav) : 0,
    twhCostFromFunds: 0,
    twhFmvFromFunds: currentQuarter ? Number(currentQuarter.nav) : 0,
    twhProceedsFromFunds: 0,
    directsCost: 0,
    directsFmv: 0,
    directsProceeds: 0,
    totalCapitalCalls: currentQuarter ? Number(currentQuarter.contribution) : 0,
    totalDistributions: currentQuarter ? Number(currentQuarter.distribution) : 0,
    grossTvpi: currentQuarter ? Number(currentQuarter.gross_tvpi) : 0,
    netTvpi: currentQuarter ? Number(currentQuarter.net_tvpi) : 0,
    netIrr: currentQuarter ? Number(currentQuarter.net_irr) || null : null,
    grossIrr: currentQuarter ? Number(currentQuarter.gross_irr) || null : null,
    totalNav: currentQuarter ? Number(currentQuarter.nav) : 0,
    grossFmv: currentQuarter ? Number(currentQuarter.total_nav || currentQuarter.nav) : 0,
    activeQuarter,
    // New fields for enhanced consumers
    totalCommitment: currentQuarter ? Number(currentQuarter.total_commitment) : 0,
    dpi: currentQuarter ? Number(currentQuarter.dpi) : 0,
    rvpi: currentQuarter ? Number(currentQuarter.rvpi) : 0,
    pic: currentQuarter ? Number(currentQuarter.pic) : 0,
    unfunded: currentQuarter ? Number(currentQuarter.unfunded) : 0,
    computationSource: currentQuarter?.computation_source || null,
    // All quarters for charts
    allQuarters,
    currentQuarterRow: currentQuarter,
    isLoading,
    error,
  };
}

/**
 * Chart data from database — replaces getChartData() from quarterRegistry.
 */
export function useChartData() {
  const { data: allQuarters = [] } = useQuarterlyHistoryQuery();
  return allQuarters.map(q => ({
    quarter: q.quarter,
    netTvpi: Number(Number(q.net_tvpi).toFixed(2)),
    grossTvpi: Number(Number(q.gross_tvpi).toFixed(2)),
  }));
}

/**
 * Get fund NAVs and TVPIs for a quarter from the database.
 * Replaces qData.fundNAVs / qData.fundTVPIs from quarterRegistry.
 */
export function useFundQuarterMetrics(quarterDate: string) {
  return useQuery({
    queryKey: ["fund-quarter-metrics", quarterDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fund_quarterly_reports")
        .select("*, fund:funds(fund_name)")
        .eq("quarter_date", quarterDate);
      if (error) throw error;

      const navs: Record<string, number> = {};
      const tvpis: Record<string, number | null> = {};
      for (const r of data || []) {
        const name = (r as any).fund?.fund_name;
        if (!name) continue;
        navs[name] = Number(r.reported_nav);
        tvpis[name] = r.reported_gross_tvpi != null ? Number(r.reported_gross_tvpi) : null;
      }
      return { fundNAVs: navs, fundTVPIs: tvpis };
    },
    enabled: !!quarterDate,
  });
}
