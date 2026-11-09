# Errors Overview

The Errors chapter set catalogs what the compiler emits when something goes wrong. Two kinds of signal: **fatal halts** that stop compilation and produce a non-zero exit code, and **non-halting warnings** that flag authoring or deployment concerns without blocking the build. The catalog is organised by signal kind rather than by pipeline step, so the reader arriving at an error message can locate its entry directly.

Fatal halts cover schema violations, schema composition failures (per-pillar JSON Schema declarations rejecting the authored payload), missing-reference errors (a Recipe's `implements:` pointing at a Component that doesn't exist, a Release pointing at a Manifest that lacks a Recipe for a declared Component type), and the handful of cross-field invariants the compiler re-validates beyond what schema validation catches. Fatal halts also include remote-acquisition failures — a pinned catalog entity or source artifact that cannot be fetched from its registry or remote source (missing, unauthenticated, unreachable, or digest-mismatched against the lockfile) — which surface during `aggrega pull` and during `aggrega build`'s lockfile verification, tagged `FETCH_ERROR`. Non-halting warnings cover authoring smells (unused `values` keys, unused `infra` knobs indicating Ghost Infrastructure) and fields a target cannot honour (a Workload field, or an `aggrega.ai/` annotation, that the provider rendering a node does not act on).

## Per-topic reference

- [Fatal halts](errors/fatal-halts.md) — the catalog of compilation-stopping errors, organised by pipeline step where the check fires. Each entry names the error's trigger, the remedy, and the offending authoring surface.
- [Warnings](errors/warnings.md) — non-halting warnings emitted during compilation and the external linter-domain checks that enforce policy-style rules outside the core compiler.
- [Error translation](errors/error-translation.md) — the category prefixes (`DEVELOPER_ERROR`, `OPS_ERROR`, `CATALOG_ERROR`, `TRANSLATION_ERROR`, `FETCH_ERROR`, `POLICY_ERROR`, `TRUST_ERROR`) and the single-line and multi-line output shapes.
- [Error sentinels](errors/sentinels.md) — the three identifiers every condition carries (the Go sentinel a program matches with `errors.Is`, the code it is registered under, and the short code a diagnostic prints) and the table that resolves every short code.
- [Compatibility](compatibility.md#error-codes) — what the short codes promise across releases: a code is never renumbered and never given to a different condition.
