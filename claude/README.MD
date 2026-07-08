# Claude Folder

This folder contains the Claude operating assets for Pulse Brazil.

These files are not loose prompt notes.
They are part of the product architecture.

Pulse is a Claude-native intelligence platform, not a dashboard and not a generic chatbot over documents.
Claude is the core reasoning engine, but it must operate inside a controlled, reviewable, domain-aware system.
This folder exists to make that behavior explicit, versioned, and maintainable.

## Purpose

The `claude/` folder should define:

- How Claude should behave in this repository
- What principles Claude must follow when designing and building product features
- How Claude should reason about Pulse Brazil
- How Claude should handle ambiguity, planning, and implementation
- How prompt assets are organized and reviewed

## Core principles

- Claude is central to the product’s value.
- Claude is not the source of truth.
- The domain model remains the contract around intelligence.
- Prompt assets should be treated like code.
- Prompt behavior must be explicit, versioned, and reviewable.
- Deterministic logic should stay outside prompts where possible.
- Claude should reason over prepared context, not over the entire world.
- Outputs should be structured, useful, and easy to audit.

## Working model

Pulse should be built as a controlled intelligence layer that:

1. Ingests signals and source material
2. Normalizes and contextualizes them
3. Gives Claude a tightly scoped task
4. Produces structured or explainable intelligence
5. Persists the result in a durable system
6. Surfaces that intelligence visually and conversationally

Claude should not be treated as a freeform autonomous agent.
Claude should be treated as a bounded intelligence engine operating inside product workflows.

## Folder intent

At minimum, this folder should eventually contain:

- `CLAUDE.md` for overall working rules
- Task instructions for common reasoning jobs
- Source-type guidance for how to interpret uploaded material
- Geography or market overlays such as Brazil
- Output schemas for structured responses
- Policies for ambiguity handling, evidence use, and plan mode

## Design posture

Pulse Brazil should feel:

- Light themed
- Calm
- Premium
- Minimal
- Operational
- Design-led
- More like an intelligence instrument than a dashboard

Claude should avoid producing:

- Generic SaaS UI
- Dark cyberpunk visuals
- Decorative AI concepts
- Overcomplicated architecture
- Unreviewable prompt spaghetti

## Engineering posture

Claude assets in this folder should be:

- Specific
- Reusable
- Versioned
- Easy to diff
- Easy to improve
- Narrow in responsibility

Each file should have one clear job.
Do not create vague catch-all prompt documents.

## Change rules

When updating this folder:

- Prefer editing existing files over creating duplicates
- Keep naming explicit and stable
- Make instruction files composable
- Avoid hidden assumptions
- Keep business invariants outside prompt text where possible
- Document major prompt strategy changes in pull requests or ADRs

## Expected behavior from Claude

Claude working in this repository should:

- Ask clarifying questions when scope is unclear
- Use plan mode before major work
- Prefer incremental changes over large rewrites
- Explain trade-offs when multiple options exist
- Respect Domain-Driven Design and Clean Architecture
- Preserve the Pulse Brazil product vision in implementation details

## Rule of thumb

If a file in this folder cannot be clearly explained in one sentence, it is probably too broad.

If a prompt tries to replace the domain model, it is doing too much.

If Claude is being asked to guess instead of reason from prepared context, the workflow needs improvement.
