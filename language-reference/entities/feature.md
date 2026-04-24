# Feature

The conceptual role of the Feature entity (the modular operational trait in Domain 2) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). The Credential Feature partition (operational Features vs. credential Features labeled `feature.aggrega.ai/kind: secret`) is described in [architecture/08-credential-model.md](../../architecture/08-credential-model.md). The semantic-label vocabulary used by Feature selectors lives in [entities/component](component.md). This page covers the Feature catalog authoring surface.

## Catalog Location

Unlike Components (which use three-segment URIs with category subdirectories), Features are organized flat — only ~25 files in the standard library, growing slowly.

```
aggrega-catalog/
└── feature/
    └── {namespace}/               # e.g., `core`, `acme`
        ├── secret-value.yaml      # feature.aggrega.ai/kind: secret (credential Feature)
        ├── data-masking.yaml
        ├── k8s-dns-resolver.yaml
        ├── env-override.yaml
        ├── ingress.yaml
        └── ...
```

OCI URI: `hub.aggrega.ai/feature/{namespace}/{feature-name}:{version}` (e.g., `hub.aggrega.ai/feature/core/data-masking:1.0.0`).

## Authoring Contract

Features declare:

* `metadata.labels`: Use `feature.aggrega.ai/kind: secret` to mark a Feature as a credential Feature. The compiler enforces a hard partition — credential-labeled Features appear ONLY in the Developer's `secrets:` block; non-credential Features appear ONLY in the `features:` block.
* `usesSchema` (optional): Declares the topological sockets the Feature can consume (e.g., a credential Feature's `path` / `key` socket targeting a vault). See [architecture/13-catalog-and-registry.md §2](../../architecture/13-catalog-and-registry.md) for the Split Schema mechanism.
* `cueSchema`: Validates the Feature's `values` block (the cognitive intent the Developer or Platform Ops configures on each instance).
* `secretsSchema` (optional): Declares credential slots the Feature needs for its own operation (e.g., a Datadog sidecar Feature's API key slot). See [architecture/08-credential-model.md §8](../../architecture/08-credential-model.md) for the Feature-owned secrets pattern.
* `appliesTo` / `appliesToExpressions` / `appliesToAnyOf`: Label selectors controlling which Components the Feature can attach to. Evaluated by the compiler's native label-matching engine during the static analysis stage. See [Label-Based Attachment](#label-based-attachment) below and [architecture/13-catalog-and-registry.md §2 "Kubernetes-Style Selectors"](../../architecture/13-catalog-and-registry.md) for the selector syntax reference.
* `interoperability` (optional): A nested block grouping operational safety mechanisms — `conflictsWith` (array of Feature type URIs that cannot attach to the same component simultaneously) and `componentRefPath` (JSONPath telling the renderer where to inject the resolved target component's name). See [The `interoperability` Block](#the-interoperability-block) below for the full teaching.

The structural rendering of a Feature is bound to its corresponding [FeatureRecipe](featurerecipe.md), which maps the Feature interface to a concrete infrastructure implementation.

## Label-Based Attachment

The three applies-selectors on the Feature schema control which Components the Feature attaches to, evaluated by the compiler's native label-matching engine during the static analysis stage:

* **`appliesTo`** — simple key-value equality map. The most concise form; a Feature declaring `appliesTo: { "datastore.aggrega.ai/engine": "vector" }` attaches only to Components labeled with that exact key-value pair.
* **`appliesToExpressions`** — Kubernetes-style expression list with richer operators: `In`, `NotIn`, `Exists`, `DoesNotExist`. Each entry carries `{ key, operator, values? }`; multiple expressions AND together. A Feature can apply to `component.aggrega.ai/type In [server, worker]` AND `compliance.aggrega.ai/data-class NotIn [restricted]`, expressing "any server or worker that does not hold restricted data" in a single selector.
* **`appliesToAnyOf`** — OR-logic composition. A list of selector blocks where any single block matching is sufficient. Used when a Feature fits multiple unrelated component shapes — for example, an observability Feature that applies to either `{ component.aggrega.ai/type: worker }` OR `{ component.aggrega.ai/type: task }` without forcing the two into a single expression list.

Without the expression and any-of forms, Architects would need to duplicate the same Feature YAML for every semantic combination the selector should cover. The three forms compose: a Feature may declare any combination of them, and results AND at the selector-block level within each form and across forms.

See [architecture/13-catalog-and-registry.md §2 "Kubernetes-Style Selectors"](../../architecture/13-catalog-and-registry.md) for the selector-syntax reference and the full `In` / `NotIn` / `Exists` / `DoesNotExist` operator semantics.

## The `interoperability` Block

The Feature schema declares an optional `spec.interoperability` block that groups two operational safety mechanisms — one controlling how the Feature can coexist with others on the same component, and one instructing the renderer where the Feature's resolved artifacts land in the generated output.

**`interoperability.conflictsWith`** — an array of Feature type URIs mutually exclusive with the Feature being defined. If a developer attaches two Features to the same component and one Feature's `conflictsWith` array references the other's type, a custom `linter.wasm` plugin detects the intersection and halts the build before rendering physical artifacts. This prevents generating incompatible configurations — e.g., attaching both a TCP-only mesh and an HTTP-aware proxy to the same component.

**`interoperability.componentRefPath`** — a deterministic JSONPath / YAMLPath string that tells the provider engine exactly where to inject the resolved physical target ID of the component during Late Binding. Because Aggrega compiles ahead of time, a FeatureRecipe's Wasm plugin executes before the final Helm chart (or Terraform module) is fully rendered, so the plugin does not know the final physical name of the deployment target. `componentRefPath` is the deterministic coordinate the Wasm renderer uses to write that name into the final generated artifact.

**Example:**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/autoscaler
  version: 1.0.0
spec:
  appliesTo:
    component.aggrega.ai/type: server
  cueSchema: |
    values: { min_replicas: int, max_replicas: int }
  interoperability:
    conflictsWith:
      - core/fixed-replica-controller
    componentRefPath: "/spec/scaleTargetRef/name"
```

This Feature attaches only to `server`-typed Components, declares incompatibility with another replica-controlling Feature, and instructs the renderer to write the target component's resolved name into the generated artifact at `.spec.scaleTargetRef.name`.

## Composability: the Purity Social Contract

The standard-library convention is **one Feature, one internal function** — an observability sidecar is an observability Feature; a network-proxy sidecar is a network-proxy Feature; they do not combine into a single composite with two unrelated concerns. The convention keeps individual Features composable, independently versioned, and independently attachable.

The core Go compiler does not enforce this convention. Feature definitions with mixed concerns are syntactically legal and compile cleanly. Enforcement is opt-in:

* Enterprises authoring internal catalogs may author a custom `linter.wasm` plugin that inspects Feature definitions in CI/CD and warns when a single Feature's `appliesTo` labels span unrelated capability domains.
* The `interoperability.conflictsWith` declaration on paired Features provides runtime composition discipline when two attached Features would otherwise overlap on a component.

Open-source standard-library Features follow the purity convention by authoring discipline; enterprise catalogs are free to deviate when a tightly-coupled composite genuinely fits the deployment model.
