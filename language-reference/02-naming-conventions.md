# Naming Conventions

This chapter covers the naming and casing rules that apply to authored Aggrega content: the pattern for user-authored instance names, the casing discipline for field names in the DSL, the casing the platform uses for the identifiers it defines rather than you, and the comment syntax used at the YAML authoring surface.

## Instance Names

User-authored instance names — the keys the developer writes for components, features, aggregates, subsystems, boundaries, and `uses` sockets and aliases — all match a single pattern: `^[a-zA-Z0-9_-]+$`. Both **kebab-case** (`pii-filter`, `my-agent`) and **snake_case** (`openai_key`, `db_credentials`) are valid; teams may adopt whichever convention they prefer.

**Allowed characters:** alphanumeric (`a-z`, `A-Z`, `0-9`), hyphens (`-`), and underscores (`_`). No other characters are permitted.

**Examples:**

```yaml
components:
  web-server:        # kebab-case
  finance_worker:    # snake_case

features:
  pii-filter:        # kebab-case
  audit_logger:      # snake_case
  openai_key:        # snake_case — natural for a credential attachment
  db-password:       # kebab-case — also valid
```

| Pattern            | Scope                            | Examples                                 |
|--------------------|----------------------------------|------------------------------------------|
| `^[a-zA-Z0-9_-]+$` | All user-authored instance names | `web-server`, `openai_key`, `pii-filter` |

The pattern is enforced at resolution via JSON Schema `patternProperties`.

### What a component name costs, and why capitals cost more under some targets

The pattern above says what you may write. What a name *costs* is a separate question, and it differs by the target a component is deployed to — so it is worth knowing before you pick a name rather than at the point a build refuses one.

A component's name becomes the identity every resource it emits is stamped with, and each target derives its own names from that identity: a chart installer derives a release name, a container orchestrator derives service names. A target whose alphabet is narrower than the pattern cannot carry a character it does not admit, and Aggrega will not quietly fold such a character onto a similar one — two names an author can tell apart must not become one name in a cluster. So a character the target does not admit is written out as an escape instead, and an escape is longer than the character it replaces.

**The practical consequence: an uppercase letter is free under some targets and expensive under others.**

* Under a target whose names admit uppercase — a container-orchestration compose file, for instance — `PaymentsAPI` is carried through exactly as you wrote it and costs eleven characters.
* Under a target whose names are lowercase-only — a chart installer's release name — every capital is escaped, and a name of six capitals alone already exceeds what that target accepts.

There is a second effect, and it is the sharper one: an escape begins with a hyphen. A target that requires a name to *begin* with a lowercase letter or a digit will therefore refuse a name whose **first** character is one it does not admit, however short the rest is — no shortening reaches that.

**The guidance follows from the two effects.** Prefer lowercase letters and digits, with hyphens between words, and begin a name with a lowercase letter. `payments-api` is carried through unchanged by every target Aggrega ships a provider for. `payments_api` is carried through by a compose file but not by the helm target, whose resource names admit no underscore: the Services, workloads and release it names after the component are spelled `payments-zuapi`. `PaymentsAPI` costs more still there. A Recipe that publishes such a resource's address reads the target's own spelling rather than predicting it — see [`templates/rendered-resource-names.md`](templates/rendered-resource-names.md).

A leading digit is legal to write and costs nothing under a compose file, but the helm target refuses it. A Kubernetes Service name has to begin with a letter, and the Services a chart or a synthesized workload emits are named after the component, so a component named `1cache` halts a helm build — the refusal names the component and says a Service name must begin with a letter — rather than rendering Services the cluster would refuse.

None of this is a rule the compiler applies on its own account — it holds no target's naming rules and invents no limit. Each target's provider answers for its own names, so a name is refused only when the target a component is actually deployed to says it cannot use it, and the refusal carries that target's own reason and points at the `spec.components` key you wrote. A name that is fine under one target and refused under another is the expected behaviour rather than an inconsistency.

