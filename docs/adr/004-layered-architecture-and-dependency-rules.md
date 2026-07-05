# ADR-004: Layered Architecture Diagram and Automated Dependency Rules

**Status:** Accepted
**Date:** 2026-07-05
**Author:** Oleksandr Ivanishin

## Context

The codebase has grown through several homework iterations (modular refactor, message broker,
saga, gRPC migration) into a layered structure: `common/` (innermost contracts), `core/`
(infrastructure), `integrations/` (3rd-party adapters), `config/`, `views/`, `modules/*` (domain
services), `schedulers/`, and a composition root with two process entry points. This layering has
so far been an informal convention, enforced only by code review.

We need:

- a diagram documenting the layers and how they depend on each other, kept in `docs/`;
- an automated check ("architectural dependency test") that fails when a change violates the
  intended direction of dependencies, so drift doesn't require a human to notice it in review.

## Considered Options

### 1. `dependency-cruiser`

- **Pros:** single tool covers both halves of the task — it can render the real import graph as a
  mermaid diagram (no external binaries like graphviz needed) and enforce directional rules
  between folders as a CI-friendly check (`--output-type err`, non-zero exit on violation). Rules
  support regex path matching, capture-group backreferences (needed for the
  subscription/notification mutual-exclusion rule), and distinguishing `type-only` imports from
  value imports.
- **Cons:** its own configuration DSL to learn; JS/CJS config file.

### 2. `eslint-plugin-boundaries`

- **Pros:** integrates directly into the existing ESLint config, so violations show up in the same
  place as lint errors.
- **Cons:** no diagram generation — would need a second tool (e.g. `madge`) just for the drawing
  half of the task, doubling tooling for no real benefit.

### 3. `madge`

- **Pros:** simple, well-known, can detect circular dependencies and output a graph.
- **Cons:** graph only, no way to express "folder A must not import folder B" as a failing check —
  doesn't cover the "тест архітектурних залежностей" (dependency test) requirement at all.

## Decision

Use **dependency-cruiser**:

- `.dependency-cruiser.cjs` encodes the layering as `forbidden` rules:
  - `core/**` must not import `modules/**`.
  - `common/**` must not import `modules/**`.
  - `common/**` must not import `core/**`, except `core/logger` (logging is a cross-cutting
    concern usable from any layer).
  - `modules/subscription/**` and `modules/notification/**` must not import each other by value
    (only `type-only` imports may cross), so the two modules stay runtime-decoupled while the saga
    orchestrator can still type-check against the event shape it compensates on.
  - Built-in `no-circular` (error) and `no-orphans` (warn, expected noise from type-only-only
    interface files) for general hygiene.
- `npm run arch:check` runs the ruleset in CI (`.github/workflows/lint.yml`, right after
  `npm run lint`) and fails the build on any `error`-level violation.
- `npm run arch:graph` regenerates `docs/architecture-graph.mmd`, the full as-built import graph,
  as a companion to the hand-drawn summary diagram in `docs/architecture.md`.

## Consequences

### Positive

- Layer violations are caught in CI instead of relying on code review vigilance.
- The diagram in `docs/architecture.md` and the auto-generated `docs/architecture-graph.mmd`
  cannot silently drift from the rules — both come from the same tool/config.
- Verified against the current codebase: `npm run arch:check` passes with zero errors, confirming
  the ruleset matches reality rather than an aspirational structure.

### Negative

- One more devDependency and one more config file to maintain as the module structure evolves.
- The two documented exceptions (logger cross-cutting import, saga type-only import) must be kept
  in sync between the rule comments, `docs/architecture.md`, and this ADR if they ever change.
