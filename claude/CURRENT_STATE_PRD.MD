# Pulse Brazil — Current State PRD

## Purpose

This document describes what Pulse Brazil **actually is today**, as verified against the codebase on 2026-07-12, not what `CLAUDE.MD` or `ARCHITECTURE_PRINCIPLES.MD` aspire to. Those two files remain the target operating rules; this file is the reconciliation point between intent and reality, and the source of the near-term fix list.

Update this file whenever a gap it lists is closed, or whenever a new gap is discovered. It should stay accurate, not aspirational.

## Product summary

Pulse Brazil is a Brazil market-intelligence tool: it tracks accounts (offices/locations), ingests source documents, extracts signals from them via Claude, tracks account "temperature," and visualizes accounts on a map. It is built as a Clean Architecture / DDD monorepo (`packages/domain`, `application`, `infrastructure`, `api`, `ui`) deployed on Vercel.

## Architecture as actually built

- **Monorepo layering**: real and enforced. `packages/domain` has zero dependencies. UI never imports `pg` or infrastructure directly; it only calls `/api/*` via `packages/ui/src/api/client.ts`. No layer violations found.
- **Frontend**: Vite + React 18 + TypeScript SPA, **not Next.js**. Deployed to Vercel via `npm run build --workspace=@pulse-brazil/ui` with a separate root `/api` folder of Vercel serverless functions. `ARCHITECTURE_PRINCIPLES.MD`'s "Next.js on Vercel" default has been superseded by this and should be updated to describe Vite + Vercel serverless functions as the actual default.
- **Persistence**: PostgreSQL via the raw `pg` driver (no ORM). Migrations are hand-written SQL in `packages/infrastructure/migrations/001–012`.
  - PostGIS is enabled and used for the `location_records` table (`geography(Point, 4326)`).
  - `accounts.office_locations` is still plain JSONB. **Agreed direction: migrate this to a PostGIS geography column so accounts are directly spatially queryable**, rather than routing all spatial queries through `location_records`.
- **Mapping**: MapLibre GL (base map, OpenFreeMap keyless "positron" tiles) + deck.gl (`ScatterplotLayer` via `MapboxOverlay`) in `BrazilMap.tsx`. Matches intent. Google Maps API key is used only for geocoding, never for tiles.
- **AI providers — two, both permanent**:
  - **Claude** (`@anthropic-ai/sdk`), via forced tool-use with strict JSON schemas (`strict: true`, `additionalProperties: false`). Used for `extractSignalsFromDocument` (live, wired to `/api/documents/ingest`) and `generateInsight` (built but currently unreachable — see Gaps). Model is `claude-sonnet-5`, verified against the live Anthropic API by a non-mocked integration test that submits a real document through `/api/documents/ingest` and confirms real `Signal` rows are persisted.
  - **Perplexity** (`sonar` model), used only by `RunMarketResearchSweep` for the manual/automated account research sweep. **Agreed: this is a permanent second AI vendor and should be documented as such in `ARCHITECTURE_PRINCIPLES.MD`**, with its system prompt moved out of the adapter and into a versioned file under `claude/prompts/`, matching Claude's pattern.