Names Aggrega itself composes — the identity of a feature attached at a boundary, for instance — are handled the other way round: they are shortened to fit the target rather than refused, because they are assembled from parts written in several places and no single author can see the length they reach. Only a name you wrote is refused.

## The Dot as a Reserved Path Separator

The period character (`.`) is reserved from all user-authored instance names. The dot serves the structural purpose of a compiler-generated path separator for cross-aggregate component references.

When a root Aggregate imports a sub-aggregate named `data-layer` containing a component named `main-db`, the compiler constructs the flattened absolute ID `data-layer.main-db` by joining the aggregate instance name and the component instance name with a dot. This dotted path appears in:

* **Developer `uses` targets:** `target: data-layer.public_db` — referencing an exported component from a nested aggregate.
* **The build's own diagnostics:** a halt or a warning about that component names it by its dotted path, so the name you read is the one you can search your documents for.

### The separator does not reach a name

A dotted path is an address inside your documents, and it is **not** a name a deployment target will accept. A Kubernetes Service name admits no dot at all; worse, a dot inside a cluster address is what separates a service from the namespace it lives in, so a dotted name handed to a consumer as a host would resolve to a different service rather than failing.

So the separator is **written out** of every name and label the build derives from a component's identity, and it is written out rather than replaced: `data-layer.main-db` becomes `data-layer-zdmain-db`. Replacing it with a character a target does accept would let two different components arrive at one name — `data-layer.main-db` and a component someone wrote as `data-layer-main-db` — and a name two components reach identifies neither.

What that reaches, and what it does not:

* **It reaches the names and labels derived from the identity** — `metadata.name` on a resource Aggrega synthesizes, the `aggrega.ai/component-id` and `app.kubernetes.io/name` labels, the selectors that match them, the emitted filenames, `{{ .context.instance_id }}`, and the name a provider derives for itself, such as a helm release name. They move together, so an address a Recipe composes from the key that names a resource — `.context.instance_id` where the target names it after the identity, `.context.rendered_name` where the target reports a name of its own — still names the resource the build emits.
* **It does not reach a name you wrote.** A component name carrying no separator comes back byte for byte, so only a component an imported Aggregate contributes is spelled differently in the output than in the document.
* **It does not reach the names inside a chart or fragment an author supplied.** Those belong to whoever wrote them, and a name carried out of a third-party chart — a custom-resource name of the form `<plural>.<group>`, where a dot is legal — is emitted exactly as that chart wrote it.

🔴 **That last point has a consequence for what a Recipe should publish, and it is the easiest thing on this page to get wrong.** A supplied chart's own templates name their resources after the identity the *platform* hands them — a release name, written in that platform's own alphabet rather than in the one above — and the helm target names the workloads it synthesizes after that same release name. So for output rendered from source you supplied, and for a workload synthesized under such a target, `{{ .context.instance_id }}` is **not** the name those resources carry, and an address published from it names nothing whenever the two alphabets differ. The key that carries the platform's name, and which providers report one, are in [`templates/rendered-resource-names.md`](templates/rendered-resource-names.md).

**Writing the separator out costs characters, and a bounded name can run out of them.** The separator is replaced by a short escape rather than by a single character, so a qualified identity is a little longer written than it reads in your documents. That matters only where the name it becomes is bounded: the target that renders a component says how long a label value it will accept, and where the written identity would exceed that, the build halts rather than emitting a value the target would reject. The halt states the length the identity itself must fit in — the length **before** it is written out, so a name chosen inside it works the first time — and the fix is to shorten the authored parts: the name the importing document gives the sub-aggregate, or the component's own name inside it.

The separator is the usual reason a name is written longer than it reads, but it is not the only one. Two shapes an authored name may legally take also cannot be carried through as written, because leaving them would make an escape ambiguous: a name ending in a hyphen, and a name whose hyphen is immediately followed by `z`. Each is written out in the same way, at the same cost. Every other authored name comes back byte for byte, so a name built from letters, digits, underscores and hyphens between words is unaffected by any of this.

