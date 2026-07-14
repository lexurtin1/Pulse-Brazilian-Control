# Architecture remediation roadmap

## Working agreement

The remediation proceeds as tracer bullets. Only one bullet may be in progress at a time. A bullet crosses every affected layer, includes migration and compatibility work, passes the repository verification command, and is committed and pushed before the next bullet starts.

The pre-existing local change to `packages/ui/src/components/CesiumGlobe/CesiumGlobe.tsx` is not part of this programme and must not be staged by remediation commits unless it is separately approved.

Run the safety gate with:

```sh
npm run verify
```

## Ordered bullets

1. **Safety baseline** — complete (`33036ab`). Tests cover every package, strict typechecking is clean, and `npm run verify` is the shared gate.
2. **Transactional signal creation** — complete. The application owns a unit-of-work boundary; Postgres implements commit/rollback; Account rows are locked in stable order; Signal and mirrored Account links succeed or fail atomically.
3. **Canonical Account–Signal relationship** — complete. `account_signals` is the sole persisted relationship, backfilled from the authoritative Signal side; both JSON copies and Account-side mutation behavior are removed.
4. **Canonical temperature state** — make assessment history authoritative and derive current temperature as a projection.
5. **Canonical location model** — make one location object authoritative and remove Account/LocationRecord write-through copies.
6. **Transactional ingestion** — make imports atomic or explicitly resumable and idempotent.
7. **Durable source artifacts** — retain immutable, content-addressed source material for evidence reconstruction.
8. **Shared application policies** — centralize account matching, boundary codecs, evidence codecs, and DTO projections.
9. **Provider-neutral integrations** — split capability ports and externalize providers, prompts, models, and geographic constraints.
10. **Consistent API contracts** — use one error envelope and one client transport policy.
11. **Remove redundant paths** — resolve competing document workflows and overlapping presentation dependencies.
12. **Domain hardening** — introduce justified value objects, database constraints, and final architecture regression coverage.

## Completion rule

A bullet is complete only when its affected domain rules are explicit, its code and migrations are implemented, automated checks pass, operational compatibility has been considered, and its dedicated commit is present on the remote branch.
