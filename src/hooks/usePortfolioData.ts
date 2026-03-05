import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAvailableQuarters() {
  return useQuery({
    queryKey: ["available-quarters"],
    queryFn: async () => {
      const { data: fqr } = await supabase
        .from("fund_quarterly_reports")
        .select("quarter_date")
        .order("quarter_date", { ascending: false });
      const { data: dqv } = await supabase
        .from("direct_quarterly_valuations")
        .select("quarter_date")
        .order("quarter_date", { ascending: false });
      const all = [...(fqr || []).map(r => r.quarter_date), ...(dqv || []).map(r => r.quarter_date)];
      return [...new Set(all)].sort((a, b) => b.localeCompare(a));
    },
  });
}

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

export function useSaveQuarterlyData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      quarterDate: string;
      fundReports: { fund_id: string; capital_called_to_date: number; distributions_to_date: number; reported_nav: number }[];
      directValuations: { company_id: string; current_valuation: number; realized_proceeds_this_quarter: number }[];
      lpNav?: number;
    }) => {
      const { quarterDate, fundReports, directValuations, lpNav } = params;

      for (const fr of fundReports) {
        const { error } = await supabase.from("fund_quarterly_reports").upsert(
          { fund_id: fr.fund_id, quarter_date: quarterDate, capital_called_to_date: fr.capital_called_to_date, distributions_to_date: fr.distributions_to_date, reported_nav: fr.reported_nav },
          { onConflict: "fund_id,quarter_date" }
        );
        if (error) throw error;
      }

      for (const dv of directValuations) {
        const { error } = await supabase.from("direct_quarterly_valuations").upsert(
          { company_id: dv.company_id, quarter_date: quarterDate, current_valuation: dv.current_valuation, realized_proceeds_this_quarter: dv.realized_proceeds_this_quarter },
          { onConflict: "company_id,quarter_date" }
        );
        if (error) throw error;
      }

      if (lpNav !== undefined) {
        const { error } = await supabase.from("portfolio_snapshots").upsert(
          { quarter_date: quarterDate, lp_nav: lpNav },
          { onConflict: "quarter_date" }
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fund-reports"] });
      qc.invalidateQueries({ queryKey: ["direct-valuations"] });
      qc.invalidateQueries({ queryKey: ["portfolio-snapshot"] });
      qc.invalidateQueries({ queryKey: ["available-quarters"] });
    },
  });
}
