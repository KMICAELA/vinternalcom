import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PCAP_SYSTEM_PROMPT = `You are extracting data from a Partner Capital Account Statement (PCAP) for a venture capital fund investment. The investor is TWH Americas Fund I, LP (may also appear as "1200 VC", "TWH-1", or "TWH Americas").

Extract the following data points. For each, provide the value and a confidence score (0.0-1.0).

Return ONLY valid JSON with no markdown or explanation, using this exact structure:

{
  "partner_capital_account": {
    "beginning_balance": {"value": <number or null>, "confidence": <0-1>},
    "contributions": {"value": <number or null>, "confidence": <0-1>},
    "distributions": {"value": <number or null>, "confidence": <0-1>},
    "net_income_loss": {"value": <number or null>, "confidence": <0-1>},
    "management_fees": {"value": <number or null>, "confidence": <0-1>},
    "carried_interest": {"value": <number or null>, "confidence": <0-1>},
    "ending_balance": {"value": <number or null>, "confidence": <0-1>},
    "twh_entity_name": {"value": <string or null>, "confidence": <0-1>}
  },
  "fund_summary": {
    "total_fund_nav": {"value": <number or null>, "confidence": <0-1>},
    "total_commitments": {"value": <number or null>, "confidence": <0-1>},
    "total_called": {"value": <number or null>, "confidence": <0-1>},
    "total_distributed": {"value": <number or null>, "confidence": <0-1>},
    "remaining_commitment": {"value": <number or null>, "confidence": <0-1>}
  },
  "twh_ownership_pct": {"value": <number or null>, "confidence": <0-1>},
  "underlying_portfolio": [
    {
      "company_name": "",
      "instrument": <string or null>,
      "cost": <number or null>,
      "fair_value": <number or null>,
      "status": <string or null>,
      "pct_of_fund": <number or null>
    }
  ],
  "performance_metrics": {
    "gross_moic": {"value": <number or null>, "confidence": <0-1>},
    "gross_irr": {"value": <number or null>, "confidence": <0-1>},
    "net_moic": {"value": <number or null>, "confidence": <0-1>},
    "net_irr": {"value": <number or null>, "confidence": <0-1>},
    "dpi": {"value": <number or null>, "confidence": <0-1>},
    "rvpi": {"value": <number or null>, "confidence": <0-1>},
    "tvpi": {"value": <number or null>, "confidence": <0-1>},
    "pic": {"value": <number or null>, "confidence": <0-1>}
  },
  "extraction_notes": ["any warnings or flags about the extraction"]
}

IMPORTANT RULES:
- If a field is not found, return null with confidence 0
- If a value seems unusual (e.g., NAV dropped >50% quarter over quarter), flag it in extraction_notes
- Some PCAPs embed the partner capital account in a larger document — look for section headers like "Schedule of Partners Capital", "Capital Account Statement", "Statement of Partners Equity"
- Dollar values should be extracted as plain numbers without currency symbols
- Percentages should be extracted as raw numbers (e.g., 15.5 not 0.155)
- IRR values should be decimals (e.g., 0.15 for 15%)
- MOIC/TVPI/DPI/RVPI as raw multiples`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fund_id, quarter, quarter_date, pdf_base64, file_name, document_path } = await req.json();
    
    if (!fund_id || !quarter_date) {
      return new Response(JSON.stringify({ error: "fund_id and quarter_date are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Step 1: Check for fund extraction template
    let templateGuidance = "";
    const { data: tmpl } = await sb
      .from("fund_extraction_templates")
      .select("field_mappings, extraction_notes")
      .eq("fund_id", fund_id)
      .eq("is_active", true)
      .eq("document_type", "pcap")
      .maybeSingle();

    // Fall back to quarterly_report template if no PCAP-specific one
    if (!tmpl) {
      const { data: fallback } = await sb
        .from("fund_extraction_templates")
        .select("field_mappings, extraction_notes")
        .eq("fund_id", fund_id)
        .eq("is_active", true)
        .eq("document_type", "quarterly_report")
        .maybeSingle();
      if (fallback) {
        templateGuidance = `\n\nFUND-SPECIFIC GUIDANCE:\n`;
        if (fallback.field_mappings) {
          for (const [field, config] of Object.entries(fallback.field_mappings as Record<string, any>)) {
            if (config.location) {
              templateGuidance += `- "${field}": look in ${config.location}`;
              if (config.label_variations?.length) templateGuidance += ` (may be labeled: ${config.label_variations.join(", ")})`;
              templateGuidance += `\n`;
            }
          }
        }
        if (fallback.extraction_notes) templateGuidance += `\nSpecial notes: ${fallback.extraction_notes}`;
      }
    } else {
      templateGuidance = `\n\nFUND-SPECIFIC GUIDANCE:\n`;
      if (tmpl.field_mappings) {
        for (const [field, config] of Object.entries(tmpl.field_mappings as Record<string, any>)) {
          if (config.location) {
            templateGuidance += `- "${field}": look in ${config.location}`;
            if (config.label_variations?.length) templateGuidance += ` (may be labeled: ${config.label_variations.join(", ")})`;
            templateGuidance += `\n`;
          }
        }
      }
      if (tmpl.extraction_notes) templateGuidance += `\nSpecial notes: ${tmpl.extraction_notes}`;
    }

    // Step 2: Build prompt and call Gemini
    const userPrompt = `Extract the PCAP data from this document.${templateGuidance}`;

    const isTextContent = file_name?.endsWith('.txt');
    let userContent: any;
    if (isTextContent) {
      const textBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));
      const decodedText = new TextDecoder().decode(textBytes);
      userContent = [{ type: "text", text: userPrompt + "\n\n--- DOCUMENT CONTENT ---\n\n" + decodedText }];
    } else {
      const mimeType = file_name?.endsWith('.xlsx')
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : file_name?.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf';
      userContent = [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${pdf_base64}` } },
      ];
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
          { role: "system", content: PCAP_SYSTEM_PROMPT },
          { role: "user", content: userContent },
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

    // Step 3: Parse response
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error("Could not parse PCAP extraction as JSON");
      }
    }

    // Step 4: Flatten extracted data and confidence scores
    const extractVal = (obj: any) => obj?.value ?? obj ?? null;
    const extractConf = (obj: any) => obj?.confidence ?? null;

    const extractedData = {
      partner_capital_account: {
        beginning_balance: extractVal(parsed.partner_capital_account?.beginning_balance),
        contributions: extractVal(parsed.partner_capital_account?.contributions),
        distributions: extractVal(parsed.partner_capital_account?.distributions),
        net_income_loss: extractVal(parsed.partner_capital_account?.net_income_loss),
        management_fees: extractVal(parsed.partner_capital_account?.management_fees),
        carried_interest: extractVal(parsed.partner_capital_account?.carried_interest),
        ending_balance: extractVal(parsed.partner_capital_account?.ending_balance),
        twh_entity_name: extractVal(parsed.partner_capital_account?.twh_entity_name),
      },
      fund_summary: {
        total_fund_nav: extractVal(parsed.fund_summary?.total_fund_nav),
        total_commitments: extractVal(parsed.fund_summary?.total_commitments),
        total_called: extractVal(parsed.fund_summary?.total_called),
        total_distributed: extractVal(parsed.fund_summary?.total_distributed),
        remaining_commitment: extractVal(parsed.fund_summary?.remaining_commitment),
      },
      twh_ownership_pct: extractVal(parsed.twh_ownership_pct),
      underlying_portfolio: parsed.underlying_portfolio || [],
      performance_metrics: {
        gross_moic: extractVal(parsed.performance_metrics?.gross_moic),
        gross_irr: extractVal(parsed.performance_metrics?.gross_irr),
        net_moic: extractVal(parsed.performance_metrics?.net_moic),
        net_irr: extractVal(parsed.performance_metrics?.net_irr),
        dpi: extractVal(parsed.performance_metrics?.dpi),
        rvpi: extractVal(parsed.performance_metrics?.rvpi),
        tvpi: extractVal(parsed.performance_metrics?.tvpi),
        pic: extractVal(parsed.performance_metrics?.pic),
      },
    };

    const confidenceScores: Record<string, number | null> = {};
    for (const [section, fields] of Object.entries(parsed)) {
      if (section === "underlying_portfolio" || section === "extraction_notes") continue;
      if (typeof fields === "object" && fields !== null && "confidence" in fields) {
        confidenceScores[section] = extractConf(fields);
      } else if (typeof fields === "object" && fields !== null) {
        for (const [key, val] of Object.entries(fields as Record<string, any>)) {
          confidenceScores[`${section}.${key}`] = extractConf(val);
        }
      }
    }

    // Step 5: Validation checks
    const notes: string[] = parsed.extraction_notes || [];
    let status = "extracted";

    const pca = extractedData.partner_capital_account;
    if (pca.beginning_balance != null && pca.contributions != null && pca.ending_balance != null) {
      const expected = (pca.beginning_balance || 0) + (pca.contributions || 0) - (pca.distributions || 0) + (pca.net_income_loss || 0) + (pca.management_fees || 0) - (pca.carried_interest || 0);
      const diff = Math.abs((pca.ending_balance || 0) - expected);
      if (diff > 1000) {
        notes.push(`Capital account balance check failed: expected ~${expected.toLocaleString()}, got ${pca.ending_balance?.toLocaleString()}. Difference: ${diff.toLocaleString()}`);
      }
    }

    if (extractedData.twh_ownership_pct != null) {
      if (extractedData.twh_ownership_pct < 0.1 || extractedData.twh_ownership_pct > 50) {
        notes.push(`TWH ownership % (${extractedData.twh_ownership_pct}%) seems unusual — expected 0.1%-50%`);
      }
    }

    // Check critical field confidence
    const criticalFields = [
      "partner_capital_account.ending_balance",
      "partner_capital_account.contributions",
      "fund_summary.total_fund_nav",
    ];
    for (const f of criticalFields) {
      const conf = confidenceScores[f];
      if (conf != null && conf < 0.7) {
        notes.push(`Low confidence (${conf}) on critical field: ${f}`);
        status = "error";
      }
    }

    // Step 6: Save to database
    const { data: saved, error: saveError } = await sb
      .from("pcap_extractions")
      .upsert({
        fund_id,
        quarter: quarter || "",
        quarter_date,
        document_path: document_path || null,
        extraction_status: status,
        extracted_data: extractedData,
        confidence_scores: confidenceScores,
        extraction_notes: notes.length > 0 ? notes.join("\n") : null,
      }, { onConflict: "fund_id,quarter_date" })
      .select()
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
      throw new Error(`Failed to save PCAP extraction: ${saveError.message}`);
    }

    return new Response(JSON.stringify({
      id: saved.id,
      status,
      extracted_data: extractedData,
      confidence_scores: confidenceScores,
      notes,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-pcap error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
