import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useFxRate(currencyPair: string, rateDate: string | null) {
  return useQuery({
    queryKey: ["fx-rate", currencyPair, rateDate],
    queryFn: async () => {
      if (!rateDate) return null;
      const { data, error } = await supabase
        .from("fx_rates")
        .select("*")
        .eq("currency_pair", currencyPair)
        .eq("rate_date", rateDate)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!rateDate && !!currencyPair,
  });
}

export function useFxRatesForQuarter(rateDate: string | null) {
  return useQuery({
    queryKey: ["fx-rates-quarter", rateDate],
    queryFn: async () => {
      if (!rateDate) return [];
      const { data, error } = await supabase
        .from("fx_rates")
        .select("*")
        .eq("rate_date", rateDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!rateDate,
  });
}

export function useUpsertFxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      currency_pair: string;
      rate: number;
      rate_date: string;
      source: string;
    }) => {
      const { data, error } = await supabase
        .from("fx_rates")
        .upsert(params, { onConflict: "currency_pair,rate_date" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fx-rate"] });
      qc.invalidateQueries({ queryKey: ["fx-rates-quarter"] });
    },
  });
}
