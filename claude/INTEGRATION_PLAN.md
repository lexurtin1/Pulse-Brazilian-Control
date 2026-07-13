# Command Centre Integration Plan

## Purpose

This is the staged plan for replacing the current Pulse Brazil dashboard with the
new "Command Centre" layout (source design: `Pulse Brazil New Frontend Sandbox.zip`
→ `Pulse Brazil Command Centre.dc.html`). It uses a bullet-tracer methodology: one
feature at a time, built front-to-back (domain → application → infrastructure →
API → frontend), verified working end-to-end in the browser with real data before
the next feature starts. No feature is "done" while any card in its row still
shows placeholder or hardcoded data.

Read this file before picking up the next card. Update it as cards move.

## Decisions on record

These were settled before any implementation started. Don't re-litigate them
without a reason — if one turns out to be wrong, update this section and say why.

- **Theme**: both light and dark are supported via a toggle (already prototyped
  in the sandbox file). `claude/CLAUDE.MD`'s "light themed only" direction is
  superseded for this surface — update that doc once the toggle ships.
- **Replace, not coexist**: the Command Centre layout replaces the current
  `App.tsx` dashboard. Existing working components (`BrazilMap`, `MapLegend`,
  `SignalFeed`, `UploadFAB`, `CreateAccountFAB`, `PerplexitySweepButton`) are
  re-slotted into the new layout, not rebuilt.
- **Design source of truth**: `Pulse Brazil Command Centre.dc.html` only. The
  companion `Pulse Brazil Control Centre.dc.html` is design-exploration history
  (rejected layouts 1b/1c, an intermediate dark riff 2a) — reference only, not a
  target.
- **Sandbox usage mode**: the `.dc.html` file is a pixel/interaction *reference*,
  not code to run. It's a proprietary Claude Design prototyping format (custom
  elements, a `support.js` runtime) with no relationship to this repo's real
  stack. We hand-port its layout, spacing, typography, and the light/dark color
  values (lifted from its inline `renderVals()` theme object) into real
  React/TypeScript components. Its `brazil-map.js` is a rough prototype (simple
  MapLibre + 3 fixed marker pins) and is **less capable** than the existing
  `packages/ui/src/components/BrazilMap/BrazilMap.tsx` (deck.gl scatterplot,
  full vector basemap, temperature colors, click-to-select) — extend the real
  component's visual language to match the new design, don't replace it with the
  prototype script.
- **Layout deltas from the original screenshot**:
  - "Regulatory Watch" KPI card — **removed**.
  - "Risk & Regulatory" side panel — **removed**.
  - Map's "Regulatory" pin type — **removed** (nothing feeds it anymore).
  - 4th KPI slot (where Regulatory Watch was) — repurposed as **Feed Controls**:
    Upload Document + Perplexity Search buttons, relocated from FABs into the
    header/KPI-strip area.
  - **"Open Risk Signals" KPI card — dropped entirely** (decided during Feature
    1 grilling, 2026-07-13). Its slot is repurposed as **Pipeline Value -
    Weighted**. KPI strip is now: Active Accounts · BR → Pipeline Value -
    Unweighted → Pipeline Value - Weighted → Feed Controls. Feature 6 (below)
    is cancelled, not deferred — it had no defined severity model or data
    source and is superseded by this decision.
  - Right rail order: **Pipeline · Top Open Deals → City Activity Index → Live
    Feed** (Live Feed is now a vertical panel filling remaining height, not a
    bottom ticker).
  - Map stretches full height (no bottom ticker eating into it).
- **Kanban format**: this file. Columns per feature: **Backlog → Data Contract →
  Domain → Application → Infra/API → Frontend Wired → Verified E2E → Done**.
- **Feature order**: Phase 0 (shell) → Pipeline Value (Unweighted + Weighted)
  + Top Open Deals → Active Accounts delta → Live Feed restyle → City
  Activity Index → Map city-rollup. (Open Risk Signals cancelled, see above.)
- **Number formatting**: every numeric display on this dashboard (currency,
  counts, deltas, percentages, the future City Activity Index) is rounded to
  a whole number — no decimal places anywhere, on any card.
