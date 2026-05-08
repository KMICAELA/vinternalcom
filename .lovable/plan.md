# Five-fix delivery plan

## Scope estimate

| # | Item | Est. | Schema? |
|---|------|------|---------|
| 5 | Extraction prompt hardening (SoI priority + fuzzy match + regression test) | ~45 min | No |
| 1 | Directs: Co-Investors + Holding Period columns | ~20 min | No |
| 2 | Underlying: Status column + TWH% column + 3 dropdown filters | ~40 min | **Yes** — `companies.status` already exists (text, nullable). No migration needed; just surface it. |
| 3 | Reports: Fund/Quarter dropdowns + sortable headers + Re-extract / Re-promote row actions | ~45 min | No |
| 4 | Fund Detail: Underlying Holdings table for selected quarter | ~25 min | No |

Total: ~3 hours. No migrations required (`companies.status` is already in schema).

## Recommended order: 5 → 1 → 2 → 3 → 4

Matches your suggestion. Extraction first because (a) it's isolated to one edge function, (b) re-running Cantos sandbox is the verification gate, and (c) item 3's "Re-extract" button depends on the new pipeline being live.

## Delivery: split into 2 PRs

- **PR-A (ship first):** Item 5 only. Edge function + regression test. Deploy + verify against Cantos sandbox before touching UI.
- **PR-B (ship right after):** Items 1–4. All frontend, no backend coupling beyond invoking the already-deployed `extract-report` and existing `promoteReportToLive`.

Splitting keeps blast radius small: if the extraction prompt regresses on a different fund letter, PR-A is revertible without rolling back the UI improvements.

## Per-item implementation notes

**5 — extract-report/index.ts**
- Add a `CANONICAL-SOURCE PRIORITY` block to the Mode A system prompt: SoI table = holdings list of record; narrative = context only (round name, status updates) and must NEVER create new rows or zero out table values.
- Wire `canonicalCompanyName` into the post-extraction dedupe so "Andean" / "Andean Systems" / "Zoo" / "Zoo.dev" collapse pre-promotion (extends the existing `dedupeHoldings` `preferTruthyMax` merge from the prior fix).
- Add `supabase/functions/extract-report/dedupe_test.ts` (Deno test): synthetic SoI + narrative payload for Cantos Q4 → assert exactly 5 holdings (Vital Lyfe, Inpho, The Immune Co., Andean Systems, Rubicon) with cost $8.75M / carrying $11.12M.

**1 — DirectsPage**
- Add `Co-Investors` column (already in query) — comma-joined, `max-w-[200px] truncate` with shadcn `<Tooltip>` showing full list.
- Add `Holding Period` column — `min(investment_date)` per company across tranches; format <90d → "X days", <365d → "Y months", else "Y.Y years".

**2 — UnderlyingPortfolioPage**
- Surface `companies.status` (already on schema, currently unused in UI). No migration. Default display "Active" when null.
- Add `TWH %` column from `twh_ownership_pct`.
- Replace single search with: `<Input>` (text) + 3 `<Select>` dropdowns (Fund, Status, Round). Combine with AND logic.

**3 — ReportsPage**
- Add Fund + Quarter `<Select>` dropdowns next to existing Status select; populate from distinct values in loaded rows.
- Make `<TableHead>` clickable for Uploaded / Fund / Quarter / Status with asc/desc indicator (lucide `ChevronUp`/`Down`).
- Per-row dropdown menu (lucide `MoreHorizontal`) with: View, Re-extract (calls `supabase.functions.invoke('extract-report', { body: { reportId } })`), Re-promote (calls existing `promoteReportToLive(reportId)` from `reportsApi.ts`). Toast on success/failure; refetch row.

**4 — FundDetailPage**
- New section below charts: query `underlying_holdings` where `fund_id = :id AND quarter_id = selected.id`, join `companies(commercial_name, legal_name, status)`.
- Columns: Company (link to `/portfolio?company=:id`), Round, Instrument, Cost (USD), FMV (USD), MOIC (`fmv/cost`), Status. Empty-state if quarter has no holdings.

## Risks / watch-items

- Item 5 dedupe change could over-merge if two genuinely distinct entities share a fuzzy name (rare in VC SoI; mitigated by keeping match on canonical name only, not partial substring).
- Item 3 "Re-extract" will overwrite `extracted_payload` and reset `committed_to_db = false` — confirm desired UX or add a confirm dialog. Defaulting to **confirm dialog** for both Re-extract and Re-promote.
- No design-token changes; reuses existing dark-theme tokens and `<Select>` / `<Tooltip>` primitives.

Awaiting your go to start with PR-A (item 5).