- **Prompt assets**: Claude's prompts are versioned files (`claude/prompts/account-insight-summary/v1/system.md`, `claude/prompts/document-signal-extraction/v1/system.md`), loaded from disk. Perplexity's prompt is currently a hardcoded inline string — to be fixed per above.
- **Output validation**: not zod (none used anywhere in the repo). Validation is via Claude's native strict tool-use JSON schemas plus manual checks in use cases (e.g. `GenerateInsight` rejecting blank fields, `toRelatedEntityReference()` rejecting unrecognized kinds) and domain constructor invariants. This satisfies the doc's "outputs schema-validated" requirement; it's just not zod-based.
- **Styling**: hand-rolled CSS custom properties (`packages/ui/src/design/tokens.css`), no Tailwind/shadcn. Palette genuinely matches the "Soft Quartz" spec (warm off-whites, graphite text, single forest-green accent, no dark mode, no purple/blue gradients).
- **Animation**: `gsap` (+ ScrollTrigger, `@gsap/react`) and `framer-motion` are both load-bearing (`gsap` drives `EntryAnimation.tsx`'s full sequence; `framer-motion` is used elsewhere in `App.tsx`). `animejs` is used only for one marker-stagger effect inside `EntryAnimation.tsx` and is redundant with gsap's native `stagger()`. **Agreed: drop `animejs`, reimplement the stagger in gsap.**

## Domain model as actually built

All entities named in `ARCHITECTURE_PRINCIPLES.MD` exist except one:

| Entity | Status |
|---|---|
| Account | Implemented (`account/Account.ts`) |
| OfficeLocation | Implemented (`account/OfficeLocation.ts`) |
| TemperatureAssessment | Implemented, immutable, full history + denormalized latest state on Account (`account/TemperatureAssessment.ts`) |
| Signal | Implemented (`signal/Signal.ts`) |
| SourceDocument | Implemented (`document/SourceDocument.ts`) |
| Insight | Implemented (`insight/Insight.ts`) |
| ContextBundle | Implemented (`context/ContextBundle.ts`) |
| Theme | **Not implemented as an entity.** Only a branded `ThemeId` string exists, with no defined vocabulary anywhere in the codebase — nothing prevents an arbitrary string. **Agreed: implement as a closed TypeScript enum with exactly six values: ETF, Tokenisation, Mutual Funds, Pension, Competitor, Regulation.** Not a full entity/table unless a future need for per-theme metadata arises. |

Additional entities not named in the docs but present and load-bearing: `LocationRecord` (staging/review layer feeding `CreateAccountFromLocationRecord`), `Note`.

## Feature inventory

| Feature | Status |
|---|---|
| Account creation, clickable location pins, signal source tags | Live |
| Manual Perplexity research sweep (with quantity limit) | Live |
| Research sweep covering Prospect + Active accounts | Live |
| Document ingestion → Claude signal extraction (`ProcessDocumentUpload` → `/api/documents/ingest`) | Live. This is the canonical ingestion path — it deliberately does not require a pre-linked account or theme; it extracts against all known accounts and surfaces unmatched mentions rather than auto-creating accounts. |
| `SubmitDocument` (user pre-links account/theme at submission time) | **Unused legacy path — agreed to be removed.** It was the closer match to the doc's ingestion description, but `ProcessDocumentUpload` is the real, live path and the doc's ingestion section should be updated to describe that instead. |
| Account temperature tracking | Fully implemented end-to-end: entity, repository, use case, HTTP route (`api/accounts/[id]/temperature.ts`), UI surfacing via map pin color and dossier. |
| AI-generated Insight (`GenerateInsight`) | **Built but unreachable.** Wired in `CompositionRoot`, but no HTTP route exists anywhere and the only UI reference is a type import. This is the product's namesake "Claude reasoning engine" capability and is currently dead end-to-end. **Agreed: top priority fix** — add a route, a UI trigger, and tests for this flow specifically. |

## Known gaps and agreed fixes (from 2026-07-12 review)

Ordered roughly by priority:

1. **Wire up `GenerateInsight`** — add HTTP route + UI trigger. Add tests for this flow as part of the same work.
2. ~~**Swap Claude model** from `claude-opus-4-8` to `claude-sonnet-5` in `ClaudeServiceAdapter.ts`.~~ **Done.** Verified end to end: a live (non-mocked) call through `/api/documents/ingest` produces real, persisted `Signal` rows. This also introduced the repo's first tests — `vitest`, added to `packages/infrastructure` and `packages/api`, run via `npm test` at the root.
3. **Document Perplexity** as a permanent second AI vendor in `ARCHITECTURE_PRINCIPLES.MD`; move its system prompt to a versioned file in `claude/prompts/`.
4. **Migrate `accounts.office_locations`** from JSONB to a PostGIS geography column.
5. **Drop `animejs`** from `EntryAnimation.tsx`; reimplement the marker stagger in gsap.
6. **Implement `Theme`** as a closed enum (ETF, Tokenisation, Mutual Funds, Pension, Competitor, Regulation).
7. **Remove `SubmitDocument`** (dead ingestion path); update `CLAUDE.MD`'s ingestion section to describe `ProcessDocumentUpload`'s actual contract (no required account/theme link at submission time).
8. **Update `ARCHITECTURE_PRINCIPLES.MD`** to describe Vite + Vercel serverless functions instead of Next.js as the frontend default.

## Process note

The plan-mode / ask-first policy in `CLAUDE.MD` has not been consistently followed to date — most drift documented above happened via direct implementation rather than a plan-and-approve cycle. This document exists in part to close that gap retroactively; going forward, changes of this scope (new dependencies, vendor additions, framework choices) should go through plan mode per the existing policy.