A socket name in a component's own `uses` block either matches a key in the catalog entity's `usesSchema` — a declared socket — or names an ad-hoc socket of the developer's own, which builds even on an entity that declares no `usesSchema` at all; a name one edit away from a declared socket draws a warning naming both spellings. A Release's per-edge `uses`, and a Feature attachment's, may name only a socket the entity declares, and any other name fails with an unknown-uses-socket validation error.

## Field Casing

The DSL separates developer-facing YAML (authored by humans) from internal compiler contracts (consumed by templates and tooling):

* **Developer-facing YAML (camelCase):** Multi-word field names in Aggregate, Release, Component, Feature, Recipe, FeatureRecipe, Manifest, and Plugin schemas use camelCase. Examples: `exportedComponents`, `syncWave`, `subDirectory`, `featuresSchema`, `usesSchema`, `valuesMapping`, `injectMapping`, `executionScope`, `appliesTo`, `appliesToAnyOf`, `conflictsWith`. Follows Kubernetes API conventions.
* **Internal contracts (snake_case):** Multi-word field names in the IR Graph schema and the Template Context schema use snake_case. User-facing examples Recipe authors encounter: `instance_id` (in `.context.instance_id` — the Recipe's identity), `inject_raw` (in `.inject_raw`, a top-level pillar alongside `.inject` rather than a key under `.context` — the unmutated injection contract), `attachment_name` (in an attachment FeatureRecipe's context — identifies the slot the attachment fills, or the name it was attached under). Follows JSON API conventions and aligns with Go's JSON struct tag generation.
* **Single-word fields:** Lowercase regardless of context. Examples: `values`, `infra`, `inject`, `provides`, `locals`, `features`, `labels`, `annotations`, `boundaries`, `components`, `subsystems`, `pipeline`, `source`.

Developers do not encounter snake_case in their authored YAML, and template authors do not encounter camelCase in their Go templates. Schema additions follow these conventions.

### Three casings crossing in one statement

Recipe authoring routinely crosses all three casing conventions in a single statement: the schema-defined DSL field uses **camelCase**, the user-authored instance name uses **kebab-case** or **snake_case**, and the template-context reference uses **snake_case**. Authors who notice the crossings as separate conventions read the resulting YAML cleanly; authors who try to rationalise the casings as one convention struggle with the boundaries.

The canonical worked example: a Recipe's `valuesMapping:` template referencing the rendered Component instance via the template context.

```yaml
# Recipe authored against a Component the developer instantiated as "web-server"
# (kebab-case instance name) in their Aggregate.
spec:
  valuesMapping: |        # camelCase — schema-defined DSL field
    name: "{{ .context.instance_id }}"   # snake_case — template context
                                         #   internal contract
    image: "{{ .values.image }}"         # snake_case — template context
                                         #   internal contract
```

Three casings, one statement:

* `valuesMapping` — **camelCase**. The DSL field name the schema defines for the Recipe's mapping template. Camel because the language's developer-facing YAML follows Kubernetes API conventions.
* `web-server` (referenced indirectly via the rendered component) — **kebab-case**. The user-authored instance name in the Aggregate; the developer chose the hyphenated form. Could equally be `web_server` (snake_case); both are valid per the instance-name pattern.
* `instance_id`, `image` — **snake_case**. Field names inside the template context (`.context.instance_id`, `.values.image`). Snake because the IR Graph and template context follow JSON-API conventions and align with Go's JSON struct tag generation.

The three casings are not interchangeable. A Recipe author who writes `{{ .context.instanceId }}` (camelCase) halts the build: `.context` declares its keys, and `instanceId` is not one of them, so the reference is refused before anything renders and the diagnostic lists the keys `.context` does define — see [`errors/fatal-halts.md`](errors/fatal-halts.md) "Template references a root the render context does not define". A developer who writes `web.server` (with a dot) hits the instance-name pattern rejection because the dot is reserved as the path separator. The discipline target: hold the three conventions in mind when reading or authoring; rely on the boundaries (where you are in the YAML or template) to know which casing applies.

