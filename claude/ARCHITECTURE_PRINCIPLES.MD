# Pulse Brazil Architecture Principles

## Purpose

This file defines the architecture rules Claude must follow when proposing, designing, or implementing Pulse Brazil.

These rules are persistent.
Claude should treat them as default architectural constraints unless the user explicitly overrides them.

The goal is to keep Pulse Brazil streamlined, deployable, visually premium, and structurally disciplined.

## Core architectural stance

Pulse Brazil should be built as a Claude-native intelligence platform with a Clean Architecture and Domain-Driven Design foundation.

Claude is central to the product’s value.
Claude is not a replacement for the domain model.
The domain model remains the contract around intelligence.
The application layer should orchestrate workflows, context assembly, and model calls.
Infrastructure should implement integrations and delivery mechanisms.
Presentation should focus on clarity, visual storytelling, and usability.

## Non-negotiables

- Prefer Clean Architecture first.
- Prefer Domain-Driven Design first.
- Prefer fewer moving parts.
- Prefer explicit orchestration over hidden magic.
- Prefer typed contracts over loose objects.
- Prefer simple deployment paths.
- Prefer a Postgres-native data model where possible.
- Prefer maintainability over novelty.
- Prefer architecture that is easy to explain to a technical leader or stakeholder.

## Deployment default

Pulse Brazil is expected to be deployed on Vercel so it can be shared easily with stakeholders.

Claude should therefore prefer architecture that works cleanly with:

- Next.js
- Vercel-hosted frontend delivery
- API routes or lightweight backend services where appropriate
- External hosted Postgres infrastructure
- External hosted supporting services only when truly necessary

Claude should avoid proposing architecture that is awkward, fragile, or operationally heavy for Vercel-based deployment unless there is a compelling reason.

## Data and persistence default

Pulse Brazil should be Postgres-first.

Default data strategy:

- PostgreSQL as the primary operational database
- PostGIS for spatial capabilities
- Structured relational storage as the main source of truth
- JSONB only where it improves flexibility without weakening clarity
- Shared typed schemas between backend and frontend where possible

Claude should keep the number of databases and persistence systems as low as possible.

Claude should not introduce additional storage technologies unless a clear need exists.

## Mapping and spatial default

Pulse Brazil should use a streamlined geospatial stack.

Default mapping strategy:

- MapLibre for the base map and camera foundation
- deck.gl for intelligence overlays and advanced rendering
- PostGIS as the spatial source of truth
- Server-delivered vector tiles or viewport-scoped spatial payloads
- Accurate account anchoring as a first-order requirement

### Spatial principles

- Office coordinates should be persisted and reviewable
- Geocoding should support manual correction or override
- Spatial logic should live close to PostGIS where possible
- Only return the data needed for the current viewport or interaction
- Avoid bloated geospatial infrastructure unless scale truly requires it

### deck.gl usage rules

deck.gl is the preferred high-performance rendering layer.

Claude should use deck.gl for:

- Account point rendering
- Animated market or account overlays
- Arcs, flows, and relationship traces
- GPU-accelerated scatterplot and spatial storytelling
- High-quality boss-demo visual impact

Claude should avoid using deck.gl as an excuse to blur architectural boundaries.

deck.gl belongs in the presentation layer.
The domain should not know about deck.gl.
Application services should return map-oriented view models, not rendering code.

## Frontend default

Preferred frontend stack:

- Next.js
- React
- TypeScript
- MapLibre
- deck.gl
- minimal supporting libraries only when justified

Preferred frontend characteristics:

- Light themed
- Calm and premium
- Operationally useful
- Fast to load
- Smooth on modern hardware
- Suitable for Vercel preview deployment
- Structured for maintainability, not just demo flair

Claude should avoid frontend sprawl.

Do not introduce many UI dependencies when a small internal component system will do.
Do not add animation libraries or mapping libraries that duplicate existing responsibilities.

## Backend default

Preferred backend characteristics:

- Thin
- Typed
- Explicit
- Modular
- Easy to deploy
- Easy to reason about

Preferred backend responsibilities:

- API contracts
- orchestration
- retrieval
- persistence
- spatial query handling
- model request shaping
- output validation

Claude should avoid heavy microservice decomposition early.

Pulse Brazil should start with the fewest viable backend parts.

## AI orchestration default

Claude should be used as a bounded reasoning engine.

Preferred model workflow:

1. Ingest source material
2. Validate and classify it
3. Retrieve only relevant structured and semantic context
4. Provide Claude with a tightly scoped task
5. Parse and validate the output
6. Persist intelligence in structured form
7. Surface it visually and conversationally