- **Local/sandbox dev reaches Neon via the WebSocket driver, not raw pg
  (decided 2026-07-13, revised same day)**: this machine's network completes
  a full TLS handshake to the Neon host on port 443 but resets the
  connection on port 5432 (confirmed by direct TCP/TLS probing) — a network
  policy blocking non-HTTPS TLS ports, not a bad connection string or a
  Postgres/Docker tooling gap. Rather than routing all verification through
  Vercel deploys (the first fix tried), `packages/infrastructure/src/db/pool.ts`
  now builds its `Pool` from `@neondatabase/serverless` instead of `pg` —
  same pg-compatible API (`BEGIN`/`COMMIT`, `pool.connect()`, etc.), same
  call sites unchanged, but tunnelled over a WebSocket on port 443 instead of
  raw Postgres wire protocol on 5432, which gets through this network fine.
  `neonConfig.webSocketConstructor` is set explicitly (the `ws` package) so
  this isn't dependent on Node's native WebSocket support, since Vercel's
  serverless functions may run an older Node version than this sandbox's.
  All 12 repositories' `import type { Pool } from "pg"` were repointed to
  `@neondatabase/serverless`'s `Pool` type (their `PoolClient` differs
  slightly from `pg`'s at the type level). Confirmed working: ran
  `npm run migrate --workspace=@pulse-brazil/infrastructure` from this
  sandbox straight against production Neon (all 13 migrations already
  applied, clean run). `vercel.json`'s `buildCommand` still runs migrations
  on every deploy too (cheap and idempotent, a good safety net) but it's no
  longer the *only* way to reach Neon — every feature's **Verified E2E**
  stage can now be run locally in this environment against real Neon data,
  same as it can on a Vercel deployment. `reconcile-salesforce-accounts.ts`
  had already independently discovered and worked around this exact issue
  for itself (with an unsafe `as unknown as Pool` cast); it now just uses
  the shared `createPool()` like everything else.
- **Map legend correction (found during Phase 0 build)**: the existing
  `MapLegend` component doesn't show the mockup's four signal-type dots
  (Account Activity/Pipeline/Regulatory/Risk) — it shows the real
  `BrazilMap`'s account **temperature bands** (Hot/Warm/Cool/Cold), a
  different axis entirely. Phase 0 keeps the real temperature legend as-is.
  The mockup's signal-type legend concept is deferred to Feature 5 (Map
  city-rollup), once city-level signal-type pins actually exist to legend.

---

## Phase 0 — Shell

Static layout only. Every card renders in its final position, sized correctly,
themed correctly (toggle works), with **empty/placeholder state** — no feature's
real data is wired yet. This exists so every later feature slice is "wire this
one card to real data," not "build layout and wire data at once."

Scope:
- Page grid: header, 4-card KPI strip, map (full height) + right rail (420px),
  right rail stack (Top Open Deals / City Activity Index / Live Feed).
- Header: logo, "BRASIL COMMAND · CONTROL CENTRE" label, LIVE badge, BRT/UTC
  clocks (real client-side clocks, no backend needed), user name/SME badge,
  light/dark theme toggle (persisted, same mechanism as the sandbox:
  `localStorage`).
- Feed Controls card: Upload Document button (opens existing `UploadFAB` sheet),
  Perplexity Search button (triggers existing `PerplexitySweepButton` action) —
  relocated into the KPI strip, FABs removed from their current floating
  position.
- Map panel re-slotted at full height with the existing `BrazilMap` + `MapLegend`
  components (legend loses the Regulatory entry).
- All KPI cards and right-rail panels render with an explicit empty state (not
  fake numbers) until their feature card wires them.