## Platform-Defined Identifiers

Everything above governs names on the authoring surface — an instance name you choose, a schema field the language defines for you to fill, a template-context key you read. Two further registers govern the identifiers **the platform itself defines** and you only read back or type. They are separate because they do different jobs, and the job decides the shape.

**The descriptive register: kebab-case, uniformly.** An identifier here says in words what it names, so you can read it and act on it without looking anything up. A CLI flag, a publishing-lint rule id, a diagnostic class code, and the code a halting condition is registered under all belong to it.

```text
--no-unsupported-field-warnings   # a CLI flag you type
category-matches-directory        # a lint rule id, printed in `aggrega lint` output
unsupported-field                 # a diagnostic class code
artifact-provenance-skipped       # another
parameter-contract-violation      # the code a halting condition is registered under
```

Where a diagnostic class has a suppression flag, the code and the flag are the same words in the same order — `unsupported-field` is silenced by `--no-unsupported-field-warnings` — so the class you matched on tells you the flag to reach for, with nothing to translate. A class code is the stable name tooling matches to recognise a finding without parsing its message text; the message wording may improve, the code does not move.

**The short-code register: the letter `E` and four digits.** A halting condition also carries a short code — `E0007` — and it is the one platform-defined identifier that is not kebab-case. The reason is position: it opens every halting diagnostic, beside the category, ahead of the file and line you are about to read.

```text
[DEVELOPER_ERROR E0007] aggregate.yaml at .spec.components.edge
```

A descriptive code cannot go there. The longest of them would fill a narrow terminal on its own, before the location that tells you where to look. So the head takes an identifier chosen for width, and the trade is deliberate: four digits say nothing about a condition, which is why every short code is published beside the condition it names and the text that condition renders in [the error-sentinels reference](errors/sentinels.md). Quote a short code in a report, type it into a search, and resolve it there.

Both registers name the same conditions from two directions, and neither replaces the other. Match the descriptive code when you are writing a tool that keys on a condition; quote the short code when you are talking to a person about one.

**Kebab-case appearing here and in instance names is not a collision.** The instance-name pattern is about what you are *permitted* to write — kebab-case and snake_case are both valid there, and teams pick one. This register is about what the platform *does* write, where there is nothing to pick: you never choose the spelling of a lint rule id, and the platform never chooses the spelling of your component name.

**It leaves the field casings unchanged.** Authored schema fields stay camelCase and template-context keys stay snake_case. None of the identifiers in this register is a field on either surface — they are short, stable names for a flag, a rule, or a class of finding — so a diagnostic code being kebab-case says nothing about how a schema field is spelled.

## Document-path naming-suffix discipline

