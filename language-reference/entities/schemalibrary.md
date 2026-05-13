# SchemaLibrary

A SchemaLibrary is a catalog entity that holds reusable JSON Schema 2020-12 definitions plus optional parameterized helpers. Components and Features that share schema shapes — URLs, durations, common probe structures, recurring resource limits — declare those shapes once in a library and reference them via canonical `$ref` URIs. The library entity is Tier 3: opt-in for catalogs that need cross-Component schema reuse. Catalogs without repeated schema content ship without any SchemaLibrary.

## The SchemaLibrary's Role

Platform architects author SchemaLibraries to centralize schema shapes that recur across the catalog. A library is not a deployable building block; it is a definitions namespace. Component / Feature authors reference library entries by their canonical `$ref` URI, typed once and validated everywhere the reference resolves.

The split between "library" and "consumer" is intentional. Components encode deployable shape (containers, services, probes, secrets). Features encode behavioral attachments. SchemaLibraries encode only schema content — the structural rules a value must satisfy. Keeping the three roles distinct lets each entity kind evolve at its own cadence; authors who don't need shared schema definitions never encounter the library entity.

## Entity Envelope

A SchemaLibrary entity carries the standard catalog envelope. `apiVersion: aggrega.ai/v1alpha1` and `kind: SchemaLibrary` mark the entity kind; `metadata.name` is a PascalCase identifier; `metadata.version` follows strict semantic versioning. The library's content sits under `spec`: `spec.schemas` is required (the library must declare at least one entry), and `spec.templates` is optional (present only when the library uses parameterized helpers).

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: SchemaLibrary
metadata:
  name: WebPrimitives
  version: 1.0.0
spec:
  schemas:
    URL:
      type: string
      pattern: "^https?://"
    HTTPMethod:
      type: string
      enum: [GET, POST, PUT, PATCH, DELETE]
```

## Authoring Schema Entries

Schema entries are authored in one of three forms. Compact form is the default surface for short, common shapes — `type`, `pattern`, `enum`, `min`, `max`, and similar one-line constraints. JSON Schema 2020-12 YAML is the co-equal authoring option for entries that need the full JSON Schema surface (composition keywords, conditional shape, complex `$defs`). Mixing the two within a single entry is supported via the compact-form compiler's per-node content-shape dispatch; the `$jsonschema:` escape hatch embeds full JSON Schema content at any node when the compact form cannot express the intent.

## Templates and `$instantiate:`

Libraries with substantial repeated structure declare parameterized helpers under `spec.templates`. A template carries a `$params:` map (named typed parameter declarations) plus a body (compact form or JSON Schema content referencing the parameters as `$<paramName>` scalar tokens). Schema entries instantiate templates via `$instantiate:` + `$args:` bindings; the substitution engine replaces parameter placeholders with literal scalar values and produces the resolved entry's body.

```yaml
spec:
  schemas:
    LivenessProbe:
      $instantiate: ProbeTemplate
      $args:
        port: 8080
        path: /healthz
    ReadinessProbe:
      $instantiate: ProbeTemplate
      $args:
        port: 8081
        path: /ready
  templates:
    ProbeTemplate:
      $params:
        port:
          type: integer
        path:
          type: string
      type: object
      properties:
        port:
          type: integer
          const: $port
        path:
          type: string
          const: $path
```

Substitution is literal-scalar only. The substitution engine does not interpret Go template syntax, evaluate conditionals, or run loops. Authors needing more expressive helpers compose Components or Features that consume the library entries with their own variation.

## Naming Conventions

Library names, schema entry keys, and template names follow PascalCase. The entity envelope's JSON Schema enforces the convention at three positions via pattern constraints:

- `metadata.name` matches `^[A-Z][A-Za-z0-9]*$`.
- `spec.schemas` map keys match the same pattern via `propertyNames`.
- `spec.templates` map keys match the same pattern via `propertyNames`.

A SchemaLibrary with a non-PascalCase key in `spec.schemas` or `spec.templates` fails envelope validation at workspace load. The envelope-level enforcement is load-bearing: schema entry keys appear in canonical `$id` URIs (`#/schemas/<name>`); template names reference into canonical URIs at instantiation time. Catching non-PascalCase keys at load prevents them from propagating through the catalog ecosystem.

Parameter names inside a template's `$params:` map are template-local — they do not appear in canonical `$id` URIs and are not pattern-constrained at the envelope level. Authors follow whatever naming convention fits the template's parameters; `port`, `path`, `intervalSec`, and similar lowercase parameter names are typical.

The naming uniformity at library, schema, and template levels makes canonical `$ref` URIs scan cleanly: `oci://hub.aggrega.ai/WebPrimitives@1.0.0#/schemas/URL` reads at a glance.

## Canonical `$id` and Lockfile Integration

Each schema entry's canonical `$id` derives as `oci://<host>/<library>@<version>#/schemas/<name>`. The host comes from the workspace's lockfile entry for the library; the version comes from the lockfile-pinned version; the schema entry's name is the entry's map key. Local-development workspaces (where the library is unpacked under the catalog tree rather than installed from a remote registry) use the placeholder host `local.aggrega`; the publishing pipeline substitutes the placeholder with the canonical hub host at publish time.

Component / Feature authors reference library entries by writing the canonical `$id` as a `$ref` value:

```yaml
# Inside a Component schema:
spec:
  schema:
    healthCheck:
      $ref: "oci://hub.aggrega.ai/WebPrimitives@1.0.0#/schemas/URL"
```

## Forbidden JSON Schema Keywords

The `$dynamicAnchor` and `$dynamicRef` JSON Schema 2020-12 keywords are forbidden by default in SchemaLibrary entries. The SchemaLibrary parser scans both schema entries and template bodies at workspace-load time; the publishing-linter applies a redundant guard at publish time; the instantiation engine re-scans the resolved body after parameter substitution, so a template that smuggles forbidden keywords via parameter values still fails. The three scans together close the static-introduction route (literal `$dynamicAnchor` in a schema entry or template body), the parametric-introduction route (a `$args:` value containing `$dynamicRef`), and the bypass-via-out-of-band-tooling route (publish-time guard catches anything that skipped the parser).

When the rejection fires, the error cites the offending keyword and the file path. Authors see the error at-author-time rather than at first instantiation; template bodies are not exempted from the load-time scan.

Dynamic-reference semantics couple to runtime evaluation in ways that break the compiler's compile-time determinism contract. Authors who genuinely need dynamic-reference behavior either restructure the schema to use static `$ref` resolution or seek architect review for an opt-out specific to their case.

## Tier Placement

SchemaLibrary is Tier 3 in the entity-tier documentation model — opt-in for catalogs that need cross-Component schema reuse. Catalogs without repeated schema content ship without any SchemaLibrary entity; the tier marking signals "advanced; skip if not needed" for documentation navigation, not capability. The compiler treats SchemaLibrary uniformly with the other catalog entity kinds: same envelope validation at workspace load, same JSON Schema 2020-12 pipeline for per-entry content, same OCI publishing pipeline at release time.

Within Tier 3, the `$templates:` parametric-helpers mechanic is itself opt-in. Libraries with substantial repeated structure (a Probe template parameterized over port + path; a CORS template parameterized over allowed-origins; a TLS template parameterized over cert + key paths) benefit from `$templates:` reuse; libraries with diverse one-off entries skip the templates block entirely and author each entry inline under `spec.schemas`.
