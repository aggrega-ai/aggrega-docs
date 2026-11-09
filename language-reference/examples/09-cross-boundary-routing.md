# Cross-Boundary Routing

When components deployed in different Release boundaries need to communicate, the target's `provides.host` is a string the compiler cannot introspect — it cannot decide on its own whether that string is valid across boundaries. Cross-boundary routing handles this through a Feature-and-FeatureRecipe pattern: a Feature attached to the caller declares which injected variable needs rewriting; its FeatureRecipe declares how to rewrite it per provider.

*The standard library ships the routing Feature `core/k8s-dns-resolver` and its FeatureRecipe `helm/k8s-dns-resolver`; the [cross-boundary networking example](cross-boundary-networking/README.md) builds it on Kubernetes, beside its Docker Compose counterpart.*

The architectural primitives that compose into cross-boundary routing solutions are documented in their own homes:

* The `injectMapping` mechanism for caller-side variable rewriting: [entities/featurerecipe.md](../entities/featurerecipe.md)
* Release boundary annotations that Features consume to build FQDNs and routing metadata: [entities/release.md](../entities/release.md)
* The `provides` / `inject` / `uses` contract: [vocabulary/topology-triad.md](../vocabulary/topology-triad.md)

## Example 25: Pre-Render Injection Interception (`injectMapping`)

When a component is deployed to a different Kubernetes namespace than its target, the local service name must be rewritten to an FQDN. The `injectMapping` block on a FeatureRecipe natively intercepts the `.context.inject` memory pipe *before* the Base Recipe renders — no WebAssembly needed.

**1. Platform Catalog: The Routing Feature**
This is purely an Ops concern — no `values`, only `infra`.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/k8s-dns-resolver
  version: 1.0.0
spec:
  schema:
    infra:
      target_var:            { type: string, required: true }
      namespace_annotation:  { type: string }
      cluster_domain:        { type: string }
```

**2. Ops Domain: The FeatureRecipe**
The `injectMapping` template executes at inject mapping, the pre-render interception stage. It reads the base host from the already pre-hydrated inject pipe, dynamically locates the specific topological edge that owns the variable, resolves the namespace from the target's Release annotations, and emits a precise override dictionary.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: FeatureRecipe
metadata:
  name: k8s-dns-rewriter
  version: 1.0.0
spec:
  capability: helm
  implements: core/k8s-dns-resolver:1.0.0

  # Native Deep-Merge: Evaluates first, permanently rewrites .context.inject.env
  injectMapping: |
    # 1. Grab the atomic base host from the pre-hydrated pipe
    {{ $base_host := index .context.inject.env .infra.target_var }}

    # 2. Dynamically locate the edge that injected this variable
    {{ $target_edge := dict }}
    {{ range $alias, $edge := .context.uses }}
      {{ if hasKey $edge.inject.env $.infra.target_var }}
        {{ $target_edge = $edge }}
      {{ end }}
    {{ end }}

    # 3. Resolve the Namespace from the target's Release annotations
    {{ $ns := "" }}
    {{ if and .infra.namespace_annotation $target_edge }}
      {{ $ns = optional $target_edge.annotations.release .infra.namespace_annotation "" }}
    {{ end }}

    # 4. Formulate the FQDN
    {{ $resolved_host := $base_host }}
    {{ if $ns }}
      {{ if .infra.cluster_domain }}
        {{ $resolved_host = printf "%s.%s.%s" $base_host $ns .infra.cluster_domain }}
      {{ else }}
        {{ $resolved_host = printf "%s.%s.svc" $base_host $ns }}
      {{ end }}
    {{ end }}

    # 5. Emit the override dictionary
    env:
      {{ .infra.target_var | toJson }}: {{ $resolved_host | toJson }}
```

**3. Routing Domain: The Release (Ops Attaches the Feature)**
Ops attaches the routing feature via the Release — the developer's Aggregate is never modified. The `namespace_annotation` key instructs the feature where to look up the target boundary's namespace.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: cross-ns-release
  version: 1.0.0
  environment: production
spec:
  aggregate: web-app                        # Uses Aggregate from Example 2
  manifest: cross-ns-manifest
  boundaries:
    prod-cluster:
      directory: "deploy/prod"
      boundaries:
        frontend-ns:
          annotations:
            aggrega.ai/namespace: "frontend-zone"
          components:
            web-server:
              features:
                cross-ns-routing:
                  type: core/k8s-dns-resolver:1.0.0
                  infra:
                    target_var: "DB_HOST"
                    namespace_annotation: "aggrega.ai/namespace"
        backend-ns:
          annotations:
            aggrega.ai/namespace: "backend-zone"
          components:
            app-db: {}
