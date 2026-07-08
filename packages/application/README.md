# @pulse-brazil/application

The application layer for Pulse Brazil. It sits directly above `@pulse-brazil/domain` and depends on nothing else — no Postgres, no HTTP client, no Claude SDK, no Next.js, no MapLibre. Its job is orchestration: load domain entities, call their methods, persist the result, hand back something presentation can render.

## Role in the Clean Architecture stack

```
presentation  →  application  →  domain
                      ↓
               infrastructure (implements application's ports)
```

Domain defines what's true (entities, invariants, business language). Application defines what happens (use cases) and what it needs from the outside world (ports). Infrastructure and presentation both depend inward on application — application never depends outward on either. This package contains zero implementations of its own ports; it only defines the contracts infrastructure must satisfy.

## Ports: the contract, not the adapter

Every file under `src/ports/` is a TypeScript interface — `IAccountRepository`, `IClaudeService`, `IGeocoder`, `IIdGenerator`, and so on. None of them have an implementation here. That's deliberate: this package should be able to typecheck and be unit-tested (with hand-written fakes implementing these interfaces) without a database, without network access, and without an Anthropic API key anywhere nearby. A future `@pulse-brazil/infrastructure` package implements each port against Postgres, PostGIS, the Claude API, a geocoding service, and so on — swapping an implementation never touches a use case.

`IClaudeService` is worth calling out specifically: it does not return a raw string. It returns `ClaudeInsightResult` — a structured, pre-domain shape with plain primitives (string kinds, string ids, a raw 0-1 confidence number). `GenerateInsight` is responsible for validating and converting that shape into real domain types before anything is persisted. Claude never gets to hand back an opaque blob that becomes an `Insight` unexamined.

## How a use case is composed

Every use case is a small class with its dependencies (ports, and occasionally another use case) passed in via the constructor — no framework decorators, no DI container. Each one follows the same shape:

1. Validate the input (throwing `ValidationError` for anything malformed before it ever reaches the domain).
2. Load whatever domain entities it needs via ports.
3. Call domain factories and methods — `Account.create(...)`, `account.applyTemperatureAssessment(...)`, `document.transitionTo(...)` — never hand-roll what a domain method already enforces.
4. Persist the result via ports.
5. Return a DTO.

`GenerateInsight` is the fullest expression of this: it calls `BuildContextBundle` to assemble evidence, calls `IClaudeService` with that bundle plus a caller-supplied `PromptProfile`, converts the structured result into domain value objects, constructs an `Insight` via `Insight.of(...)` (which itself refuses to exist without related entities and evidence), persists it, and returns an `InsightDto`.

One deliberate exception: `BuildContextBundle` returns the domain `ContextBundle` itself, not a DTO. It's an internal orchestration step `GenerateInsight` calls directly, not a presentation-facing endpoint — routing it through a DTO would just force `GenerateInsight` to immediately reconstruct the object it needs to hand to `IClaudeService`.

## DTOs: what crosses the boundary

DTOs are what use cases return — plain, serialisable objects, never a domain entity instance and never a branded id type. An `AccountId` becomes a `string`; a `ConfidenceScore` becomes its raw number; a `Date` becomes an ISO string. This is what makes it safe to hand a DTO to an HTTP response or a React component without smuggling domain behavior (or invariants that only make sense with the rest of the aggregate) across the boundary.

A few DTOs normalize the domain shape rather than mirroring it 1:1 — documented at each site: `InsightDto.recommendedActions` is a list even though `Insight.recommendedAction` is singular and optional (0-or-1-element array, so presentation never special-cases an optional field), and `AccountSummaryDto.primaryLocation` comes from the account's `GeographicScope` (its home market) rather than an office address.

## Errors

`ApplicationError` (and its subclasses `NotFoundError`, `ValidationError`, `UpstreamServiceError`) are a distinct hierarchy from the domain's `InvariantViolationError` — they mean different things. An `ApplicationError` means the use case itself couldn't proceed: nothing to load, malformed input, an external port failed. An `InvariantViolationError` means a business rule was violated, and use cases let it propagate unchanged when that happens (an illegal `SourceDocument` ingestion-state transition, for instance) rather than wrapping it — it's already a precise, meaningful error.

## What's deliberately not here

- **No persistence.** No Postgres client, no query building, no ORM. That's `@pulse-brazil/infrastructure`.
- **No HTTP.** No route handlers, no request parsing beyond a use case's own command validation. That's presentation's job.
- **No Claude SDK.** `IClaudeService` is a contract; whatever calls the Anthropic API lives in infrastructure.
- **No UI, no view models beyond the DTOs above.** The map, dossier, and conversational surfaces all consume these DTOs; they don't reach past them into domain entities.
- **No `AccountRelationship` or `Theme` write use cases yet.** `IThemeRepository` exists (for label lookups), but no theme-graph or relationship-graph use case has been asked for — added when that becomes a real requirement, not speculatively now.
