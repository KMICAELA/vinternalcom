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

    // ─── Cashflow aggregates (source of truth: fund capital activity ledger) ───
    const normalizeType = (type: unknown) => String(type ?? "").trim().toLowerCase();
    const toDate = (value: unknown) => {
      const d = new Date(String(value ?? ""));
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const isCapitalCall = (cf: any) => {
      const type = normalizeType(cf.cashflow_type);
      const capital = Number(cf.capital_deployed || 0);
      const distribution = Number(cf.distribution_received || 0);
      return type.startsWith("capital call") || (capital > 0 && distribution === 0);
    };

    const isDistribution = (cf: any) => {
      const type = normalizeType(cf.cashflow_type);
      return type === "distribution" || Number(cf.distribution_received || 0) > 0;
    };

    const isInvestmentCall = (cf: any) => {
      const type = normalizeType(cf.cashflow_type);
      return isCapitalCall(cf) && type.includes("investment");
    };

    // Total Contributed = sum(all Capital Call rows in fund ledger) + directs cost (added later in denominator)
    const totalCapitalCalls = allCashflows
      .filter((cf: any) => isCapitalCall(cf))
      .reduce((s: number, cf: any) => s + Number(cf.capital_deployed || 0), 0);

    const totalDistributions = allCashflows
      .filter((cf: any) => isDistribution(cf))
      .reduce((s: number, cf: any) => s + Number(cf.distribution_received || 0), 0);

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
      const date = toDate(cf.cashflow_date);
      if (!date) continue;

      if (isCapitalCall(cf)) {
        const amount = Number(cf.capital_deployed || 0);
        if (amount > 0) netIrrCFs.push({ date, amount: -amount });
      }

      if (isDistribution(cf)) {
        const amount = Number(cf.distribution_received || 0);
        if (amount > 0) netIrrCFs.push({ date, amount });
      }
    }

    for (const d of directs as any[]) {
      const date = toDate(d.investment_date);
      const amount = Number(d.cost_basis || 0);
      if (date && amount > 0) {
        netIrrCFs.push({ date, amount: -amount });
      }
    }

    const netTerminal = twhNavFromFunds + directsFmv;
    const terminalDate = toDate(activeQuarter.date);
    if (netTerminal > 0 && terminalDate) {
      netIrrCFs.push({ date: terminalDate, amount: netTerminal });
    }
    netIrrCFs.sort((a, b) => a.date.getTime() - b.date.getTime());
    const netIrr = computeXIRR(netIrrCFs);

    // ─── GROSS IRR ───────────────────────────────────────────
    // Investment calls only (exclude mgmt fees/other) → negative, directs → negative
    // Proceeds → positive, terminal = twhFmv + directsFmv
    const grossIrrCFs: { date: Date; amount: number }[] = [];
    for (const cf of allCashflows) {
      const date = toDate(cf.cashflow_date);
      if (!date) continue;

      if (isInvestmentCall(cf)) {
        const amount = Number(cf.capital_deployed || 0);
        if (amount > 0) grossIrrCFs.push({ date, amount: -amount });
      }

      if (isDistribution(cf)) {
        const amount = Number(cf.distribution_received || 0);
        if (amount > 0) grossIrrCFs.push({ date, amount });
      }
    }

    for (const d of directs as any[]) {
      const date = toDate(d.investment_date);
      const amount = Number(d.cost_basis || 0);
      if (date && amount > 0) {
        grossIrrCFs.push({ date, amount: -amount });
      }
    }

    const grossTerminal = twhFmvFromFunds + directsFmv;
    if (grossTerminal > 0 && terminalDate) {
      grossIrrCFs.push({ date: terminalDate, amount: grossTerminal });
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
