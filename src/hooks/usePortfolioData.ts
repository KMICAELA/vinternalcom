import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Funds ───────────────────────────────────────────────────────────

export function useFunds() {
  return useQuery({
    queryKey: ["funds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funds").select("*").order("fund_name");
      if (error) throw error;
      return data || [];
    },
  });
}

// ─── Fund Cashflows (Capital Activity) ────────────────────────────

export function useFundCashflows(fundId: string | null) {
  return useQuery({
    queryKey: ["fund-cashflows", fundId],
    queryFn: async () => {
      if (!fundId) return [];
      const { data, error } = await supabase
        .from("fund_cashflows")
        .select("*")
        .eq("fund_id", fundId)
        .order("cashflow_date");
      if (error) throw error;
      return data || [];
    },
    enabled: !!fundId,
  });
}

// ─── Fund Financial Statements ────────────────────────────────────

export function useFundFinancialStatement(fundId: string | null, quarterDate: string | null) {
  return useQuery({
    queryKey: ["fund-fs", fundId, quarterDate],
    queryFn: async () => {
      if (!fundId || !quarterDate) return null;
      const { data, error } = await supabase
        .from("fund_financial_statements")
        .select("*")
        .eq("fund_id", fundId)
        .eq("quarter_date", quarterDate)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!fundId && !!quarterDate,
  });
}

export function useAllFundFS(quarterDate: string | null) {
  return useQuery({
    queryKey: ["all-fund-fs", quarterDate],
    queryFn: async () => {
      if (!quarterDate) return [];
      const { data, error } = await supabase
        .from("fund_financial_statements")
        .select("*, fund:funds(*)")
        .eq("quarter_date", quarterDate)
        .eq("confirmed", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!quarterDate,
  });
}

// ─── Direct Investments ───────────────────────────────────────────

export function useDirectInvestments() {
  return useQuery({
    queryKey: ["direct-investments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("direct_investments").select("*").order("company_name");
      if (error) throw error;
      return data || [];
    },
  });
}

// ─── Underlying Portfolio ─────────────────────────────────────────

export function useUnderlyingPortfolio(quarterDate: string | null) {
  return useQuery({
    queryKey: ["underlying-portfolio", quarterDate],
    queryFn: async () => {
      if (!quarterDate) return [];
      const { data, error } = await supabase
        .from("underlying_portfolio_holdings")
        .select("*")
        .eq("quarter_date", quarterDate)
        .order("twh_fmv", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!quarterDate,
  });
}

// ─── Underlying Transactions ──────────────────────────────────────

export function useUnderlyingTransactions(quarterDate: string | null) {
  return useQuery({
    queryKey: ["underlying-transactions", quarterDate],
    queryFn: async () => {
      if (!quarterDate) return [];
      const { data, error } = await supabase
        .from("underlying_portfolio_transactions")
        .select("*")
        .eq("quarter_date", quarterDate)
        .order("company_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!quarterDate,
  });
}

// ─── LP Cashflows ─────────────────────────────────────────────────

export function useLPCashflows(quarterDate?: string | null) {
  return useQuery({
    queryKey: ["lp-cashflows", quarterDate],
    queryFn: async () => {
      let q = supabase.from("fund_level_cashflows").select("*").order("cashflow_date");
      if (quarterDate) q = q.lte("cashflow_date", quarterDate);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

// ─── Quarterly History ────────────────────────────────────────────

export function useQuarterlyHistory() {
  return useQuery({
    queryKey: ["quarterly-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quarterly_history")
        .select("*")
        .order("quarter_date");
      if (error) throw error;
      return data || [];
    },
  });
}

// ─── App Settings ─────────────────────────────────────────────────

export function useAppSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*");
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const row of data || []) {
        map[row.key] = row.value;
      }
      return map;
    },
  });
}

export function useActiveQuarter() {
  // If QuarterContext is available, use it; otherwise fall back to app_settings
  try {
    const { useQuarterContext } = require("@/contexts/QuarterContext");
    const ctx = useQuarterContext();
    if (ctx) return ctx.selectedQuarter;
  } catch {
    // Context not available (e.g. outside provider)
  }
  const { data: settings } = useAppSettings();
  const activeQuarter = settings?.active_quarter as { quarter: string; date: string } | undefined;
  return activeQuarter || { quarter: "3Q25", date: "2025-09-30" };
}

// ─── Available Quarters ───────────────────────────────────────────

export function useAvailableQuarters() {
  return useQuery({
    queryKey: ["available-quarters"],
    queryFn: async () => {
      const { data: ffs } = await supabase
        .from("fund_financial_statements")
        .select("quarter_date")
        .eq("confirmed", true)
        .order("quarter_date", { ascending: false });
      const all = (ffs || []).map(r => r.quarter_date);
      return [...new Set(all)].sort((a, b) => b.localeCompare(a));
    },
  });
}

// ─── Portfolio Snapshot ───────────────────────────────────────────

export function usePortfolioSnapshot(quarterDate: string | null) {
  return useQuery({
    queryKey: ["portfolio-snapshot", quarterDate],
    queryFn: async () => {
      if (!quarterDate) return null;
      const { data, error } = await supabase
        .from("portfolio_snapshots")
        .select("*")
        .eq("quarter_date", quarterDate)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!quarterDate,
  });
}

// ─── Fund Reports (legacy) ───────────────────────────────────────

export function useFundReports(quarterDate: string | null) {
  return useQuery({
    queryKey: ["fund-reports", quarterDate],
    queryFn: async () => {
      if (!quarterDate) return [];
      const { data, error } = await supabase
        .from("fund_quarterly_reports")
        .select("*, fund:funds(*)")
        .eq("quarter_date", quarterDate);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!quarterDate,
  });
}

export function useDirectValuations(quarterDate: string | null) {
  return useQuery({
    queryKey: ["direct-valuations", quarterDate],
    queryFn: async () => {
      if (!quarterDate) return [];
      const { data, error } = await supabase
        .from("direct_quarterly_valuations")
        .select("*, company:direct_investments(*)")
        .eq("quarter_date", quarterDate);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!quarterDate,
  });
}
