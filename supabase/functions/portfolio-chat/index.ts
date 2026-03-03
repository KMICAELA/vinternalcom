import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build portfolio context from the static data embedded here
    // In a production app you'd fetch from DB, but the data lives in the frontend currently
    const portfolioContext = `
You are an AI assistant for TWH Americas Fund I, LP — a venture capital fund of funds.
You have access to the fund's Q3 2025 portfolio data. Answer questions accurately based on this data.
If you don't know something or the data doesn't cover it, say so honestly.

## Fund Summary (Q3 2025)
- Fund Name: TWH Americas Fund I, LP
- Report Date: September 30, 2025
- Ownership: 14.99%
- Total Contributions: $3,597,577.62
- Total Distributions: $0
- Net Asset Value (NAV): $3,036,100.75
- Net TVPI: 0.84x | Net IRR: -46.78%
- Gross NAV: $7,086,556
- Gross TVPI: 2.06x | Gross IRR: 134.04%

## Fund Investments (9 funds):
1. Lowercarbon 421.0 Parallel Fund, LP — Commitment: $1M, Contributed: $668,900, NAV: $852,595, TVPI: 1.32x, IRR: 0.80%
2. Third Sphere Fund IV, LP — Commitment: $2M, Contributed: $1M, NAV: $716,638, TVPI: 0.73x, IRR: -49.44%
3. Tamarack Global Opportunities II, LP — Commitment: $2M, Contributed: $1.45M, NAV: $4,120,927, TVPI: 3.31x, IRR: 22.71%
4. Generational Partners Fund I, LP — Commitment: $1M, Contributed: $500K, NAV: $502,074, TVPI: 1.00x, IRR: -79.47%
5. Leap Global Partners Fund II, LP — Commitment: $1M, Contributed: $460K, NAV: $474,322, TVPI: 1.06x, IRR: -98.74%
6. SVLC Fund III, LP — Commitment: $1M, Contributed: $740,811, NAV: $656,682, TVPI: 0.89x, IRR: 0.00%
7. Cantos Ventures IV, LP — Commitment: $2M, Contributed: $700K, NAV: $776,942, TVPI: 1.15x, IRR: 0.00%
8. Quantonation 2 Feeder, LLC — Commitment: $1,066,142.52, Contributed: $517,838.40, NAV: $539,716.48, TVPI: 1.04x, IRR: 0.00%
9. ONEVC Fund III, LP — Commitment: $1M, Contributed: $80K, NAV: $70,422, TVPI: 0.88x, IRR: 0.00%

## Direct Investments (7):
1. 101OBEX, CORP — SAFE, Seed, Cost: $420K, FMV: $420K, MOIC: 1.00x
2. Earth AI, Inc. — SAFE, B, Cost: $750K, FMV: $750K, MOIC: 1.00x
3. Generational Partners X VL SPV1 — SPV, Seed, Cost: $650K, FMV: $650K, MOIC: 1.00x
4. BRK Health Solutions — SAFE, A, Cost: $1M, FMV: $1M, MOIC: 1.00x
5. Canto of Arcadia, LP — SPV, B, Cost: $500K, FMV: $500K, MOIC: 1.00x
6. Ares Materials, Inc. — Pref. Equity, B, Cost: $500K, FMV: $500K, MOIC: 1.00x
7. Earth AI, Inc. (2nd) — SAFE, B, Cost: $250K, FMV: $250K, MOIC: 1.00x

## Top Performing Underlying Holdings:
- Figure AI Inc. (via Tamarack) — MOIC: 32.02x, TWH FMV: $2,708,266
- Crux Climate, Inc. (via Lowercarbon) — MOIC: 4.57x, TWH FMV: $131,518
- General Biological Corp (via Lowercarbon) — MOIC: 4.03x, TWH FMV: $93,274
- Chaos Industries (via Tamarack) — MOIC: 3.27x, TWH FMV: $476,288
- Impulse Space (via Tamarack) — MOIC: 3.11x, TWH FMV: $473,903
- Earth XYZ (via Lowercarbon) — MOIC: 2.91x, TWH FMV: $48,458

## Portfolio Companies (selected descriptions):
- 101OBEX: Full-stack API platform for core banking and fintech solutions
- Figure AI: AI-powered humanoid robots for manufacturing, logistics, warehousing
- Earth AI: AI-integrated geological exploration for clean energy metals
- BRK Health (Clivi): Digital clinic in Mexico for weight and glucose management
- Diraq: Silicon-based quantum processors leveraging CMOS fabrication
- Impulse Space: In-space transportation and orbital transfer vehicles
- Crux Climate: Fintech platform for clean energy tax credits
- Chaos Industries: Advanced military communication systems (HYDRA)
- ElectroPhotonic-IC: Integrated electro-photonic chips for datacenters and AI
- Fuse Energy: Fusion energy via Magnetized-Liner Inertial Fusion

## Key Metrics Explanation:
- TVPI (Total Value to Paid-In): Total value (NAV + distributions) / contributions. >1x means positive return.
- IRR (Internal Rate of Return): Time-weighted annualized return.
- MOIC (Multiple on Invested Capital): FMV / cost basis.
- DPI (Distributions to Paid-In): Distributions / contributions. Higher = more cash returned.
- RVPI (Residual Value to Paid-In): NAV / contributions. Unrealized value remaining.
- PIC (Paid-In Capital): Capital called / committed.

Format responses in a clean, readable way. Use bullet points and numbered lists rather than markdown tables. Use **bold** for emphasis on key numbers. Keep responses concise and conversational. Never use pipe characters for tables.
`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: portfolioContext },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("portfolio-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
