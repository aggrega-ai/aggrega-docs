# Errors Overview

The Errors chapter set catalogs what the compiler emits when something goes wrong. Two kinds of signal: **fatal halts** that stop compilation and produce a non-zero exit code, and **non-halting warnings** that flag authoring or deployment concerns without blocking the build. The catalog is organised by signal kind rather than by pipeline step, so the reader arriving at an error message can locate its entry directly.

Fatal halts cover schema violations, schema composition failures (per-pillar JSON Schema declarations rejecting the authored payload, the publishing-discipline policy plugin's enforcement model surfacing a narrowing violation — see [`../architecture/11-governance-and-compliance.md`](../architecture/11-governance-and-compliance.md) §"Inheritance and policy narrowing"), missing-reference errors (a Recipe's `implements:` pointing at a Component that doesn't exist, a Release pointing at a Manifest that lacks a Recipe for a declared Component type), credential-label-partition violations, and the handful of cross-field invariants the compiler re-validates beyond what schema validation catches. Non-halting warnings cover authoring smells (unused `values` keys, unused `infra` knobs indicating Ghost Infrastructure) and pending-execution notices (a Recipe declares a `pipeline` Wasm step that validates its shape but defers execution).

## Per-topic reference

- [Fatal halts](errors/fatal-halts.md) — the catalog of compilation-stopping errors, organised by pipeline step where the check fires. Each entry names the error's trigger, the remedy, and the offending authoring surface.
- [Warnings](errors/warnings.md) — non-halting warnings emitted during compilation and the external linter-domain checks that enforce policy-style rules outside the core compiler.
