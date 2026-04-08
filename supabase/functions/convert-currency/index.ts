import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { amount, source_currency, target_currency, rate_date } = await req.json();

    if (!amount || !source_currency || !target_currency || !rate_date) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: amount, source_currency, target_currency, rate_date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (source_currency === target_currency) {
      return new Response(
        JSON.stringify({ converted_amount: amount, rate_used: 1, rate_source: "identity" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const pair = `${source_currency}/${target_currency}`;
    const inversePair = `${target_currency}/${source_currency}`;

    // Try to find rate in database
    const { data: directRate } = await supabase
      .from("fx_rates")
      .select("*")
      .eq("currency_pair", pair)
      .eq("rate_date", rate_date)
      .maybeSingle();

    if (directRate) {
      const converted = amount * Number(directRate.rate);
      return new Response(
        JSON.stringify({
          converted_amount: Math.round(converted * 100) / 100,
          rate_used: Number(directRate.rate),
          rate_source: directRate.source,
          fx_rate_id: directRate.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try inverse rate
    const { data: inverseRate } = await supabase
      .from("fx_rates")
      .select("*")
      .eq("currency_pair", inversePair)
      .eq("rate_date", rate_date)
      .maybeSingle();

    if (inverseRate) {
      const rate = 1 / Number(inverseRate.rate);
      const converted = amount * rate;
      return new Response(
        JSON.stringify({
          converted_amount: Math.round(converted * 100) / 100,
          rate_used: Math.round(rate * 10000) / 10000,
          rate_source: `${inverseRate.source} (inverse)`,
          fx_rate_id: inverseRate.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try fetching from ECB API (free, no key needed)
    try {
      const ecbUrl = `https://data-api.ecb.europa.eu/service/data/EXR/D.${source_currency === "EUR" ? target_currency : source_currency}.EUR.SP00.A?startPeriod=${rate_date}&endPeriod=${rate_date}&format=jsondata`;
      const ecbResp = await fetch(ecbUrl);
      
      if (ecbResp.ok) {
        const ecbData = await ecbResp.json();
        const observations = ecbData?.dataSets?.[0]?.series?.["0:0:0:0:0"]?.observations;
        if (observations) {
          const keys = Object.keys(observations);
          if (keys.length > 0) {
            let ecbRate = Number(observations[keys[0]][0]);
            // ECB quotes EUR/XXX, so if source is EUR we use directly, otherwise invert
            if (source_currency !== "EUR") {
              ecbRate = 1 / ecbRate;
            }

            // Store the rate for future use
            const { data: savedRate } = await supabase
              .from("fx_rates")
              .insert({
                currency_pair: pair,
                rate: ecbRate,
                rate_date,
                source: "ECB",
              })
              .select()
              .single();

            const converted = amount * ecbRate;
            return new Response(
              JSON.stringify({
                converted_amount: Math.round(converted * 100) / 100,
                rate_used: Math.round(ecbRate * 10000) / 10000,
                rate_source: "ECB (auto-fetched)",
                fx_rate_id: savedRate?.id || null,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    } catch (ecbErr) {
      console.error("ECB fetch failed:", ecbErr);
    }

    // No rate found anywhere
    return new Response(
      JSON.stringify({
        error: `No FX rate found for ${pair} on ${rate_date}. Please enter the rate manually.`,
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("convert-currency error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
