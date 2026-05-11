// Generates a quarterly digest comparing the selected quarter vs the prior quarter.
// Uses Lovable AI Gateway (google/gemini-2.5-pro) — no extra API key required.
// Returns an array of { category, body_md, position } that the client persists into `highlights`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "google/gemini-2.5-pro";

const CATEGORIES = [
  "Executive Summary",
  "Performance Movers",
  "New Investments",
  "Realizations & Exits",
  "Valuation Changes",
  "Risks & Watchlist",
] as const;

const SYSTEM = `You are an investment analyst writing a quarterly digest for TWH Americas Fund I (a venture fund-of-funds managed by 1200VC).
Compare the SELECTED quarter to the PRIOR quarter using the data provided and produce a concise narrative for each category.
Tone: factual, institutional LP-letter style. Avoid hype. Use specific numbers (USD) and percentages where the data supports it.
Output STRICT JSON only — no prose outside the JSON — matching this schema:
{
  "sections": [
    { "category": "<one of the provided categories>", "body_md": "<markdown body, 2-6 short bullets or 1-2 short paragraphs>" }
  ]
}
Rules:
- Produce exactly one section per category provided in the user message, in the same order.
- If the data is insufficient for a category, write a single short bullet acknowledging that ("- No material activity this quarter.").
- Use markdown bullets ("- ") for lists. No headings inside body_md (the category is the heading).
- Never invent companies, funds, or numbers that are not in the data.
- Keep each section under ~120 words.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { quarter_id } = await req.json();
    if (!quarter_id) {
      return json({ error: "quarter_id is required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load quarters and find current + prior
    const { data: quarters } = await supabase
      .from("quarters")
      .select("id, label, quarter_end_date, fiscal_year, fiscal_quarter")
      .order("quarter_end_date", { ascending: true });
    if (!quarters?.length) return json({ error: "No quarters defined" }, 400);
    const idx = quarters.findIndex((q) => q.id === quarter_id);
    if (idx < 0) return json({ error: "Quarter not found" }, 400);
    const current = quarters[idx];
    const prior = idx > 0 ? quarters[idx - 1] : null;

    // Helper to load a quarter's bundle
    const loadBundle = async (qid: string) => {
      const [snaps, directs, holdings] = await Promise.all([
        supabase
          .from("fund_quarter_snapshots")
          .select("fund_id, twh_contributions_usd, twh_distributions_usd, twh_nav_usd, fund_total_contributions_usd, fund_total_nav_usd")
          .eq("quarter_id", qid),
        supabase
          .from("direct_quarter_snapshots")
          .select("direct_id, twh_fmv_usd, twh_proceeds_usd")
          .eq("quarter_id", qid),
        supabase
          .from("underlying_holdings")
          .select("fund_id, company_id, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd, investment_date, round")
          .eq("quarter_id", qid)
          .is("removed_at", null),
      ]);
      return {
        snapshots: snaps.data ?? [],
        directs: directs.data ?? [],
        holdings: holdings.data ?? [],
      };
    };

    const [funds, companies, directsAll, currentBundle, priorBundle] = await Promise.all([
      supabase.from("funds").select("id, name, short_name").then((r) => r.data ?? []),
      supabase.from("companies").select("id, legal_name, commercial_name").then((r) => r.data ?? []),
      supabase.from("directs").select("id, company_id, investment_date, round").then((r) => r.data ?? []),
      loadBundle(current.id),
      prior ? loadBundle(prior.id) : Promise.resolve({ snapshots: [], directs: [], holdings: [] }),
    ]);

    const fundName = (id: string) => funds.find((f) => f.id === id)?.short_name || funds.find((f) => f.id === id)?.name || id;
    const companyName = (id: string) =>
      companies.find((c) => c.id === id)?.commercial_name || companies.find((c) => c.id === id)?.legal_name || id;
    const directLabel = (id: string) => {
      const d = directsAll.find((x) => x.id === id);
      return d ? companyName(d.company_id) : id;
    };

    // Reduce snapshots into a per-fund row with named entities
    const reduceFunds = (b: typeof currentBundle) =>
      b.snapshots.map((s: any) => ({
        fund: fundName(s.fund_id),
        twh_contrib: Number(s.twh_contributions_usd) || 0,
        twh_distrib: Number(s.twh_distributions_usd) || 0,
        twh_nav: Number(s.twh_nav_usd) || 0,
      }));
    const reduceDirects = (b: typeof currentBundle) =>
      b.directs.map((d: any) => ({
        company: directLabel(d.direct_id),
        fmv: Number(d.twh_fmv_usd) || 0,
        proceeds: Number(d.twh_proceeds_usd) || 0,
      }));
    const reduceHoldings = (b: typeof currentBundle) =>
      b.holdings.map((h: any) => ({
        fund: fundName(h.fund_id),
        company: companyName(h.company_id),
        cost: Number(h.fund_cost_usd) || 0,
        fmv: Number(h.fund_fmv_usd) || 0,
        proceeds: Number(h.fund_proceeds_usd) || 0,
        round: h.round,
        invested: h.investment_date,
      }));

    const dataForModel = {
      selected_quarter: { label: current.label, end_date: current.quarter_end_date },
      prior_quarter: prior ? { label: prior.label, end_date: prior.quarter_end_date } : null,
      current: {
        funds: reduceFunds(currentBundle),
        directs: reduceDirects(currentBundle),
        holdings: reduceHoldings(currentBundle),
      },
      prior: prior
        ? {
            funds: reduceFunds(priorBundle),
            directs: reduceDirects(priorBundle),
            holdings: reduceHoldings(priorBundle),
          }
        : null,
    };

    const userPrompt = `Categories (produce one section per category, in this order): ${JSON.stringify(CATEGORIES)}\n\nData:\n${JSON.stringify(dataForModel)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      if (aiRes.status === 429) return json({ error: "Rate limit exceeded. Try again shortly." }, 429);
      if (aiRes.status === 402) return json({ error: "AI credits exhausted. Add credits in Settings → Workspace." }, 402);
      return json({ error: `AI call failed: ${text}` }, 500);
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content;
    if (!content) return json({ error: "Empty AI response" }, 500);

    let parsed: { sections: { category: string; body_md: string }[] };
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      return json({ error: "Failed to parse AI JSON" }, 500);
    }

    const sections = (parsed.sections ?? []).map((s, i) => ({
      category: s.category,
      body_md: s.body_md,
      position: i,
    }));

    return json({ sections, meta: { current: current.label, prior: prior?.label ?? null } });
  } catch (err) {
    console.error("generate-highlights error", err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
