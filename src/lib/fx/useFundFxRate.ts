import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FundFxRate } from "@/lib/fx/convert";
import { getFundFxRate } from "@/lib/fx/convert";

/**
 * Look up the FX rate to use for a given fund + quarter, plus the updater's display name.
 * Returns null while loading and stays null when no rate is configured.
 */
export function useFundFxRate(
  fundId: string | null | undefined,
  quarterId: string | null | undefined,
  fromCurrency: string | null | undefined,
  toCurrency: string = "USD",
) {
  const [rate, setRate] = useState<FundFxRate | null>(null);
  const [updaterName, setUpdaterName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fundId || !quarterId || !fromCurrency || fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      setRate(null);
      setUpdaterName(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await getFundFxRate(fundId, quarterId, fromCurrency, toCurrency);
      if (cancelled) return;
      setRate(r);
      if (r?.updated_by) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name,email")
          .eq("id", r.updated_by)
          .maybeSingle();
        if (!cancelled) setUpdaterName((data as any)?.full_name ?? (data as any)?.email ?? null);
      } else {
        setUpdaterName(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fundId, quarterId, fromCurrency, toCurrency]);

  return { rate, updaterName, loading };
}
