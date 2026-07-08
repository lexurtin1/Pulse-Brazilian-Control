# @pulse-brazil/domain

The domain layer for Pulse Brazil. Pure TypeScript — no Next.js, no Postgres/PostGIS, no MapLibre/deck.gl, no Claude client, no HTTP, no UI. Everything here is business language and invariants; every future layer (application, infrastructure, presentation) consumes this model rather than defining it.

Zero runtime dependencies, by design. Invariants are enforced with hand-written checks that throw `InvariantViolationError`, not a schema library — see [ARCHITECTURE_PRINCIPLES.md](../../claude/ARCHITECTURE_PRINCIPLES.md) for why the project prefers a minimal dependency footprint.

## How to read this package

Each folder under `src/` is a module of related concepts. Most export a mix of:

- **Entities** — have identity and a lifecycle, constructed via a static factory (`.of(...)`, `.create(...)`, `.fromRawAddress(...)`) that enforces invariants, never a public constructor. State changes return a *new* instance rather than mutating in place (`account.withStatus(...)`, `officeLocation.verify(...)`), which keeps aggregates predictable to reason about and safe to share.
- **Value objects** — no identity, defined entirely by their contents (`Coordinate`, `ConfidenceScore`, `GeographicScope`). Also constructed via static factories.
- **Enums** — closed or semi-closed vocabularies (`TemperatureBand`, `ThemeCategory`). Most carry an `Other` member so real-world data that doesn't fit yet has somewhere to go without a domain change.

All entity/aggregate identifiers (`AccountId`, `SignalId`, etc., in `shared/identifiers.ts`) are branded strings. **The domain never generates its own IDs.** They are supplied by whoever constructs the entity — application or infrastructure code, backed by a database sequence, a `uuid`, or an external system's id. This keeps the domain free of any ID-generation dependency and makes persistence a pure mapping problem for infrastructure to solve.

## Module map

| Module | Owns | Why it's shaped this way |
|---|---|---|
| `shared/` | Identifiers, `DomainError`/`InvariantViolationError`, `ConfidenceScore`, `EvidenceReference`, `GeographicScope`, `ExternalReference`/`ExternalSystem`, `RelatedEntityReference`, `ConnectorSource` | The kernel every other module depends on. Nothing in here depends on another module — keeps the dependency graph a strict DAG rooted at `shared`. |
| `account/` | `Account` (aggregate root), `OfficeLocation`, `Coordinate`, `TemperatureAssessment`, `AccountRelationship`, plus their enums | The center of gravity: a durable business entity, not a CRM mirror. Salesforce is one `ExternalReference` among possibly several, not the account's identity. |
| `theme/` | `Theme`, `ThemeCategory` | Shared reference vocabulary (order routing, regulation, cross-border, tokenisation, ETF, competition, + `Other`) that accounts and signals link to by id. |
| `signal/` | `Signal`, `SignalType`, `SignalOrigin` | Discrete market/account intelligence, always linked to at least an account, a theme, or a geography — no orphan facts. |
| `document/` | `SourceDocument`, `DocumentType`, `IngestionState`, `Provenance` | Uploaded material moving through a validated ingestion pipeline, with declared vs. inferred type kept as two separate fields. |
| `note/` | `Note`, `NoteType` | The salesperson's own call/meeting notes — raw human record, pre-AI. |
| `context/` | `ContextBundle`, `PromptProfile` | The domain's half of "Claude gets bounded context": a manifest of what evidence was assembled, and a reference to which versioned prompt asset was used — never the prompt text itself. |
| `insight/` | `Insight`, `InsightOrigin`, `RecommendedAction` | Structured, explainable intelligence — never a freeform blob. Cannot be constructed without at least one related entity and at least one piece of evidence. |

Dependency direction is one-way: `shared` ← every other module; `context` ← `insight` (for `PromptProfile` traceability). No cycles.

## Aggregate boundaries

- **`Account`** is the aggregate root for identity, office locations, theme/signal linkage, external references, and the *current* temperature snapshot.
- **`TemperatureAssessment`** is its own entity, not embedded history inside `Account`. Every assessment is immutable once created; a new read produces a new `TemperatureAssessment` rather than overwriting the last one, so the "why did this account's temperature change" trail is never lost. `Account` holds a reference to the latest one for at-a-glance reads; the full history is a separate collection the application/infrastructure layer owns.
- **`AccountRelationship`** is independent of both accounts it connects — it references `fromAccountId`/`toAccountId` by id rather than being owned by either `Account`, since a relationship spans two aggregate roots. This is the seed of the future relationship graph.
- **`SourceDocument`** and **`Signal`** are their own aggregates, linked to accounts/themes by id rather than embedded, so ingestion and market intelligence can evolve independently of any single account.

## Key invariants worth knowing

- `Coordinate`: latitude/longitude must be in valid ranges — no silent clamping.
- `OfficeLocation`: can only reach `ManuallyVerified`/`ManuallyOverridden` by going through `verify()`/`override()`, which set the coordinate and state together — the "verified but no coordinate" state is unrepresentable, not just disallowed.
- `Account`: exactly one `officeLocations` entry is primary when any exist; `externalReferences` has at most one entry per `ExternalSystem`.
- `Signal`: must link to at least one account, theme, or geographic scope; `MachineDerived` origin cannot claim `ConnectorSource.ManualEntry`.
- `SourceDocument`: ingestion state changes go through `transitionTo()`, which rejects any transition not in the allowed-transition map (e.g. `Received → Linked` directly is rejected).
- `Insight`: cannot be constructed with zero related entities or zero evidence — evidence-backed by construction, not by convention.
- `InsightOrigin`: `ClaudeGenerated` and `HumanReviewedClaudeGenerated` require both a `PromptProfile` and a `ContextBundleId` — no untraceable AI-derived insight.

## What's deliberately not here

- **No domain services.** Nothing yet needs cross-entity orchestration that isn't already an invariant on a single entity's factory or update method. If that changes (e.g. a policy that spans `Account` + `Signal` + `Theme` at once), add a service then — don't add one speculatively now.
- **No repositories, persistence, or Postgres/PostGIS types.** Those are infrastructure.
- **No API contracts or DTOs.** Those are application/presentation concerns that will map to/from this model.
- **No prompt text.** `PromptProfile` is a reference (id, name, version, purpose) to a prompt asset that lives under the repo's `claude/` folder — never the prompt content itself.
- **No map/view-model types.** The map, relationship graph, and dossier views all consume this model; they don't define it.

## Extending this model

The enums most likely to need revision once real Salesforce data and a few weeks of signal capture are in hand: `AccountType`, `SignalType`, `DocumentType`. They're kept small and each carries an `Other` member specifically so new data doesn't get blocked waiting on a domain change — extend the enum when a pattern repeats, don't stretch `Other` to cover a recurring case.
