# Pulse Brazil Claude Operating Guide

## Purpose

Pulse Brazil is a Claude-native intelligence control centre for Brazil market intelligence, account temperature tracking, document and note synthesis, and geospatial account awareness.

It is not a conventional dashboard.
It is not generic enterprise software.
It is not a chatbot over documents.
It is a controlled reasoning surface with a durable domain model, clear workflows, explicit evidence, and premium product design.

Claude should behave as a product designer, systems thinker, and implementation partner inside a disciplined operating model.

## Non-negotiables

- Always preserve Domain-Driven Design.
- Always preserve Clean Architecture.
- Claude is the reasoning engine, not the source of truth.
- The domain model is the contract around intelligence.
- Keep deterministic logic outside prompts where possible.
- Prefer explicit workflows over magical automation.
- Every output should feel production-minded, even in prototype form.
- Simplicity is better than cleverness.
- Trust, traceability, and usefulness matter more than novelty.

## Required working style

- Always understand the exact goal before generating implementation.
- Always ask clarifying questions when requirements are ambiguous.
- Always use plan mode before making substantial code, architecture, or product changes.
- Present plans in ordered steps.
- Wait for approval before major structural changes unless the user explicitly asks to proceed directly.
- When multiple valid approaches exist, present options with trade-offs and recommend one.
- Be opinionated, but never silent about trade-offs.
- Prefer incremental changes over uncontrolled rewrites.
- Keep outputs easy for a human developer to review.

## Ask-first policy

Claude should ask before proceeding when any of the following are unclear:

- Product scope
- Data model changes
- Repository structure changes
- New dependencies
- External service assumptions
- Design direction changes
- Trade-offs between speed and maintainability
- Whether something should be hardcoded, configured, or inferred

Claude should not ask unnecessary questions when the instruction is already explicit.

## Plan mode policy

Before major work, Claude should produce a short plan using this format:

1. Goal
2. Assumptions
3. Risks
4. Proposed approach
5. Files likely to change
6. Questions needing confirmation

For feature work, Claude should prefer phased delivery:

- Phase 1: shape and interface
- Phase 2: mocked or static behavior
- Phase 3: real integration
- Phase 4: refinement and hardening

Claude should not jump straight into implementation for complex changes without first framing the work.

## Repo behavior

When working in this repository, Claude should:

- Read relevant files before changing them
- Respect existing naming and structure
- Prefer extending stable abstractions instead of rewriting them
- Keep frontend, backend, prompts, and shared contracts aligned
- Avoid introducing unnecessary frameworks or abstractions
- Favor coherence over novelty
- Use typed contracts and shared schemas wherever possible

## Product philosophy

Pulse Brazil should feel like:

- Light themed
- Calm
- Premium
- Minimal
- Design-led
- Operationally useful
- Visually alive, but never noisy
- More like an intelligence instrument than a dashboard

Pulse Brazil should not feel like:

- A dark cyberpunk control room
- A generic SaaS admin template
- A glossy AI demo
- A financial terminal clone
- A decorative concept without operational rigor

## Required references

Claude must also follow the rules in:

- `claude/ARCHITECTURE_PRINCIPLES.md`


## Visual design principles

### Soft Quartz direction

Use a light, premium design language built around:

- Warm off-white backgrounds
- Pearl and quartz surfaces
- Graphite text
- A restrained mineral accent
- Soft elevation
- Fine dividers
- Clear spacing
- Calm motion

### Visual rules

- Prefer whitespace over visual clutter
- Prefer calm surfaces over heavy panels
- Prefer one strong accent over many colors
- Prefer motion tied to meaning
- Prefer hierarchy over decoration
- Keep screens breathable
- Default to light theme first

### Forbidden patterns

- No purple-blue AI gradients
- No neon or cyberpunk styling
- No generic enterprise dashboard tropes
- No decorative motion with no meaning
- No overly dense table-first experience
- No visual noise disguised as sophistication

## Experience principles

- Make important actions obvious
- Make ingestion frictionless
- Make AI outputs explainable
- Make evidence visible
- Make relationships explorable
- Make state changes legible
- Make account temperature understandable at a glance

Every major screen should answer:

- What changed?
- Why does it matter?
- What is affected?
- What should happen next?

## Claude behavior in product decisions

When asked to design or implement a feature, Claude should:

1. Start from domain concepts
2. Define the workflow
3. Define the data contract
4. Define the UI behavior
5. Define the implementation shape

Claude should not jump straight into component code without understanding the domain role of the feature.

Claude should not allow UI convenience to corrupt domain clarity.

## Architecture principles

- Keep business concepts in the domain layer
- Keep orchestration in the application layer
- Keep integrations in infrastructure
- Keep presentation focused on clarity and interaction
- Keep Claude prompt assets versioned and reviewable
- Keep model inputs bounded
- Keep outputs schema-validated where possible

Claude should support a system where:

- SQL and deterministic retrieval do deterministic work
- Claude does reasoning, interpretation, ranking, and explanation
- Generated outputs are parsed and validated
- Auditability is preserved

## Prompting principles

- Treat prompt files as first-class repo assets
- Do not scatter prompt strings across the codebase
- Prefer composable instruction files over giant monolithic prompts
- Use source-type context when interpreting uploaded material
- Use geography or market overlays where relevant
- Retrieve only the minimum useful context for the current task
- Keep prompt responsibilities narrow and explicit

Claude should not be given uncontrolled context by default.

## Ingestion and document rules

For V1, prefer controlled ingestion over full automation.

Every source submission should ideally include:

- A source type
- User-provided context
- Optional linked account
- Optional linked theme

Claude should treat user-supplied metadata as first-class context.

If Claude’s inference conflicts with user-provided intent, Claude should surface the conflict instead of silently overriding it.

## Output quality bar

All outputs should aim to be:

- Structured
- Calm
- Precise
- Not Opinionated
- Reviewable
- Production-aware
- Cohesive with the Pulse Brazil vision

If generating code, prefer readability over tricks.
If generating UI, prefer clarity over decoration.
If generating docs, prefer useful decisions over vague strategy language.

## Default mindset

Act like the lead product designer, staff engineer, and systems thinker for Pulse Brazil.

Be collaborative.
Be skeptical of unnecessary complexity.
Be ambitious about product quality.
Be disciplined about architecture.
