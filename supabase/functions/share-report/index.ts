// Public edge function: validates a quarter share token and returns the assembled
// read-only quarterly report payload. Uses the service role to bypass RLS after
// token validation.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return json({ error: "Missing token" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Validate token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("quarter_share_tokens")
      .select("id, quarter_id, revoked, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr || !tokenRow) return json({ error: "Invalid token" }, 404);
    if (tokenRow.revoked) return json({ error: "Token revoked" }, 403);
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) <= new Date()) {
      return json({ error: "Token expired" }, 403);
    }

    const quarterId = tokenRow.quarter_id;

    // 2. Quarter
    const { data: quarter } = await supabase
      .from("quarters")
      .select("id, label, fiscal_year, fiscal_quarter, quarter_end_date, status")
      .eq("id", quarterId)
      .maybeSingle();
    if (!quarter) return json({ error: "Quarter not found" }, 404);

    // 3. Fund snapshots for the quarter
    const { data: fundSnaps } = await supabase
      .from("fund_quarter_snapshots")
      .select(
        "fund_id, twh_contributions_usd, twh_distributions_usd, twh_nav_usd, fund_total_nav_usd",
      )
      .eq("quarter_id", quarterId);

    const { data: funds } = await supabase
      .from("funds")
      .select("id, name, short_name, archived")
      .eq("archived", false);

    const fundMap = new Map((funds ?? []).map((f) => [f.id, f]));
    const fundsAssembled = (fundSnaps ?? [])
      .map((s: any) => {
        const f = fundMap.get(s.fund_id);
        if (!f) return null;
        const contrib = Number(s.twh_contributions_usd || 0);
        const distrib = Number(s.twh_distributions_usd || 0);
        const nav = Number(s.twh_nav_usd || 0);
        const tvpi = contrib > 0 ? (nav + distrib) / contrib : null;
        const dpi = contrib > 0 ? distrib / contrib : null;
        return {
          id: f.id,
          name: f.short_name || f.name,
          contributions: contrib,
          distributions: distrib,
          nav,
          tvpi,
          dpi,
        };
      })
      .filter(Boolean);

    // 4. Direct snapshots + cost
    const { data: directs } = await supabase
      .from("directs")
      .select("id, company_id, twh_cost_usd");
    const { data: directSnaps } = await supabase
      .from("direct_quarter_snapshots")
      .select("direct_id, twh_fmv_usd, twh_proceeds_usd")
      .eq("quarter_id", quarterId);
    const { data: companies } = await supabase
      .from("companies")
      .select("id, legal_name, commercial_name, what_they_do");

    const companyMap = new Map((companies ?? []).map((c) => [c.id, c]));
    const directMap = new Map((directs ?? []).map((d) => [d.id, d]));

    const directsAssembled = (directSnaps ?? [])
      .map((s: any) => {
        const d: any = directMap.get(s.direct_id);
        if (!d) return null;
        const c: any = companyMap.get(d.company_id);
        const cost = Number(d.twh_cost_usd || 0);
        const fmv = Number(s.twh_fmv_usd || 0);
        const proceeds = Number(s.twh_proceeds_usd || 0);
        const moic = cost > 0 ? (fmv + proceeds) / cost : null;
        return {
          id: d.id,
          name: c?.commercial_name || c?.legal_name || "Unknown",
          what_they_do: c?.what_they_do ?? null,
          cost,
          fmv,
          proceeds,
          moic,
        };
      })
      .filter(Boolean);

    // 5. KPIs
    const totalContrib = fundsAssembled.reduce((a: number, f: any) => a + f.contributions, 0);
    const totalDistrib = fundsAssembled.reduce((a: number, f: any) => a + f.distributions, 0);
    const totalNav = fundsAssembled.reduce((a: number, f: any) => a + f.nav, 0);
    const directFmv = directsAssembled.reduce((a: number, d: any) => a + d.fmv, 0);
    const directCost = directsAssembled.reduce((a: number, d: any) => a + d.cost, 0);
    const directProceeds = directsAssembled.reduce((a: number, d: any) => a + d.proceeds, 0);

    const portfolioValue = totalNav + directFmv;
    const portfolioContrib = totalContrib + directCost;
    const portfolioDistrib = totalDistrib + directProceeds;
    const tvpi = portfolioContrib > 0 ? (portfolioValue + portfolioDistrib) / portfolioContrib : null;
    const dpi = portfolioContrib > 0 ? portfolioDistrib / portfolioContrib : null;

    // 6. Final highlights only
    const { data: highlights } = await supabase
      .from("highlights")
      .select("category, body_md, position")
      .eq("quarter_id", quarterId)
      .eq("draft", false)
      .order("position", { ascending: true });

    // 7. Top sorts
    const topFunds = [...fundsAssembled].sort((a: any, b: any) => b.nav - a.nav).slice(0, 5);
    const topDirects = [...directsAssembled].sort((a: any, b: any) => b.fmv - a.fmv).slice(0, 5);

    return json({
      quarter,
      kpis: {
        portfolio_value: portfolioValue,
        contributions: portfolioContrib,
        distributions: portfolioDistrib,
        tvpi,
        dpi,
        fund_count: fundsAssembled.length,
        direct_count: directsAssembled.length,
      },
      top_funds: topFunds,
      top_directs: topDirects,
      highlights: highlights ?? [],
    });
  } catch (e: any) {
    console.error("share-report error", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
