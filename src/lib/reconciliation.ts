import { supabase } from "@/integrations/supabase/client";

export async function runReconciliationChecks(fundId: string, quarterDate: string, fundName: string) {
  const checks: Array<{
    quarter_date: string;
    check_type: string;
    severity: string;
    entity_name: string;
    expected_value: number | null;
    actual_value: number | null;
    variance_pct: number | null;
    description: string;
  }> = [];

  // Fetch fund_financial_statements for this fund+quarter
  const { data: ffs } = await supabase
    .from("fund_financial_statements")
    .select("*")
    .eq("fund_id", fundId)
    .eq("quarter_date", quarterDate)
    .maybeSingle();

  const fsData = (ffs?.extracted_data as any) || {};
  const fundTotals = fsData.fund_totals || {};

  // Fetch cashflows for this fund up to quarter
  const { data: cashflows = [] } = await supabase
    .from("fund_cashflows")
    .select("*")
    .eq("fund_id", fundId)
    .lte("cashflow_date", quarterDate);

  const totalCalls = cashflows.reduce((s: number, c: any) => s + Number(c.capital_deployed || 0), 0);
  const totalDists = cashflows.reduce((s: number, c: any) => s + Number(c.distribution_received || 0), 0);

  // Check 1: Capital calls sum vs reported
  const reportedCalled = Number(fundTotals.total_contributions_called || 0);
  if (reportedCalled > 0 && totalCalls > 0) {
    const variance = Math.abs(totalCalls - reportedCalled) / reportedCalled;
    if (variance > 0.05) {
      checks.push({
        quarter_date: quarterDate,
        check_type: "capital_calls_mismatch",
        severity: variance > 0.15 ? "error" : "warning",
        entity_name: fundName,
        expected_value: reportedCalled,
        actual_value: totalCalls,
        variance_pct: variance * 100,
        description: `Capital calls ledger total ($${totalCalls.toLocaleString()}) differs from reported total ($${reportedCalled.toLocaleString()}) by ${(variance * 100).toFixed(1)}%`,
      });
    }
  }

  // Check 2: Distributions sum vs reported
  const reportedDist = Number(fundTotals.total_distributions || 0);
  if (reportedDist > 0 && totalDists > 0) {
    const variance = Math.abs(totalDists - reportedDist) / reportedDist;
    if (variance > 0.05) {
      checks.push({
        quarter_date: quarterDate,
        check_type: "distributions_mismatch",
        severity: variance > 0.15 ? "error" : "warning",
        entity_name: fundName,
        expected_value: reportedDist,
        actual_value: totalDists,
        variance_pct: variance * 100,
        description: `Distributions ledger total ($${totalDists.toLocaleString()}) differs from reported total ($${reportedDist.toLocaleString()}) by ${(variance * 100).toFixed(1)}%`,
      });
    }
  }

  // Check 3: Holdings FMV vs NAV
  const { data: holdings = [] } = await supabase
    .from("underlying_portfolio_holdings")
    .select("fmv")
    .eq("fund_id", fundId)
    .eq("quarter_date", quarterDate);

  const holdingsFmv = holdings.reduce((s: number, h: any) => s + Number(h.fmv || 0), 0);
  const reportedNav = Number(fundTotals.fund_nav || 0);
  if (reportedNav > 0 && holdingsFmv > 0) {
    const variance = Math.abs(holdingsFmv - reportedNav) / reportedNav;
    if (variance > 0.05) {
      checks.push({
        quarter_date: quarterDate,
        check_type: "holdings_nav_mismatch",
        severity: variance > 0.15 ? "error" : "warning",
        entity_name: fundName,
        expected_value: reportedNav,
        actual_value: holdingsFmv,
        variance_pct: variance * 100,
        description: `Sum of holdings FMV ($${holdingsFmv.toLocaleString()}) differs from reported NAV ($${reportedNav.toLocaleString()}) by ${(variance * 100).toFixed(1)}%`,
      });
    }
  }

  // Check 4: TVPI consistency
  const { data: fqr } = await supabase
    .from("fund_quarterly_reports")
    .select("*")
    .eq("fund_id", fundId)
    .eq("quarter_date", quarterDate)
    .maybeSingle();

  if (fqr && totalCalls > 0) {
    const computedTvpi = (Number(fqr.reported_nav || 0) + Number(fqr.distributions_to_date || 0)) / Number(fqr.capital_called_to_date || 1);
    const reportedTvpi = Number(fqr.reported_gross_tvpi || 0);
    if (reportedTvpi > 0) {
      const diff = Math.abs(computedTvpi - reportedTvpi);
      if (diff > 0.05) {
        checks.push({
          quarter_date: quarterDate,
          check_type: "tvpi_inconsistency",
          severity: diff > 0.2 ? "error" : "warning",
          entity_name: fundName,
          expected_value: reportedTvpi,
          actual_value: computedTvpi,
          variance_pct: (diff / reportedTvpi) * 100,
          description: `Computed TVPI (${computedTvpi.toFixed(2)}x) differs from reported TVPI (${reportedTvpi.toFixed(2)}x) by ${diff.toFixed(2)}x`,
        });
      }
    }
  }

  // Check 5: Duplicate entries
  const { data: existingFfs } = await supabase
    .from("fund_financial_statements")
    .select("id")
    .eq("fund_id", fundId)
    .eq("quarter_date", quarterDate);

  if (existingFfs && existingFfs.length > 1) {
    checks.push({
      quarter_date: quarterDate,
      check_type: "duplicate_entry",
      severity: "warning",
      entity_name: fundName,
      expected_value: 1,
      actual_value: existingFfs.length,
      variance_pct: null,
      description: `Found ${existingFfs.length} financial statement entries for ${fundName} in ${quarterDate}. Expected 1.`,
    });
  }

  // Check 6: Null critical values
  if (reportedNav === 0 && reportedCalled === 0) {
    checks.push({
      quarter_date: quarterDate,
      check_type: "missing_critical_values",
      severity: "info",
      entity_name: fundName,
      expected_value: null,
      actual_value: null,
      variance_pct: null,
      description: `Both NAV and Capital Called are zero or null for ${fundName}. This may indicate incomplete extraction.`,
    });
  }

  // Insert checks
  if (checks.length > 0) {
    await supabase.from("reconciliation_checks").insert(checks as any);
  }

  return checks;
}