Stages:
- [x] Data Contract — n/a (no data yet)
- [x] Domain — n/a
- [x] Application — n/a
- [x] Infra/API — n/a
- [x] Frontend Wired — layout, theme toggle (`useTheme`, persisted to
      `localStorage['px-theme']`, same key the design reference uses), real
      BRT/UTC clocks (`useClock`), Upload Document + Perplexity Search
      relocated into the "Feed Controls" KPI card (`UploadFAB`/
      `PerplexitySweepButton` gained an `inline` variant), `CreateAccountFAB`
      left as the sole remaining floating FAB (no slot for it in the new
      design), map re-slotted full height, all data-bearing cards (Active
      Accounts, Pipeline Value, Open Risk Signals, Top Open Deals, City
      Activity Index, Live Feed) render explicit empty states. Core color
      tokens in `tokens.css` were repointed to the Command Centre's teal/
      slate palette (light + dark), since this surface now supersedes
      `claude/CLAUDE.MD`'s Soft Quartz direction — see decisions above.
      `tsc --noEmit` passes (one pre-existing, unrelated error in
      `useDialogA11y.ts` predates this work).
- [x] Verified E2E — confirmed working by the user (2026-07-13): header
      clocks tick, theme toggle persists across refresh, Upload/Perplexity
      work from their new spot in the Feed Controls card.
- [x] Done

---

## Feature 1 — Pipeline Value (Unweighted + Weighted) + Top Open Deals

One bullet-tracer slice (shared `Deal`/`PipelineSnapshot` domain, three UI
surfaces wired together: two KPI cards + one panel).

**Status: unblocked, grilled, ready to build (2026-07-13).** Data Contract
facts confirmed by directly inspecting the real export
(`Everything Brazil/Open Brazil Pipel This FY -2026-07-13.csv`) — see below.

Data Contract facts (confirmed 2026-07-13):
- Real columns, verbatim: `Opportunity Owner, Account Name, Opportunity Name,
  Stage, Fiscal Period, Amount, Expected Revenue, Probability (%), Age,
  Revenue Live Date, Next Step Summary, Lead Source, Type, Owner Region`.
- Real `Stage` values: `Discovery, Prospect, Qualified, Signed, Live, Lost`.
- Encoding is **Windows-1252/Latin-1, not UTF-8** — accented account names
  (e.g. "Itaú", "Vórtx") corrupt if decoded as UTF-8. Importer must decode
  accordingly (browser-side: read as `ArrayBuffer` + `TextDecoder("windows-1252")`,
  not `file.text()`).
- No "As of" metadata row exists in the real export (the original plan
  assumed one) — see snapshot timestamp decision below.
- Two exports were delivered (`This FY` and `All Time`); confirmed by direct
  comparison that `This FY` is an exact subset of `All Time`, filtered to
  FY2026 fiscal periods. **Only `This FY` is imported** — `All Time` is
  redundant for this feature (may become relevant later if a multi-year view
  is ever wanted, not now).

Decisions specific to this feature (grilled 2026-07-13):
- CSV only (no `.xlsx` parsing dependency) — re-export from Salesforce as CSV.
- Stage shown verbatim as the real Salesforce stage name — no mapping to a
  generic early/mid/late/hot bucket.
- Currency assumed BRL throughout.
- **Two KPI cards, not one**: "Pipeline Value - Unweighted" (sum of `Amount`,
  replaces old "Pipeline Value · BR" slot) and "Pipeline Value - Weighted"
  (sum of `Expected Revenue`, replaces the now-cancelled "Open Risk Signals"
  slot — see Phase 0 decisions above).
- **Aggregation rule, applied at read-time not import-time**: Pipeline Value
  (both cards) and Top Open Deals exclude `Stage = Lost` and `Stage = Live`
  — only Discovery/Prospect/Qualified/Signed count as "open." `Deal` rows are
  still imported and stored verbatim in full (including Lost/Live) —
  filtering happens in the summary/ranking use cases, nothing is dropped on
  import.
- **Top Open Deals** = top 4 open deals by `Amount` descending (not weighted
  — "top deals" means biggest in the funnel, not risk-adjusted).
- Delta shown as "vs. previous upload," honestly labeled with the actual
  prior upload's date. **No delta badge on the very first upload** (nothing
  to compare against) — don't fabricate a "previous = 0" delta.
- **Snapshot timestamp**: each upload's "as of" time is the **upload
  wall-clock time**, same as `SourceDocument.provenance.uploadedAt` already
  does for every other import in this codebase. No metadata-row parsing
  (the real export has no such row) and no filename-date parsing (unreliable
  — hand-typed by whoever exports from Salesforce).