```

**Compilation Trace:**

1. **Provides evaluation:** `app-db`'s Recipe `provides` evaluates to `{ host: "app-db", port: "5432" }`.
2. **Inject hydration:** `web-server`'s inject pipe is pre-hydrated: `DB_HOST: "app-db"`.
3. **Inject mapping:** The `k8s-dns-rewriter` `injectMapping` executes on `web-server`. It reads `DB_HOST` → `"app-db"`, finds the edge to `app-db`, resolves its Release annotation `aggrega.ai/namespace` → `"backend-zone"`, and emits `DB_HOST: "app-db.backend-zone.svc"`.
4. **Base rendering:** The web server's `valuesMapping` renders with the FQDN already in `.context.inject.env`.

---

## Example 26: The Complete Wasm Handshake (Step Input and Patch)

This traces the payload the compiler sends to a WebAssembly plugin and the patch it receives back. Both travel in the canonical binary encoding; the JSON in steps 3 and 4 shows what they carry.

The worker is an example Component, `example/compute/data-worker`, whose `db_credentials` slot takes a file delivery:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: example/compute/data-worker
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "worker"
spec:
  featuresSchema:
    db_credentials:
      inject: [file]                        # White-Box: the developer may mount it as a file.
      description: Database credential.
  schema:
    values:
      image: { type: string, required: true }
```

**1. Dev Domain: The Aggregate**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: secret-file-mount
  version: 1.0.0
spec:
  components:
    data-worker:
      type: example/compute/data-worker:1.0.0
      values:
        image: "corp/finance-worker:v2"
      features:
        db_credentials:
          type: core/aws-secrets-manager:1.0.0   # Uses credential Feature from Example 11
          values:
            path: "arn:aws:secretsmanager:us-east-1:123456:secret:prod/db"
            key: "password"
          inject:
            file:
              - in: "/etc/secrets/db.json"
                from: "password"
```

The credential's FeatureRecipe is Example 11's, which publishes no `password` key: it consumes the directive itself, reading `.inject` in its pipeline and handing `file_injections` to the Injector below. That is why the build accepts this `from:` key — a key the FeatureRecipe neither published nor read at `.inject` would halt the build, since nothing would deliver it.

**2. Ops Domain: The Base Recipe**
Exports physical pointers for downstream plugins.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: python-worker-helm
  version: 1.0.0
spec:
  capability: helm
  implements: example/compute/data-worker:1.0.0
  source: "./charts/worker"
  locals:
    primary_compute: "worker-container"
  valuesMapping: |
    image: "{{ .values.image }}"
```

**3. The Wasm Input (Compiler → Plugin)**
During the plugin pipeline, the compiler feeds the Injector plugin its step input, with the `with:` template already evaluated. The JSON below illustrates the payload's content; the wire carries it in the canonical binary encoding, and the exact contract is the step-input shape documented in the [Wasm plugin contract](../plugins/plugin-contract.md). The plugin pipeline runs during `aggrega build`; see [Status of the Language](../10-status.md#compilation-pipeline-phases).

```json
{
  "execution_context": {
    "instance_id": "data-worker",
    "function": "inject_secret",
    "with": {
      "k8s_secret_name": "data-worker-db-credentials",
      "target_container": "worker-container",
      "env_injections": "",
      "file_injections": { "/etc/secrets/db.json": "password" }
    }
  },
  "base_objects": [
    {
      "apiVersion": "apps/v1",
      "kind": "Deployment",
      "metadata": { "name": "data-worker" },
      "spec": {
        "template": {
          "spec": {
            "containers": [
              { "name": "worker-container", "volumeMounts": [] }
            ],
            "volumes": []
          }
        }
      }
    }
  ]
}
```

**4. The Wasm Output (Plugin → Compiler)**
The plugin returns its patch appending the Volume and VolumeMount that `file_injections` asks for: the secret's `password` key mounted at `/etc/secrets/db.json` in `worker-container`. The JSON below illustrates the intent; the shipped return is RFC 6902 patches against the keyed document set, carried in the same canonical binary encoding, per the [Wasm plugin contract](../plugins/plugin-contract.md).

```json
{
  "patch": {
    "spec": {
      "template": {
        "spec": {
          "volumes": [
            {
              "name": "vault-vol-db",
              "secret": { "secretName": "data-worker-db-credentials" }
            }
          ],
          "containers": [
            {
              "name": "worker-container",
              "volumeMounts": [
                {
                  "name": "vault-vol-db",
                  "mountPath": "/etc/secrets/db.json",
                  "subPath": "password",
                  "readOnly": true
                }
              ]
            }
          ]
        }
      }
    }
  }
}
```

The compiler applies the patches to the base Deployment, producing the final rendered artifact.
