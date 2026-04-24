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
- **Major-compatible range** — `implements: core/api-server:^1.0.0` — matches any version satisfying `>=1.0.0, <2.0.0` (SemVer major-compatible). Used when a Recipe supports a compatible range rather than a single pinned version. *Range support is planned; the compiler currently ships exact and unversioned matching.*
- **Unversioned** — `implements: core/api-server` — matches any version of the Component type. Used as a fallback when no version-specific Recipe is registered.

Resolution precedence is exact → major-compatible range → unversioned. When the Manifest resolves a Component request, it picks the most-specific `implements:` match across all registered Recipes for the target provider. If no match is found, the compiler halts; if multiple Recipes tie at the same specificity, the compiler halts with an ambiguity error.

The `implements:` binding is the mechanism that makes "the same Component type, different Recipes for different providers" work: a `core/postgres` Component can have one Recipe implementing it for the `helm` provider and a different Recipe implementing it for the `terraform` provider. Each Recipe declares the same `implements:` value; the Manifest's provider-axis grouping routes the request to the correct Recipe at build time.

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
* **Dev Environment (`release-dev.yaml`):** `env_iops: "1000"`
* **Prod Environment (`release-prod.yaml`):** `env_iops: "25000"`

**The Bulletproof Compilation Order:**
This mechanism is protected by the strict execution order of the Go Compiler (Step 1):
1. **Interpolation First:** The compiler reads the Prod `Release` and interpolates `"25000"` into the `Aggregate` string.
2. **CUE Validation Second:** The CUE engine runs. It sees `values.required_iops: 25000` and pipes it into `infra.iops_limit`.
3. **Execution Last:** The Ops `Recipe` receives the fully resolved `.infra` payload and the Wasm renderer plugin generates the correct physical database configuration. The developer gets their explicit hardware control, Ops gets their environment-specific scaling, and the `Aggregate` remains target-agnostic.