- **Persistence model**: each upload creates an **immutable `PipelineSnapshot`**
  (`Deal`s + totals + the upload-time "as of" timestamp) tied to a
  `SourceDocument`, mirroring how `SourceDocument`/`LocationRecord` already
  work. The dashboard always reads the latest snapshot. **All snapshots are
  retained forever, no pruning** — matches this codebase's existing
  "never hard-delete" convention (e.g. rejected `LocationRecord`s).
- Each `Deal` links to an existing `Account` by name match — same
  exact-id/name-match/ambiguous-flag pattern as `ImportLocationCsv`
  (`packages/application/src/use-cases/location/ImportLocationCsv.ts`), not
  extracted into a shared helper (no such helper exists yet — this codebase's
  precedent is to inline it per importer). **Unmatched/ambiguous-account
  deals still count toward Pipeline Value totals and Top Open Deals ranking**
  — they're flagged for review (`flagForReview`-style), not excluded; the
  deal data itself (Amount/Stage/Fiscal Period) is valid regardless of
  whether we've linked it to our `Account` record yet.
- CSV routing: since `.csv` uploads currently always route to the Location CSV
  importer (`UploadFAB.tsx` decides purely by file extension — confirmed, no
  existing content-sniffing at all), add header-based auto-detection —
  required-headers check (presence of `Opportunity Name`/`Stage`/`Amount`)
  decides Location vs. Pipeline import, same spirit as the existing
  `validateLocationCsvHeaders` check.
- New `DocumentType.PipelineDataset` value added to
  `packages/domain/src/document/DocumentType.ts`.

Stages:
- [x] Data Contract — real export opened, columns/stage values/encoding
      confirmed, decisions above locked in
- [x] Domain — `Deal` entity + `DealStage` enum (Discovery/Prospect/Qualified/
      Signed/Live/Lost) + `DealReviewStatus` enum, all in new
      `packages/domain/src/pipeline/`; `DocumentType.PipelineDataset` added.
      **No separate `PipelineSnapshot` entity** — `SourceDocument` already
      carries the one timestamp a snapshot needs (`provenance.uploadedAt`),
      so "the latest snapshot" = "the most recently uploaded PipelineDataset
      SourceDocument," mirroring `SourceDocument`/`LocationRecord` exactly
      rather than inventing a redundant aggregate. `tsc --noEmit` passes.
- [x] Application — `ImportPipelineCsv` use case (mirrors `ImportLocationCsv`,
      `packages/application/src/use-cases/pipeline/`), `GetPipelineSummary`
      (unweighted + weighted totals, delta vs. previous snapshot, no delta on
      first upload), `GetTopOpenDeals` (top 4 by `Amount`), DTOs. Generic CSV
      splitter renamed `parseLocationCsv` → `parseCsv` (was location-specific
      in name only; now shared by both importers). `tsc --noEmit` passes.
- [x] Infra/API — migration `013_create_deals.sql`, `PostgresDealRepository`
      (bulk `saveMany` in one transaction per upload), `IDocumentRepository`
      gained `findByDeclaredType` (used to find "the latest snapshot"),
      header-based CSV auto-detection added to `UploadFAB.tsx`
      (`looksLikePipelineCsv`) — Pipeline CSVs are also re-decoded as
      windows-1252 (the real export's actual encoding; UTF-8 corrupts
      accented account names), Location CSVs unaffected. New endpoints:
      `POST /api/pipeline/import`, `GET /api/pipeline/summary`,
      `GET /api/pipeline/top-open-deals`. All packages build clean.
- [x] Frontend Wired — KPI strip now reads "PIPELINE VALUE - UNWEIGHTED" /
      "PIPELINE VALUE - WEIGHTED" (replacing the old Pipeline Value + Open
      Risk Signals slots) from `GetPipelineSummary`, whole-number formatting
      (`formatCurrency`, `packages/ui/src/utils/formatNumbers.ts` — display
      currency switched to GBP symbol/locale 2026-07-13, per request; this
      is formatting only, not a BRL→GBP conversion, the underlying figures
      are still the raw Salesforce BRL amounts).
      `TopOpenDealsCard` reads real data from `GetTopOpenDeals`. Empty states
      shown when no snapshot exists yet; no delta badge shown on first
      upload. `tsc --noEmit` passes (only the pre-existing unrelated
      `useDialogA11y.ts` error).
