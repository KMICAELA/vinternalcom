import { supabase } from "@/integrations/supabase/client";

export type FxRateSource = "manual" | "auto_ecb" | "auto_frankfurter";

export interface FundFxRate {
  id: string;
  fund_id: string | null;
  quarter_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  source: FxRateSource;
  updated_by: string | null;
  updated_at: string;
}

/**
 * Look up the FX rate to apply for a given fund + quarter + currency pair.
 * Resolution order: fund-specific row -> global row (fund_id null) -> null.
 * Caller is responsible for falling back to the legacy `fx_rates` table or
 * showing a "FX rate not set" warning.
 */
export async function getFundFxRate(
  fundId: string | null,
  quarterId: string,
  fromCurrency: string,
  toCurrency = "USD",
): Promise<FundFxRate | null> {
  if (!fromCurrency || fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return null;
  const { data, error } = await supabase
    .from("fund_fx_rates")
    .select("*")
    .eq("from_currency", fromCurrency)
    .eq("to_currency", toCurrency)
    .eq("quarter_id", quarterId)
    .or(fundId ? `fund_id.eq.${fundId},fund_id.is.null` : "fund_id.is.null");
  if (error || !data || data.length === 0) return null;
  // Prefer fund-specific over global
  const fundSpecific = data.find((r) => r.fund_id === fundId);
  return (fundSpecific ?? data[0]) as FundFxRate;
}

export function toUsd(nativeAmount: number | null | undefined, rate: number | null | undefined): number | null {
  if (nativeAmount == null || rate == null) return null;
  return nativeAmount * rate;
}
