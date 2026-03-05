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

  // Per-fund capital activity (used for Gross metrics)
  const { data: allCashflows = [] } = useQuery({
    queryKey: ["all-fund-cashflows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fund_cashflows").select("*, fund:funds(fund_name)").order("cashflow_date");
      if (error) throw error;
      return data || [];
    },
  });

  // LP-level net wires (used for Net TVPI / Net IRR)
  const { data: lpCashflows = [] } = useQuery({
    queryKey: ["lp-cashflows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fund_level_cashflows").select("*").order("cashflow_date");
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

    // ─── Helpers ───
    const normalizeType = (type: unknown) => String(type ?? "").trim().toLowerCase();
    const toDate = (value: unknown) => {
      const d = new Date(String(value ?? ""));
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const quarterEnd = toDate(activeQuarter.date);

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

    // ─── LP-level net contributions (fund_level_cashflows — actual wires) ───
    const totalLpContributions = lpCashflows
      .filter((cf: any) => cf.type === "capital_call")
      .reduce((s: number, cf: any) => s + Number(cf.amount || 0), 0);

    const totalLpDistributions = lpCashflows
      .filter((cf: any) => cf.type === "distribution")
      .reduce((s: number, cf: any) => s + Number(cf.amount || 0), 0);

    // Per-fund capital calls (for display / gross metrics)
    const totalCapitalCalls = totalLpContributions;

    const totalDistributions = totalLpDistributions + allCashflows
      .filter((cf: any) => isDistribution(cf))
      .reduce((s: number, cf: any) => s + Number(cf.distribution_received || 0), 0);

    // Filter directs: exclude any with investment_date after the active quarter
    const eligibleDirects = (directs as any[]).filter((d: any) => {
      const date = toDate(d.investment_date);
      return date && quarterEnd && date.getTime() <= quarterEnd.getTime();
    });
    const eligibleDirectsCost = eligibleDirects.reduce((s: number, d: any) => s + Number(d.cost_basis || 0), 0);

    // ─── NET TVPI ────────────────────────────────────────────
    // Net metrics use LP-level wires only. Terminal = fund NAVs only
    // (directs cost is already embedded in LP wire contributions)
    const netDenominator = totalLpContributions;
    const netTerminal = twhNavFromFunds; // fund NAVs only, no directs FMV
    const netNumerator = netTerminal + totalLpDistributions;
    const netTvpi = netDenominator > 0 ? netNumerator / netDenominator : 0;

    // ─── NET IRR ─────────────────────────────────────────────
    // LP-level wires → negative, LP distributions → positive, terminal = fund NAV only
    const netIrrCFs: { date: Date; amount: number }[] = [];
    for (const cf of lpCashflows as any[]) {
      const date = toDate(cf.cashflow_date);
      if (!date) continue;
      const amount = Number(cf.amount || 0);
      if (cf.type === "capital_call" && amount > 0) {
        netIrrCFs.push({ date, amount: -amount });
      } else if (cf.type === "distribution" && amount > 0) {
        netIrrCFs.push({ date, amount });
      }
    }

    const terminalDate = quarterEnd;
    if (netTerminal > 0 && terminalDate) {
      netIrrCFs.push({ date: terminalDate, amount: netTerminal });
    }
    netIrrCFs.sort((a, b) => a.date.getTime() - b.date.getTime());
    const netIrr = computeXIRR(netIrrCFs);

    // ─── GROSS TVPI ──────────────────────────────────────────
    // Gross cost = sum of ALL capital calls from fund_cashflows + eligible directs cost
    const grossFundCost = allCashflows
      .filter((cf: any) => isCapitalCall(cf))
      .reduce((s: number, cf: any) => s + Number(cf.capital_deployed || 0), 0);
    const grossDenominator = grossFundCost + eligibleDirectsCost;
    const grossTerminal = twhFmvFromFunds + directsFmv;
    const grossNumerator = grossTerminal + twhProceedsFromFunds + directsProceeds;
    const grossTvpi = grossDenominator > 0 ? grossNumerator / grossDenominator : 0;

    // ─── GROSS IRR ───────────────────────────────────────────
    // ALL capital calls → negative, directs → negative
    // Proceeds → positive, terminal = twhFmv + directsFmv
    const grossIrrCFs: { date: Date; amount: number }[] = [];
    for (const cf of allCashflows) {
      const date = toDate(cf.cashflow_date);
      if (!date) continue;

      if (isCapitalCall(cf)) {
        const amount = Number(cf.capital_deployed || 0);
        if (amount > 0) grossIrrCFs.push({ date, amount: -amount });
      }

      if (isDistribution(cf)) {
        const amount = Number(cf.distribution_received || 0);
        if (amount > 0) grossIrrCFs.push({ date, amount });
      }
    }

    for (const d of eligibleDirects) {
      const date = toDate(d.investment_date);
      const amount = Number(d.cost_basis || 0);
      if (date && amount > 0) {
        grossIrrCFs.push({ date, amount: -amount });
      }
    }

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
      directsCost: eligibleDirectsCost,
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
      totalNav: netTerminal, // fund NAVs only
      grossFmv: grossTerminal, // fund FMVs + directs FMV
      activeQuarter,
    };
  }, [funds, allFS, directs, allCashflows, lpCashflows, directValuations, fundQuarterlyReports, activeQuarter]);
}