- [x] Verified E2E — **dry-run sanity check (2026-07-13)**: ran the real
      parsing/validation/aggregation logic directly against
      `Everything Brazil/Open Brazil Pipel This FY -2026-07-13.csv` in Node
      (no DB) — all 38 rows parse valid, 33 open deals after excluding
      Lost/Live, unweighted total R$5,972,756, weighted total R$1,550,693,
      top-4-by-Amount list correct, accented names ("Itaú Unibanco",
      "Vórtx") decode correctly. **Confirmed live in production
      (2026-07-13)**: deployed to https://pulse-brazilian-control.vercel.app,
      migrations 013/014/015 applied automatically as part of the Vercel
      build (`vercel.json`'s `buildCommand` now runs `npm run migrate`
      first). `GET /api/pipeline/summary` and `/api/pipeline/top-open-deals`
      confirmed returning `null` (200) — the correct empty state, since no
      Pipeline CSV has been uploaded to production yet. **Found and fixed a
      real bug during this check**: the `api/pipeline/[...route].ts`
      catch-all's segment must be parsed from `req.url`, not
      `req.query.route` — this builder exposes the catch-all's query key as
      the literal string `"...route"`, not `"route"`, so every pipeline
      request was silently 404ing until this was caught by testing the live
      endpoints, not just dry-running the logic locally. Still outstanding:
      nobody has actually uploaded the real CSV through the browser yet, so
      the non-empty-state numbers are unverified end-to-end — do that before
      calling this fully done.
- [ ] Done

---

## Data hygiene — Salesforce account-profile reconciliation

Not a dashboard feature/KPI card — a one-time data-quality pass, surfaced
while working Feature 1, on the 44 accounts backfilled in a prior session.

Two real account exports exist in `Everything Brazil/`: a raw Salesforce
report (`All Brazil Accounts-2026-07-09-12-31-43.xlsx`) and an enriched
version of the same 44 accounts with addresses/coordinates added
(`Brazil_Accounts_Enriched_2026-07-09 (1).csv`). Reconciled field-by-field
2026-07-13: **zero conflicts** — the enriched CSV is a strict superset of
the xlsx, so it alone is the source of truth.

