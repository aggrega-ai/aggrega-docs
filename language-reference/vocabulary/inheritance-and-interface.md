# extends and implements

## Inheritance via `extends`

Catalog entities (`Component`, `Feature`) support Single Inheritance via the `extends` keyword, which lets Platform Architects build specialized child entities on top of a shared base. Credential Features — those labeled `feature.aggrega.ai/kind: secret` — use the same inheritance mechanism: a child credential Feature can extend a parent to inherit its vault query schema while narrowing constraints.

When the compiler resolves an `extends` chain, it performs a **Two-Tiered Merge**:

1. **YAML envelope deep-merge.** Metadata, labels, and declarative fields on the child YAML overwrite matching keys in the parent; arrays append; nested maps recurse.
2. **CUE schema unification.** The child's `cueSchema` is unified with the parent's via CUE's `&` operator, producing a single merged schema that both constraint sets must satisfy.

CUE unification is monotonic: the child can narrow the parent's constraints but cannot widen them. If a base component `core/base-server` declares `tls_enabled: true` and a child component attempts to override it with `tls_enabled: false`, the compiler evaluates `true & false`, which resolves to `_|_` (Bottom/Error) and the build halts with a unification failure. The parent acts as an immutable contract: child schemas narrow parent constraints; they cannot relax them.

## Interface Binding via `implements`

Recipes and FeatureRecipes bind to a Component or Feature interface via the `implements:` keyword at the top of their `spec`. The binding declares which catalog interface this Recipe / FeatureRecipe is the concrete implementation of, and supports three forms of version matching:

- **Exact** — `implements: core/api-server:1.0.0` — matches one specific version of the Component type. Highest resolution precedence.
- **Major-compatible range** — `implements: core/api-server:^1.0.0` — matches any version satisfying `>=1.0.0, <2.0.0` (SemVer major-compatible). Used when a Recipe supports a compatible range rather than a single pinned version.
- **Unversioned** — `implements: core/api-server` — matches any version of the Component type. Used as a fallback when no version-specific Recipe is registered.

Resolution precedence is exact → major-compatible range → unversioned. The catalog walks the three forms in order: an exact-string match against the caller's URI wins first; failing that, the catalog iterates entries with a `:^<version>` caret form sharing the same base and returns the entry whose constraint the caller's version satisfies (when multiple caret entries match, the one with the highest baseline version wins as the more-specific match); failing that, the catalog tries the bare base URI for an unversioned fallback. If no match is found across the three forms, the compiler halts with an unmapped-Recipe error; if multiple non-caret Recipes tie at the same specificity, the compiler halts with an ambiguity error.

The `implements:` binding is the mechanism that makes "the same Component type, different Recipes for different providers" work: a `core/postgres` Component can have one Recipe implementing it for the `helm` provider and a different Recipe implementing it for the `terraform` provider. Each Recipe declares the same `implements:` value; the Manifest's provider-axis grouping routes the request to the correct Recipe at build time.

## Cross-entity version consumption

The 'Resolution precedence' framing in the section above describes the design target; the table below describes what the resolver matches against today.

All eight Aggrega entities (Component, Feature, Aggregate, Recipe, FeatureRecipe, Manifest, Release, Provider) share a uniform `metadata.version` field validated against the same SemVer regex (`MAJOR.MINOR.PATCH` per [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) §3). Versions are uniform in *shape*; the *consumption* of versions varies per entity kind. Some versions actively participate in resolution; others are descriptive provenance the compiler does not match against. The summary below names what the compiler does with each entity's version field today, and uses the four-label status taxonomy from [`10-status.md`](../10-status.md) to classify each consumption regime.

