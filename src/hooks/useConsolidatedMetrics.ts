import { useMemo } from "react";
import { useFunds, useAllFundFS, useDirectInvestments, useActiveQuarter } from "@/hooks/usePortfolioData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { computeXIRR } from "@/lib/calcEngine";

/**
 * Single source of truth for consolidated portfolio metrics.
 * Used by Dashboard, Consolidated, and anywhere else that needs
 * Gross/Net TVPI, Gross/Net IRR.
 */
export function useConsolidatedMetrics() {
  const activeQuarter = useActiveQuarter();
  const { data: funds = [] } = useFunds();
  const { data: allFS = [] } = useAllFundFS(activeQuarter.date);
  const { data: directs = [] } = useDirectInvestments();

  // All fund cashflows
  const { data: allCashflows = [] } = useQuery({
    queryKey: ["all-fund-cashflows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fund_cashflows").select("*, fund:funds(fund_name)").order("cashflow_date");
      if (error) throw error;
      return data || [];
    },
  });

  // Fund quarterly reports — primary source for TWH NAV per fund
  const { data: fundQuarterlyReports = [] } = useQuery({
    queryKey: ["fund-quarterly-reports", activeQuarter.date],
    queryFn: async () => {
      if (!activeQuarter.date) return [];
      const { data, error } = await supabase
        .from("fund_quarterly_reports")
        .select("*, fund:funds(*)")
        .eq("quarter_date", activeQuarter.date);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeQuarter.date,
  });

  // Direct quarterly valuations for active quarter
  const { data: directValuations = [] } = useQuery({
    queryKey: ["direct-valuations", activeQuarter.date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_quarterly_valuations")
        .select("*, company:direct_investments(*)")
        .eq("quarter_date", activeQuarter.date);
      if (error) throw error;
      return data || [];
    },
  });

  return useMemo(() => {
    // ─── TWH NAV from fund_quarterly_reports (primary source) ─
    // reported_nav in this table is already TWH-level NAV
    const twhNavFromReports = fundQuarterlyReports.reduce(
      (s: number, r: any) => s + Number(r.reported_nav || 0), 0
    );

    // Also sum capital_called_to_date and distributions_to_date from reports
    const capitalCalledFromReports = fundQuarterlyReports.reduce(
      (s: number, r: any) => s + Number(r.capital_called_to_date || 0), 0
    );
    const distributionsFromReports = fundQuarterlyReports.reduce(
      (s: number, r: any) => s + Number(r.distributions_to_date || 0), 0
    );

    // ─── TWH metrics from FS (supplementary — for cost/FMV/proceeds) ─
    const fundData = allFS.map((fs: any) => {
      const extracted = fs.extracted_data as any;
      const fund = fs.fund;
      const totalCommitment = Number(extracted?.fund_totals?.total_commitment || 0);
      const twhPct = fund && totalCommitment > 0
        ? Number(fund.commitment_amount) / totalCommitment
        : 0;
      return {
        fundId: fs.fund_id,
        twhPct,
        twhCost: Number(extracted?.fund_totals?.total_investment_cost || 0) * twhPct,
        twhFmv: Number(extracted?.fund_totals?.total_portfolio_fmv || 0) * twhPct,
        twhProceeds: Number(extracted?.fund_totals?.total_proceeds || 0) * twhPct,
      };
    });

    // TWH NAV: prefer fund_quarterly_reports (always populated), fallback to FS
    const twhNavFromFS = fundData.reduce((s, d) => s + (d as any).twhNav || 0, 0);
    const twhNavFromFunds = twhNavFromReports > 0 ? twhNavFromReports : twhNavFromFS;
    const twhCostFromFunds = fundData.reduce((s, d) => s + d.twhCost, 0);
    const twhFmvFromFS = fundData.reduce((s, d) => s + d.twhFmv, 0);
    // When no FS data is confirmed, use NAV from quarterly reports as FMV proxy
    const twhFmvFromFunds = twhFmvFromFS > 0 ? twhFmvFromFS : twhNavFromFunds;
    const twhProceedsFromFunds = fundData.reduce((s, d) => s + d.twhProceeds, 0);

    // ─── Directs ─────────────────────────────────────────────
    const directsCost = directs.reduce((s: number, d: any) => s + Number(d.cost_basis), 0);
    
    const directsFmv = directValuations.reduce((s: number, dv: any) => s + Number(dv.current_valuation || 0), 0);
    const directsProceeds = directValuations.reduce((s: number, dv: any) => s + Number(dv.realized_proceeds_this_quarter || 0), 0);

    // ─── Cashflow aggregates ─────────────────────────────────
    // Use the HIGHER of: sum of individual cashflows vs capital_called_to_date from reports
    // This catches cases where cashflow ledger entries are incomplete
    const totalCapitalCallsFromLedger = allCashflows
      .filter((c: any) => c.cashflow_type?.startsWith("Capital Call"))
      .reduce((s: number, c: any) => s + Number(c.capital_deployed || 0), 0);

    const totalCapitalCalls = Math.max(totalCapitalCallsFromLedger, capitalCalledFromReports);

    const totalDistributionsFromLedger = allCashflows
      .filter((c: any) => c.cashflow_type === "Distribution")
      .reduce((s: number, c: any) => s + Number(c.distribution_received || 0), 0);

    const totalDistributions = Math.max(totalDistributionsFromLedger, distributionsFromReports);

    // ─── GROSS TVPI ──────────────────────────────────────────
    // (twhFmv + twhProceeds + directsFmv + directsProceeds) / (twhCost + directsCost)
    const grossDenominator = twhCostFromFunds + directsCost;
    const grossNumerator = twhFmvFromFunds + twhProceedsFromFunds + directsFmv + directsProceeds;
    const grossTvpi = grossDenominator > 0 ? grossNumerator / grossDenominator : 0;

    // ─── NET TVPI ────────────────────────────────────────────
    // (twhNav + directsFmv + totalDistributions) / (totalCapitalCalls + directsCost)
    const netDenominator = totalCapitalCalls + directsCost;
    const netNumerator = twhNavFromFunds + directsFmv + totalDistributions;
    const netTvpi = netDenominator > 0 ? netNumerator / netDenominator : 0;

    // ─── NET IRR ─────────────────────────────────────────────
    // All capital calls → negative, directs → negative, distributions → positive, terminal = NAV + directsFmv
    const netIrrCFs: { date: Date; amount: number }[] = [];
    for (const cf of allCashflows) {
      const isCall = (cf as any).cashflow_type?.startsWith("Capital Call");
      if (isCall) {
        netIrrCFs.push({ date: new Date(cf.cashflow_date), amount: -Number(cf.capital_deployed || 0) });
      } else {
        netIrrCFs.push({ date: new Date(cf.cashflow_date), amount: Number(cf.distribution_received || 0) });
      }
    }
    for (const d of directs as any[]) {
      if (d.investment_date && Number(d.cost_basis) > 0) {
        netIrrCFs.push({ date: new Date(d.investment_date), amount: -Number(d.cost_basis) });
      }
    }
    const netTerminal = twhNavFromFunds + directsFmv;
    if (netTerminal > 0) {
      netIrrCFs.push({ date: new Date(activeQuarter.date), amount: netTerminal });
    }
    netIrrCFs.sort((a, b) => a.date.getTime() - b.date.getTime());
    const netIrr = computeXIRR(netIrrCFs);

    // ─── GROSS IRR ───────────────────────────────────────────
    // Investment calls only (exclude mgmt fees/other) → negative, directs → negative
    // Proceeds → positive, terminal = twhFmv + directsFmv
    const grossIrrCFs: { date: Date; amount: number }[] = [];
    for (const cf of allCashflows) {
      if ((cf as any).cashflow_type === "Capital Call — Investment") {
        grossIrrCFs.push({ date: new Date(cf.cashflow_date), amount: -Number(cf.capital_deployed || 0) });
      }
      // Proceeds from distributions
      if ((cf as any).cashflow_type === "Distribution") {
        grossIrrCFs.push({ date: new Date(cf.cashflow_date), amount: Number(cf.distribution_received || 0) });
      }
    }
    for (const d of directs as any[]) {
      if (d.investment_date && Number(d.cost_basis) > 0) {
        grossIrrCFs.push({ date: new Date(d.investment_date), amount: -Number(d.cost_basis) });
      }
    }
    const grossTerminal = twhFmvFromFunds + directsFmv;
    if (grossTerminal > 0) {
      grossIrrCFs.push({ date: new Date(activeQuarter.date), amount: grossTerminal });
    }
    grossIrrCFs.sort((a, b) => a.date.getTime() - b.date.getTime());
    const grossIrr = computeXIRR(grossIrrCFs);

    return {
      // Aggregates
      twhNavFromFunds,
      twhCostFromFunds,
      twhFmvFromFunds,
      twhProceedsFromFunds,
      directsCost,
      directsFmv,
      directsProceeds,
      totalCapitalCalls,
      totalDistributions,
      // Metrics
      grossTvpi,
      netTvpi,
      netIrr,
      grossIrr,
      // For display
      totalNav: netTerminal, // twhNav + directsFmv
      activeQuarter,
    };
  }, [funds, allFS, directs, allCashflows, directValuations, fundQuarterlyReports, activeQuarter]);
}