Decisions (grilled 2026-07-13):
- Real "Client Type" values are multi-valued (e.g. "Bank; Distributor; Fund
  Manager") and don't match the existing single-valued `AccountType` enum's
  vocabulary. New `ClientType` enum + `Account.clientTypes: readonly
  ClientType[]`, **additive**, not a replacement — `AccountType` is left
  untouched since existing stored rows already use its old vocabulary and
  ~10+ consumers read it as singular.
- Real "Status" values (Live/Prospect/Disabled/In Discussions) are mapped
  onto the existing `AccountStatus` enum (Live→Active, Disabled→Dormant,
  In Discussions→Prospect) rather than replacing it — a judgment call, not
  a verified 1:1 mapping.
- `# Open Opportunities` is imported as a static `openOpportunityCount`
  field despite Feature 1's `Deal` data being able to compute this live —
  kept for accounts with no `Deal` data (this export is broader than the
  "This FY" pipeline import scope).
- New `accountOwner` / `createdCohortYear` fields added (previously no home
  for this data at all).
- `ReconcileSalesforceAccounts` (`packages/application/src/use-cases/account/`)
  matches by exact Account Name, **never fabricates a new Account** for an
  unmatched name (surfaced instead), and **never overwrites an existing
  office location** — only fills one in if the account currently has none.

**Done — run against production 2026-07-13.** Migration
`015_add_account_salesforce_profile.sql` applied (confirmed via the Vercel
build log). The raw Postgres port (5432) was blocked outbound from this
environment (`ECONNRESET`) but HTTPS wasn't — `reconcile-salesforce-accounts.ts`
now runs over `@neondatabase/serverless`'s HTTPS-based `Pool` instead of
the usual `pg`-based one, structurally compatible enough to drop into
`PostgresAccountRepository` unchanged. Result: all 44 accounts matched by
name and enriched, 0 rejected, 0 unmatched — spot-checked directly against
production (client types, owner, cohort year, open-opportunity count,
mapped status, and Salesforce external reference all confirmed correct).

---

## Feature 2 — Active Accounts · BR (delta)

Decisions specific to this feature (grilled 2026-07-13):
- **"Confidence" is cut from this card entirely.** No existing concept
  aggregates to a KPI-level confidence — `ConfidenceScore` exists in the
  domain but is scoped to a single evidence-derived claim (`Signal`,
  `Insight`, `TemperatureAssessment`), not an account count. Same reasoning
  as Feature 6's cancellation: don't invent a number to fill a card slot.
- Count = accounts with `status === AccountStatus.Active`, unambiguous from
  the existing enum. No region filter needed (single-market app).
- **New `AccountCountSnapshot` domain concept** (`packages/domain/src/account/AccountCountSnapshot.ts`,
  `{ id, count, asOf, sourceDocumentId? }`). Unlike `Deal`, `Account.status`
  is mutable current state, not an append-only import artifact, so a
  snapshot can't be reconstructed retroactively — it's captured and
  persisted immediately after every `ImportLocationCsv` run.
- **Delta** = latest snapshot count − previous snapshot count, same pattern
  as `GetPipelineSummary`: delta omitted entirely (never shown as "vs. 0")
  when there's no previous snapshot, labeled "vs. previous upload" with the
  previous snapshot's honest `asOf` date.
- **One-time backfill**: migration `014_create_account_count_snapshots.sql`
  creates the table and inserts one row computed from
  `COUNT(*) WHERE status = 'Active'` at migration-run time, so the next
  Location CSV upload already has something to diff against (the 44 real
  offices backfilled into accounts predate this feature and have no
  historical snapshot otherwise).
- Snapshot creation is tied to `ImportLocationCsv` only (not manual account
  creation, not research-sweep status changes) — same trigger mechanism as
  Feature 1, no new infrastructure (no scheduler exists in this stack).
  Flagged risk: a status change between Location CSV uploads won't move
  this card's delta until the next upload.

Stages:
- [x] Data Contract — n/a, no new external data source (reads existing
      `Account.status`)
- [x] Domain — `AccountCountSnapshot` entity + `AccountCountSnapshotId`
      brand, exported from `packages/domain/src/account/index.ts`. `tsc
      --noEmit` passes.
- [x] Application — `IAccountCountSnapshotRepository` port,
      `ActiveAccountsSummaryDto`, `GetActiveAccountsSummary` use case
      (mirrors `GetPipelineSummary`). `ImportLocationCsv` writes a snapshot
      after every run. `tsc --noEmit` passes.
- [x] Infra/API — migration `014_create_account_count_snapshots.sql`
      (table + one-time backfill row), `PostgresAccountCountSnapshotRepository`,
      `CompositionRoot` wiring. `GET /api/accounts?summary=1` reuses the
      existing `/api/accounts` handler rather than a new file — this
      project is at the Vercel Hobby plan's 12-function cap (same
      constraint that forced Feature 1's pipeline routes into a catch-all).
      All packages build clean.
- [x] Frontend Wired — KPI strip's "ACTIVE ACCOUNTS · BR" card reads real
      count + delta from `GetActiveAccountsSummary`
      (`fetchActiveAccountsSummary`, `formatCount`/`formatCountDelta` in
      `formatNumbers.ts`), footnote's "+ confidence" text removed. Refreshed
      after every upload via the existing `refreshAfterUpload` callback.
      `tsc --noEmit` passes (only the pre-existing unrelated
      `useDialogA11y.ts` error).
- [ ] Verified E2E — not yet run against a real Postgres/browser (same
      sandbox limitation as Feature 1). Needs: apply migrations (which will
      run the one-time backfill against whatever accounts already exist in
      that database), start API + UI, confirm the card shows a count with
      no delta badge (first observation), then upload a Location CSV and
      confirm the delta badge appears with the correct sign vs. the
      backfilled count.
- [ ] Done

## Feature 3 — Live Feed (vertical panel)

Reuses the existing `SignalFeed` data/component; restyle into the new vertical,
full-height right-rail position instead of a horizontal bottom ticker. Mostly a
frontend-only card — revisit scope when picked up.

**Picked up out of order (2026-07-13)**: built before Feature 1's Verified
E2E/Done and before Feature 2, by user decision — this card is frontend-only
and reads `signals`/`accounts` data that already exists and is already wired
in `App.tsx`, so it has no dependency on Feature 1 (Pipeline) or Feature 2
(Active Accounts delta). Feature order above still holds for 2 and onward.

Stages:
- [x] Data Contract — n/a, reuses existing `SignalDto`/`AccountSummaryDto`
      shapes and the already-fetched `signals`/`accounts` state in `App.tsx`.
- [x] Domain — n/a, no domain changes.
- [x] Application — n/a, no application changes.
- [x] Infra/API — n/a, no infra/API changes.
- [x] Frontend Wired — the old standalone `SignalFeed` component (a
      420px-wide collapsible left-ledge design from before the Command Centre
      layout existed, and dead code — nothing rendered it after Phase 0
      replaced it with the `LiveFeedCard` placeholder) is deleted.
      `LiveFeedCard` now takes `signals`/`accountsById`/`selectedAccountId`/
      `onSelectAccount` props, groups signals by day (reuses
      `groupSignalsByDay`), and renders each as a clickable row (timestamp,
      account name, colored type chip, neutral source chip, summary) inside
      the existing `.rail-card--live-feed` slot, which already fills
      remaining right-rail height per the Phase 0 layout. Dropped the old
      component's account-temperature summary strip — it duplicated
      `MapLegend`'s temperature bands and doesn't belong to a signal feed's
      scope. Also dropped its collapse/rail-toggle affordance — not needed
      now that this is a fixed vertical panel, not a ledge eating into map
      space. Its `pulse-ring` CSS animation (on the temperature dot) was
      referencing a keyframe that was never defined anywhere in the codebase
      — always a no-op — so nothing of visual value was lost removing it.
      `tsc --noEmit` passes (only the pre-existing unrelated
      `useDialogA11y.ts` error).
- [x] Verified E2E — confirmed via an isolated component harness (temporary
      `harness.html` + fixture `SignalDto`/`AccountSummaryDto` data, deleted
      after use, never committed): Vite dev server + Playwright screenshots
      in both light and dark theme confirm day-grouping headers, colored
      type chips, neutral source chips, and the disabled/dimmed state for
      signals with no linked account all render correctly. **Not yet
      confirmed against real signal data end-to-end in the full app** — this
      sandboxed environment still has no Postgres/Docker (same limitation as
      Phase 0 and Feature 1), so `App.tsx`'s real data fetch can't be
      exercised here. Needs a manual check once Postgres/API are available:
      confirm signals from a real document ingest or Perplexity sweep appear
      in the Live Feed card, grouped and clickable to the right account.
- [ ] Done

## Feature 4 — City Activity Index

New composite 0–100 index per anchor city (São Paulo, Rio, Brasília). Formula
and inputs TBD — to be defined when this card is picked up.

Stages: not started.

## Feature 5 — Operational Map city-rollup

City-level pin aggregation (counts per anchor city, by signal type: Account
Activity, Pipeline, Risk — Regulatory dropped). Depends on Feature 1 (Pipeline)
being done for its pipeline-type rollup. Extends the existing `BrazilMap`
component rather than replacing it.

**Open question (surfaced 2026-07-13):** the "Risk" pin type here implicitly
depended on Feature 6's severity concept, which is now cancelled (see
Feature 6). Needs a decision when this card is picked up — either define a
lighter-weight risk signal independent of the cancelled KPI, or drop "Risk"
from this pin-type list too.

Stages: not started.

## Feature 6 — Open Risk Signals — CANCELLED

**Cancelled 2026-07-13** during Feature 1 grilling. Its KPI slot is now
"Pipeline Value - Weighted" (see Feature 1 and the Phase 0 decisions above).
It had no defined severity model, data source, or domain shape, and is not
coming back in this form. Note: Feature 5 below references a "Risk" map pin
signal type that implicitly depended on this feature's severity concept —
that dependency is now unresolved, flagged there rather than silently
dropped.
