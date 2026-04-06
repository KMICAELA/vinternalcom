import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a financial data extraction assistant for a venture fund-of-funds. Extract ALL of the following from this fund financial statement and return ONLY valid JSON with no markdown or explanation.

Return this exact JSON structure:
{
  "fund_summary": {
    "nav": <number or null>,
    "total_capital_called": <number or null>,
    "total_distributions": <number or null>,
    "unfunded_commitment": <number or null>,
    "gross_irr": <number as decimal e.g. 0.15 for 15%, or null>,
    "gross_tvpi": <number or null>,
    "net_irr": <number as decimal or null>,
    "net_tvpi": <number or null>,
    "dpi": <number or null>,
    "rvpi": <number or null>,
    "pic": <number as decimal or null>,
    "commitment": <number or null>,
    "currency": "USD",
    "as_of_date": "YYYY-MM-DD"
  },
  "portfolio_companies": [
    {
      "name": "",
      "investment_cost": <number or null>,
      "fair_market_value": <number or null>,
      "realized_proceeds": <number or null>,
      "sector": <string or null>,
      "region": <string or null>,
      "instrument": <string or null>,
      "round": <string or null>,
      "status": "active" | "realized" | "written_off" | null
    }
  ],
  "cashflow_activity": [
    {
      "date": "YYYY-MM-DD",
      "type": "capital_call" | "distribution" | "recallable",
      "amount": <number>,
      "description": <string or null>
    }
  ],
  "extraction_confidence": <number 0-1>,
  "extraction_notes": ["any notes about uncertain or missing data"]
}

All monetary numbers in base currency units (no formatting, no commas). Use null if data is not found.
IRR values should be expressed as decimals (e.g. 0.15 for 15%).
TVPI/DPI/RVPI/PIC as raw multiples or decimals.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdf_base64, file_name, template } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let enhancedPrompt = `Please extract the financial data from this fund financial statement PDF (${file_name || 'document'}).`;

    if (template && template.field_mappings) {
      enhancedPrompt += `\n\nThis fund has known field mappings from previous extractions. Use these as hints for where to find data:\n${JSON.stringify(template.field_mappings, null, 2)}`;
    }
    if (template && template.sample_extraction) {
      enhancedPrompt += `\n\nHere is a sample of previously extracted data from this fund for reference:\n${JSON.stringify(template.sample_extraction, null, 2)}`;
    }

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
              { type: "text", text: enhancedPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdf_base64}`,
                },
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
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
    console.error("extract-fund-fs error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
