import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dedupeHoldings,
  filterHoldingsToScheduleCompanies,
  preferTruthyMax,
} from "./index.ts";

const CANTOS_SCHEDULE_COMPANIES = [
  "Vital Lyfe",
  "Inpho",
  "The Immune Co.",
  "Andean",
  "Rubicon",
];

const CANTOS_REAL_FAILURE_FIXTURE = [
  { company_name: "Vital Lyfe", investment_date: "2024-11-24", instrument: "SAFE", round: "Pre-Seed", fund_cost_usd: 2_000_000, fund_fmv_usd: 4_374_964, fund_proceeds_usd: null },
  { company_name: "Vital Lyfe", investment_date: "2024-11-24", instrument: "Preferred Equity", round: "Pre-Seed", fund_cost_usd: 2_000_000, fund_fmv_usd: 4_374_964, fund_proceeds_usd: null },
  { company_name: "Inpho", investment_date: "2025-03-06", instrument: null, round: "C+", fund_cost_usd: 2_500_000, fund_fmv_usd: 2_500_000, fund_proceeds_usd: null },
  { company_name: "Inpho", investment_date: "2025-03-06", instrument: null, round: "Seed", fund_cost_usd: 0, fund_fmv_usd: 0, fund_proceeds_usd: null },
  { company_name: "The Immune Co.", investment_date: "2025-01-22", instrument: null, round: "Series A", fund_cost_usd: 2_499_999, fund_fmv_usd: 2_499_999, fund_proceeds_usd: null },
  { company_name: "The Immune Co.", investment_date: "2025-01-22", instrument: null, round: "Seed", fund_cost_usd: 0, fund_fmv_usd: 0, fund_proceeds_usd: null },
  { company_name: "Andean", investment_date: "2025-09-12", instrument: null, round: "Seed", fund_cost_usd: 1_000_000, fund_fmv_usd: 1_000_000, fund_proceeds_usd: null },
  { company_name: "Andean Systems", investment_date: "2025-09-12", instrument: null, round: "Pre-Seed", fund_cost_usd: 0, fund_fmv_usd: 0, fund_proceeds_usd: null },
  { company_name: "Rubicon", investment_date: "2025-11-21", instrument: null, round: "Seed", fund_cost_usd: 750_000, fund_fmv_usd: 750_000, fund_proceeds_usd: null },
  { company_name: "MoldCo", investment_date: null, instrument: null, round: "Seed", fund_cost_usd: 2_499_999, fund_fmv_usd: 2_499_999, fund_proceeds_usd: null },
  { company_name: "neros", investment_date: null, instrument: null, round: null, fund_cost_usd: null, fund_fmv_usd: null, fund_proceeds_usd: null },
  { company_name: "Castelion", investment_date: null, instrument: null, round: null, fund_cost_usd: null, fund_fmv_usd: null, fund_proceeds_usd: null },
  { company_name: "Radiant", investment_date: null, instrument: null, round: null, fund_cost_usd: null, fund_fmv_usd: null, fund_proceeds_usd: null },
];

Deno.test("preferTruthyMax never lets zero overwrite a real table value", () => {
  assertEquals(preferTruthyMax(2_499_999, 0), 2_499_999);
  assertEquals(preferTruthyMax(0, 2_499_999), 2_499_999);
  assertEquals(preferTruthyMax(null, 0), 0);
});

Deno.test("Cantos Q4 real failure fixture filters narrative-only rows, dedupes to exactly 5, and preserves non-zero table values", () => {
  const scheduleOnly = filterHoldingsToScheduleCompanies(CANTOS_REAL_FAILURE_FIXTURE, CANTOS_SCHEDULE_COMPANIES);
  const out = dedupeHoldings(scheduleOnly);

  assertEquals(out.map((h) => h.company_name).sort(), [
    "Andean Systems",
    "Inpho",
    "Rubicon",
    "The Immune Co.",
    "Vital Lyfe",
  ].sort());
  assertEquals(out.length, 5, "Cantos Q4 must produce exactly 5 holdings; 6+ or 9 rows is a regression");

  const byName = new Map(out.map((h) => [h.company_name, h]));
  assertEquals(byName.get("Inpho")?.fund_cost_usd, 2_500_000);
  assertEquals(byName.get("Inpho")?.fund_fmv_usd, 2_500_000);
  assertEquals(byName.get("The Immune Co.")?.fund_cost_usd, 2_499_999);
  assertEquals(byName.get("The Immune Co.")?.fund_fmv_usd, 2_499_999);
  assertEquals(byName.get("Andean Systems")?.fund_cost_usd, 1_000_000);
  assertEquals(byName.get("Rubicon")?.fund_fmv_usd, 750_000);

  const totalCost = out.reduce((s, r) => s + (r.fund_cost_usd ?? 0), 0);
  const totalFmv = out.reduce((s, r) => s + (r.fund_fmv_usd ?? 0), 0);
  assertEquals(totalCost, 8_749_999);
  assertEquals(totalFmv, 11_124_963);
});

import { mirrorUsdNative } from "./index.ts";

Deno.test("USD passthrough: native-only fields are mirrored into *_usd (regression: Cantos NAV null)", () => {
  const p: any = {
    currency: "USD",
    fund_total_nav_native: 11_124_963,
    fund_total_nav_usd: null,
    fund_total_contributions_native: 8_749_999,
    fund_total_contributions_usd: null,
    twh_nav_native: null,
    twh_nav_usd: null,
    holdings: [
      { company_name: "Vital Lyfe", fund_cost_native: 2_000_000, fund_fmv_native: 4_374_964, fund_cost_usd: null, fund_fmv_usd: null },
    ],
  };
  mirrorUsdNative(p);
  assertEquals(p.fund_total_nav_usd, 11_124_963);
  assertEquals(p.fund_total_contributions_usd, 8_749_999);
  assertEquals(p.holdings[0].fund_cost_usd, 2_000_000);
  assertEquals(p.holdings[0].fund_fmv_usd, 4_374_964);
});
