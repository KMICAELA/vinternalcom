import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a financial document extraction assistant for a venture fund-of-funds making direct co-investments. You are extracting data from a term sheet, side letter, investment memo, or similar deal document for a direct co-investment.

Extract ALL of the following and return ONLY valid JSON with no markdown or explanation:

{
  "company_name": "<string>",
  "cost_basis": <number or null - the investment amount in base currency>,
  "instrument": "<string or null - e.g. Equity, SAFE, Convertible Note, Preferred Stock, Common Stock>",
  "round": "<string or null - e.g. Series A, Seed, Pre-Seed, Series B>",
  "investment_date": "<YYYY-MM-DD or null>",
  "ownership_percentage": <number as percentage e.g. 5.0 for 5%, or null>,
  "co_investors": "<comma-separated names or null>",
  "strategy": "<string or null - e.g. Direct, Co-Investment>",
  "geography": "<string or null - country or region>",
  "valuation_cap": <number or null>,
  "pre_money_valuation": <number or null>,
  "post_money_valuation": <number or null>,
  "key_terms": "<brief summary of key terms or null>",
  "confidence": <number 0-1 indicating extraction confidence>,
  "notes": ["<any notes about uncertain or missing data>"]
}

All monetary numbers in base currency units (no formatting). Use null if data is not found.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdf_base64, file_name } = await req.json();
    if (!pdf_base64) throw new Error("pdf_base64 is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract deal data from this document (${file_name || 'document'}).` },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${pdf_base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error("Could not parse extracted data as JSON");
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-direct-doc error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