A subset of fields across the language carry document-path values — strings that point at a position inside another document (a rendered Workload's volumes section, a Component's featuresSchema entry, a Manifest's mappings tier). The values follow [RFC 6901 JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) syntax — slash-separated tokens identifying the path through the target document.

**RFC 6901 is the path-grammar baseline for every document-path surface in Aggrega.** The Wasm plugin contract consumes RFC 6902 JSON Patch documents whose paths are RFC 6901 pointers (per [`plugins/plugin-contract.md`](plugins/plugin-contract.md) `label-transform` role JSONPatch output); the URI grammar's format-string inventory names RFC 6901 alongside Go template syntax and Sprig helpers (per [`vocabulary/uri-grammar.md`](vocabulary/uri-grammar.md) "Format-string inventory"); the per-Recipe `.locals` exports use RFC 6901 to point at synthesized-Workload positions Wasm Injector plugins receive in the plugin pipeline through their step's `with` payload. One grammar, multiple consuming surfaces.

**The naming-suffix discipline** distinguishes the two authoring sides of these path values via a deliberate suffix split aligned with the broader Field Casing section above:

* **Schema fields** carrying RFC 6901 JSON Pointers use **camelCase `*Path`** suffix. The fields are part of the developer-facing YAML schema, so they follow the camelCase convention. No entity schema declares such a field today; the document paths an author writes are the `.locals` export keys below.
* **`.locals` export keys** carrying RFC 6901 JSON Pointers use **snake_case `*_path`** suffix. The keys are part of the Recipe's internal export surface — read by the Recipe's own subsequent templates, and by a Wasm plugin pipeline through the `pipeline[].with` payload that references `.locals` — so they follow the snake_case convention. Examples:
  * `volumes_path` — `.locals.volumes_path: "/spec/template/spec/volumes"` exposing the synthesized Workload's volumes-array position.
  * `containers_path` — `.locals.containers_path: "/spec/template/spec/containers"` exposing the containers-array position.
  * `resource_path` — `.locals.resource_path: "/resource/aws_s3_bucket/main"` exposing a Terraform-native resource path.
  * `root_path` — `.locals.root_path: "/data"` exposing the root path the renderer's pipe consumes.

The two suffix conventions reflect the Field Casing section's two-tier convention: schema-defined fields use camelCase; user-authored or Recipe-private identifiers use snake_case (or kebab-case). The `*Path` / `*_path` suffix discipline makes the path-grammar nature of the value visible at the identifier level — readers seeing either suffix know the value follows RFC 6901 syntax without having to inspect the value itself.

**Worked example: a Wasm Injector consuming a Recipe's `*_path` exports.**

```yaml
# Recipe (Domain 3) — declares .locals exports the Wasm Injector consumes
spec:
  locals:
    primary_compute: "worker-container"
    containers_path: "/spec/template/spec/containers"
    volumes_path: "/spec/template/spec/volumes"
```

```yaml
# Credential FeatureRecipe (Domain 3) — attached to the component the Recipe
# above realizes. Its templates read `.locals`: an attachment sees the host
# Recipe's resolved locals merged with the attachment's own block.
spec:
  pipeline:
    - id: workload_injector
      plugin: pipeline-step/k8s-workload-injector:2.0.0
      function: inject_secret
      with: |
        target_container: "{{ .locals.primary_compute }}"
        containers_path: "{{ .locals.containers_path }}"
        volumes_path: "{{ .locals.volumes_path }}"
```

The `*_path` keys are Recipe-private exports; the `containers_path` / `volumes_path` values are RFC 6901 JSON Pointer strings. The Injector plugin consumes the strings to position its JSONPatch output against the rendered Workload's AST. The attachment reaches them on its own `.locals` pillar — there is no `.context.uses[].locals` field, so a consumer cannot read its target's locals across a `uses` edge; what crosses an edge is the target's `provides`.

For the broader format-string inventory (Go template syntax, Sprig functions, JSON Pointer alongside SemVer regex and label selector grammar), see [`vocabulary/uri-grammar.md`](vocabulary/uri-grammar.md) "Format-string inventory". For the Wasm plugin contract surface that consumes RFC 6902 patches addressed by RFC 6901 pointers, see [`plugins/plugin-contract.md`](plugins/plugin-contract.md).

## Comment Syntax

Comment characters depend on the surrounding language:

* **YAML context** (the default authoring surface for every Aggrega entity): use `#`
* **Go template context** (inside Recipe `valuesMapping:` block scalars, FeatureRecipe `injectMapping:` block scalars, SchemaLibrary `$templates:` bodies, MappingLibrary mapping entries, assertion-block `assertions:` bodies): use `{{/* ... */}}` for template comments that the template engine recognises and strips at render time, or `#` for YAML-level comments outside the template body.

Compact-form schemas under `schema:`, `usesSchema:`, `featuresSchema:`, and `parameters:` are YAML throughout; the per-field `description:` annotation is the documented surface for inline field documentation (`port: { type: integer, description: "TCP listen port" }`).