Claude should not be given uncontrolled context by default.

Deterministic work such as joins, filters, aggregations, and invariant enforcement should stay outside the model wherever possible.

## AI vendor strategy

Pulse Brazil uses two AI vendors, each with a distinct, non-overlapping role. This is a permanent architectural decision, not a temporary integration.

- **Claude (Anthropic)** is the product's reasoning engine. It interprets structured context bundles and documents already inside the system, and its output is always a validated, schema-constrained tool call — never free text. Claude never performs open web search.
- **Perplexity ("sonar" model)** is the product's web-research vendor. It is used exclusively by `RunMarketResearchSweep` to answer market-intelligence questions that require live, cited web search — a capability Claude does not have in this system. Its output is a free-text answer plus citations, not a validated domain object.

Claude should not treat Perplexity as an implementation detail to be hidden or eventually replaced by Claude. The two vendors solve different problems: Claude reasons over known context, Perplexity retrieves new information from the web. Both are first-class, versioned-prompt-driven integrations under `packages/infrastructure/src/adapters/`, and both load their system prompts from `claude/prompts/<profile>/<version>/system.md` rather than inline strings.

## Prompt asset strategy

Prompt files should be versioned in the repository and treated as first-class assets.

Claude should prefer:

- small focused prompt files
- explicit composition
- source-type overlays
- geography-specific overlays
- structured output contracts
- reviewable markdown assets

Claude should avoid:

- giant monolithic prompts
- hidden inline prompt strings spread across the codebase
- undocumented prompt behavior
- prompts that silently take over domain responsibilities

## Domain and layer rules

Claude must preserve layer boundaries.

### Domain layer

The domain layer should define:

- entities
- value objects
- invariants
- bounded language
- business concepts

Examples may include:

- Account
- OfficeLocation
- TemperatureAssessment
- Signal
- SourceDocument
- Theme
- Insight
- ContextBundle

### Application layer

The application layer should define:

- use cases
- orchestration
- context assembly
- retrieval coordination
- model invocation workflows
- output validation workflows

### Infrastructure layer

The infrastructure layer should define:

- Postgres repositories
- PostGIS queries
- geocoding adapters
- model clients
- vector tile delivery
- external connectors
- deployment plumbing

### Presentation layer

The presentation layer should define:

- UI components
- maps
- deck.gl layers
- interaction patterns
- dossiers
- drawers
- command surfaces
- visual storytelling

## Dependency policy

Claude should aim for the smallest practical dependency footprint.

Before adding any dependency, Claude should ask:

- Does this solve a real problem?
- Does it duplicate something already in the stack?
- Does it complicate Vercel deployment?
- Does it cross clean architecture boundaries?
- Can this be solved with existing tools?
- Will this still make sense in six months?

Claude should be conservative about adding infrastructure, SDKs, state libraries, and overlapping visual frameworks.

## Performance policy

Pulse Brazil should feel premium and fast.

Claude should prefer:

- viewport-scoped loading
- spatial indexing
- memoized rendering paths
- stable layer definitions
- selective animation
- progressive disclosure
- vector tiles or reduced payloads where appropriate

Claude should avoid:

- loading unnecessary spatial data
- recomputing expensive transforms on every interaction
- excessive client-side data massaging when PostGIS can do the work
- visual excess that hurts interaction quality

## Boss-demo principle

Pulse Brazil will be shown to stakeholders.

This means Claude should optimize not just for technical purity, but for:

- credibility
- polish
- clarity
- speed
- explainability
- stable deployment
- a strong first impression

The product should feel ambitious and high-end without becoming fragile.

## Decision rule

When multiple valid architecture options exist, Claude should recommend the one that best satisfies the following in order:

1. Clean Architecture integrity
2. Domain clarity
3. Deployment simplicity
4. Postgres-first consistency
5. Vercel compatibility
6. Visual quality
7. Performance
8. Future extensibility

## Default recommendation summary

Unless explicitly overridden, Claude should assume Pulse Brazil prefers:

- Next.js on Vercel
- React + TypeScript
- PostgreSQL + PostGIS
- MapLibre + deck.gl
- minimal infrastructure
- minimal dependencies
- prompt assets stored in-repo
- typed contracts
- clear boundaries between domain, application, infrastructure, and presentation

## Final rule

Claude should help build Pulse Brazil as a premium, deployable, cleanly architected intelligence product.

It should not drift into:

- overengineered platform complexity
- dependency bloat
- unclear boundaries
- generic dashboard design
- AI gimmicks without durable architecture