| Entity | Consumption regime | Status today |
| --- | --- | --- |
| Component | Recipe `implements:` matching | `available` — exact, caret-range (`^MAJOR.MINOR.PATCH`), and unversioned forms with three-form precedence iteration (see [Status → Version matching](../10-status.md#version-matching)) |
| Feature | FeatureRecipe `implements:` matching | Same as Component |
| Recipe | Manifest mapping tier resolution | `accepted but inert` |
| FeatureRecipe | Manifest mapping tier resolution | Same as Recipe |
| Aggregate | Parent `aggregates[].type` URI matching | `available` for verbatim string match against catalog `metadata.name`; no version-segment parsing |
| Provider | `recipe.spec.provider` engine factory dispatch | `available` for bare-name dispatch only; version-pinning `accepted but inert` |
| Manifest | Provenance label emission | `available` (consumed only at `internal/compiler/ir/provenance.go`; no role in resolution dispatch) |
| Release | Provenance label emission + template metadata (`release_version`) | Same as Manifest |

**Catalog-resolution regimes (Component, Feature, Aggregate, Provider).** The `available` label on these rows describes what the catalog lookup performs at Recipe / FeatureRecipe selection. The catalog indexes Recipes by their `spec.implements` declaration and walks three forms in order at lookup time: exact-string match (the caller's URI literally equals an indexed key); caret-range match (the caller's URI carries a parseable version that satisfies a `<base>:^<version>` constraint declared by some Recipe in the catalog — when multiple caret entries match, the one with the highest baseline version wins); unversioned fallback (the caller's URI strips its version segment and tries the bare base). FeatureRecipes mirror the same precedence. Aggregate sub-aggregate imports and Provider engine dispatch use a simpler shape today — both look up by literal-string match (`aggregates[].type:` against the catalog Aggregate's `metadata.name`; `recipe.spec.provider` against the engine factory's bare-name dispatch); neither carries the three-form precedence the Recipe / FeatureRecipe lookup ships.

**Manifest mapping tier resolution.** The Manifest's `mappings.<provider>.{components,features}` two-tier resolution mechanism (with `name` and `type` tiers, name-wins-over-type, and versioned-type wins over unversioned-type) is documented at [`entities/manifest.md`](../entities/manifest.md). The struct shape and schema accept the mappings; the resolver and renderer do not consume them today. Recipe selection runs through the catalog's `spec.implements` index as described above, bypassing the Manifest mapping tiers entirely. The mapping shape is reserved for the future when the resolver consults Manifest mappings to disambiguate per-provider Recipe selection (e.g., one Recipe for helm, another for terraform implementing the same Component); today the per-provider distinction is carried by the Recipe's own `provider:` field at engine dispatch. See the observation referenced below for the implementation gap.

**Descriptive-provenance regimes (Manifest, Release).** Manifest `metadata.version` and Release `metadata.version` are read at [`internal/compiler/ir/provenance.go`](../../../aggrega-cli/internal/compiler/ir/provenance.go) for provenance struct population and downstream label emission (e.g., `aggrega.ai/release-version` on rendered Kubernetes manifests). Templates also see Release version exposed as `.metadata.release_version`. Neither version is matched against any other entity's version for resolution dispatch; these are pure provenance.

**Reading the table.** The four-label classification distinguishes "the version field is accepted by the schema and exists on the entity" (always true — uniform SemVer regex) from "the compiler matches against this version during resolution" (varies per entity). When the precedence-iteration extension and Manifest mapping tier consumption ship in their respective future releases, this table's labels update to `available` accordingly; until then, the table reflects what the resolver does today rather than what the architectural design promises.

## CUE Inheritance: Bridging Intent to Infrastructure

Aggrega expresses a strong Separation of Concerns between Domain 1 and Domain 4: Developers write cognitive logic in the `values` block, while Ops Engineers dictate physical sizing in the `infra` block. The `Aggregate.yaml` schema enforces one concrete corollary: the `infra` keyword is absent from the Aggregate's `component_instance` / `feature` / `secret` slots and, combined with `additionalProperties: false`, is rejected by schema validation. Developers should not dictate physical sizing inside Developer Intent; when a specific value fits the application's case (e.g., a hardcoded port or a specific CPU number), the Architect may expose it explicitly in the Component's CUE schema and the value flows through `values`.

For cases where a specific infrastructure constraint is an intrinsic part of a component's contract — a high-throughput trading database that must have 10,000 provisioned IOPS, an ML workload that must run on exactly 4 GPUs — Platform Architects expose the constraint through a specialized child component built with **CUE Inheritance**.

**CUE Inheritance for Infrastructure-Aware Components**
The child component extends a target-agnostic base, exposes the specific infrastructure dial inside the developer's `values` block, and pipes the value natively to the Ops `infra` block using CUE unification. The result is a typed bridge between cognitive intent and physical sizing: the developer dictates the hardware constraint through a validated field, and the constraint flows to Ops without either side writing raw infrastructure code.

```yaml
# Domain 2: The Platform Catalog (The CUE Bridge)
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/high-perf-postgres
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "stateful-server"
spec:
  extends: core/base-postgres
  cueSchema: |    // 1. Expose the dial safely to the Developer
    values: { required_iops: int }
    // 2. CUE dynamically pipes it to the Ops reality
    infra: { iops_limit: values.required_iops }
```

```yaml
# Domain 1: The Developer Intent (Remains Pure)
components:
  trading-db:
    type: core/high-perf-postgres:1.0.0
    values:
      required_iops: 10000 # Developer dictates the hardware constraint safely
```

**Multi-Environment Scaling (The Hoisting Requirement):**
To scale this hardware constraint across GitOps environments (Dev vs. Prod) without mutating the developer's `Aggregate.yaml`, the developer must hoist the value to the `parameters` contract. Ops can then fulfill the specific IOPS requirement via environment-specific `Release` files. The compiler's execution order strictly protects this: Interpolation resolves the parameter -> CUE pipes the value to `infra` -> The Ops `Recipe` receives the physical sizing.

**1. The Developer Intent (Abstracting the Dial):**
The Developer knows they need to control IOPS, but they abstract the explicit number to the environment level.

```yaml
spec:
  parameters:
    env_iops: ""  # The contract Ops must fulfill
  components:
    trading-db:
      type: core/high-perf-postgres:1.0.0
      values:
        required_iops: "{{ .parameters.env_iops }}" # Hoisted to the environment
```

**2. The GitOps Releases (Ops Overrides):**
Ops has complete control over the physical reality across environments by fulfilling the `parameters` contract in environment-specific `Release` files. They never touch the Developer's logic.

- **Dev Environment (`release-dev.yaml`):** `env_iops: "1000"`
- **Prod Environment (`release-prod.yaml`):** `env_iops: "25000"`

**The Bulletproof Compilation Order:**
This mechanism is protected by the strict execution order of the Go Compiler (Step 1):

1. **Interpolation First:** The compiler reads the Prod `Release` and interpolates `"25000"` into the `Aggregate` string.
2. **CUE Validation Second:** The CUE engine runs. It sees `values.required_iops: 25000` and pipes it into `infra.iops_limit`.
3. **Execution Last:** The Ops `Recipe` receives the fully resolved `.infra` payload and the Wasm renderer plugin generates the correct physical database configuration. The developer gets their explicit hardware control, Ops gets their environment-specific scaling, and the `Aggregate` remains target-agnostic.
