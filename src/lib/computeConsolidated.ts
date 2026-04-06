/**
 * Part G: Auto-computation of consolidated metrics from database sources.
 */
import { supabase } from "@/integrations/supabase/client";
import { computeXIRR } from "@/lib/calcEngine";

export interface ComputedConsolidatedMetrics {
  quarter: string;
  quarter_date: string;
  contribution: number;
  distribution: number;
  nav: number;
  net_tvpi: number;
  net_irr: number;
  gross_tvpi: number;
  gross_irr: number;
  total_commitment: number;
  total_called: number;
  total_distributed: number;
  total_nav: number;
  unfunded: number;
  dpi: number;
  rvpi: number;
  pic: number;
}

function quarterLabelFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  const qNum = Math.floor(d.getMonth() / 3) + 1;
  return `${qNum}Q${d.getFullYear().toString().slice(2)}`;
}

export async function computeConsolidatedMetrics(quarterDate: string): Promise<ComputedConsolidatedMetrics> {
  // 1. Fetch funds with their commitments and ownership
  const { data: funds } = await supabase.from("funds").select("*");
  const allFunds = funds || [];

  // 2. Fetch fund quarterly reports for this quarter
  const { data: fqr } = await supabase
    .from("fund_quarterly_reports")
    .select("*")
    .eq("quarter_date", quarterDate);
  const reports = fqr || [];

  // 3. Fetch direct investments and their valuations
  const { data: directs } = await supabase.from("direct_investments").select("*");
  const { data: directVals } = await supabase
    .from("direct_quarterly_valuations")
    .select("*")
    .eq("quarter_date", quarterDate);
  const allDirects = directs || [];
  const allDirectVals = directVals || [];

  // 4. Fetch all fund-level cashflows up to this quarter (net LP wires)
  const { data: lpCashflows } = await supabase
    .from("fund_level_cashflows")
    .select("*")
    .lte("cashflow_date", quarterDate)
    .order("cashflow_date");
  const allLpCfs = lpCashflows || [];

  // 5. Fetch underlying portfolio holdings for gross metrics
  const { data: holdings } = await supabase
    .from("underlying_portfolio_holdings")
    .select("*")
    .eq("quarter_date", quarterDate);
  const allHoldings = holdings || [];

  // --- Net metrics (LP level) ---
  const netContributions = allLpCfs
    .filter((c: any) => c.type === "Capital Call")
    .reduce((s: number, c: any) => s + Number(c.amount), 0);
  const netDistributions = allLpCfs
    .filter((c: any) => c.type !== "Capital Call")
    .reduce((s: number, c: any) => s + Number(c.amount), 0);

  // Net NAV from fund quarterly reports (TWH-level NAV)
  const fundNavTotal = reports.reduce((s: number, r: any) => s + Number(r.reported_nav), 0);
  // Add direct FMVs
  const directFmvTotal = allDirectVals.reduce((s: number, v: any) => s + Number(v.current_valuation), 0);
  const netNav = fundNavTotal + directFmvTotal;

  const netTvpi = netContributions > 0 ? (netNav + netDistributions) / netContributions : 0;
  const netDpi = netContributions > 0 ? netDistributions / netContributions : 0;
  const netRvpi = netContributions > 0 ? netNav / netContributions : 0;

  // Net IRR via XIRR
  const netXirrCfs = allLpCfs.map((c: any) => ({
    date: new Date(c.cashflow_date),
    amount: c.type === "Capital Call" ? -Number(c.amount) : Number(c.amount),
  }));
  if (netNav > 0) {
    netXirrCfs.push({ date: new Date(quarterDate), amount: netNav });
  }
  netXirrCfs.sort((a, b) => a.date.getTime() - b.date.getTime());
  const netIrr = computeXIRR(netXirrCfs) || 0;

  // --- Gross metrics (investment level) ---
  const grossCost = allHoldings.reduce((s: number, h: any) => s + Number(h.twh_cost), 0)
    + allDirects.reduce((s: number, d: any) => s + Number(d.cost_basis), 0);
  const grossFmv = allHoldings.reduce((s: number, h: any) => s + Number(h.twh_fmv), 0) + directFmvTotal;
  const grossProceeds = allHoldings.reduce((s: number, h: any) => s + Number(h.twh_proceeds), 0)
    + allDirectVals.reduce((s: number, v: any) => s + Number(v.realized_proceeds_this_quarter), 0);

  const grossTvpi = grossCost > 0 ? (grossFmv + grossProceeds) / grossCost : 0;

  // Gross IRR — use fund cashflow-level data
  const { data: fundCashflows } = await supabase
    .from("fund_cashflows")
    .select("*")
    .order("cashflow_date");
  const allFundCfs = fundCashflows || [];

  const grossXirrCfs = allFundCfs.map((c: any) => ({
    date: new Date(c.cashflow_date),
    amount: c.cashflow_type?.startsWith("Capital Call")
      ? -Number(c.capital_deployed)
      : Number(c.distribution_received),
  })).filter(c => c.amount !== 0);

  if (grossFmv > 0) {
    grossXirrCfs.push({ date: new Date(quarterDate), amount: grossFmv });
  }
  grossXirrCfs.sort((a, b) => a.date.getTime() - b.date.getTime());
  const grossIrr = computeXIRR(grossXirrCfs) || 0;

  // Total commitment
  const totalCommitment = allFunds.reduce((s: number, f: any) => s + Number(f.commitment_amount), 0)
    + allDirects.reduce((s: number, d: any) => s + Number(d.cost_basis), 0);

  const totalCalled = netContributions;
  const totalDistributed = netDistributions;
  const unfunded = totalCommitment - totalCalled;
  const pic = totalCommitment > 0 ? totalCalled / totalCommitment : 0;

  return {
    quarter: quarterLabelFromDate(quarterDate),
    quarter_date: quarterDate,
    contribution: netContributions,
    distribution: netDistributions,
    nav: netNav,
    net_tvpi: netTvpi,
    net_irr: netIrr,
    gross_tvpi: grossTvpi,
    gross_irr: grossIrr,
    total_commitment: totalCommitment,
    total_called: totalCalled,
    total_distributed: totalDistributed,
    total_nav: netNav,
    unfunded,
    dpi: netDpi,
    rvpi: netRvpi,
    pic,
  };
}
