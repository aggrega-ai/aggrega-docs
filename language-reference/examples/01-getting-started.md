# Hello World

## Example 1: Hello World — A Single Component

The absolute minimum to compile. A developer requests a web server. Ops provides the implementation. The compiler generates the physical artifacts.

**1. Platform Catalog: The Component Interface**
The Architect defines what a web server *is* — its ontology type and the shape of its configuration.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: core/web-server
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server"
spec:
  schema:
    values:
      image: { type: string, required: true }
    infra:
      port: { type: integer, default: 8080 }
```

**2. Dev Domain: The Aggregate**
The Developer writes pure intent. No ports, no namespaces, no cloud provider.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: hello-world
  version: 1.0.0
spec:
  components:
    my-site:
      type: core/web-server:1.0.0
      description: "The corporate landing page."
      values:
        image: "myregistry/landing-page:v1"
```

**3. Ops Domain: The Recipe**
Ops maps the abstract Component to a real Helm chart. The `locals` block exports private physical state for downstream plugins. The `valuesMapping` template wires `.values` into the chart's expected format.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: web-server-helm
  version: 1.0.0
spec:
  capability: helm
  implements: core/web-server:1.0.0
  source: "./charts/web-server"
  locals:
    primary_compute: "web-container"
  valuesMapping: |
    image: "{{ .values.image }}"
    containerPort: {{ .infra.port }}
```

**4. Routing Domain: The Manifest (Dependency Lockfile)**
The Manifest maps abstract component types to concrete Recipe URIs. Every instance of `core/web-server` resolves to the named Recipe; the Recipe URI's path segment carries the provider.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: hello-world-manifest
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        core/web-server: helm/web-server-helm:1.0.0
```

**5. Routing Domain: The Release (Deployment Router)**
The Release binds the Aggregate to the Manifest and routes Components into physical boundaries. This is the single entry point for the compiler: `aggrega build --release release.yaml`.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: hello-world-release
  version: 1.0.0
  environment: production
spec:
  aggregate: hello-world
  manifest: hello-world-manifest
  boundaries:
    default-cluster:
      directory: "deploy/k8s"
      components:
        my-site: {}
```

**Compilation:** `aggrega build --release release.yaml` → The compiler resolves `my-site` (type `core/web-server:1.0.0`) → looks up `core/web-server` in the Manifest's `components.type` map → finds `helm/web-server-helm:1.0.0` → loads the Recipe (its `spec.capability: helm` names the provider to dispatch to) → renders the chart into `dist/deploy/k8s/helm/`.

---

## Example 2: Connecting Components — The Injection Contract

A web application connects to a Postgres database. The developer declares *what* they need and *how* their code reads connection data. The compiler pipes the address the database's Recipe publishes into the web application's environment.

**1. Platform Catalog: The Postgres Component**
The Architect defines the database interface. The `provides` block in the schema declares the Public API keys downstream callers can request. The `usesSchema` is absent because databases don't initiate connections.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: core/postgres
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "stateful-server"
spec:
  schema:
    values:
      db_name: { type: string, default: "appdb" }
    provides:
      host: { type: string }
      port: { type: string }
```

**2. Platform Catalog: The Web Server (Extended)**
The web server now declares a `usesSchema` — a topology socket allowing it to connect to databases. The `selector` enforces Cross-Node Type Safety: the developer cannot accidentally plug a messaging queue into the `databases` socket.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: core/web-server
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server"
spec:
  usesSchema:
    databases:
      selector: "component.aggrega.ai/type=stateful-server"
      inject: ["env"]
  schema:
    values:
      image: { type: string, required: true }
```

**3. Dev Domain: The Aggregate**
The developer declares two components and an explicit topological edge. Each `inject` mechanism is a list of entries: `in:` names the local environment variable, and `from:` names the target's `provides` key it receives.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: web-app
  version: 1.0.0
spec:
  components:
    app-db:
      type: core/postgres:1.0.0
      values:
        db_name: "customers"

    web-server:
      type: core/web-server:1.0.0
      values:
        image: "myregistry/web-app:v2"
      uses:
        databases:
          primary:
            target: app-db
            inject:
              env:
                - in: DB_HOST       # inject env var DB_HOST from provides key "host"
                  from: "host"
                - in: DB_PORT       # inject env var DB_PORT from provides key "port"
                  from: "port"
```

> **The same entries in YAML flow style.** Each delivery mechanism is a list of entries, so the block style above and the flow style below are the same document:
>
> ```yaml
> inject:
>   env:
>     - { in: "DB_HOST", from: "host" }
>     - { in: "DB_PORT", from: "port" }
> ```

**4. Ops Domain: The Postgres Recipe**
Ops hardcodes the physical port and exports it via `provides`. The `provides` block is the Public API — it can only reference self-contained data (`.context.instance_id`, `.values`, `.infra`, the Recipe's own `.locals`, and static strings — and, in a Recipe naming a chart in `source:`, `.context.rendered_name`). This invariant enables cyclic dependency safety. The host is built from `.context.rendered_name`, the name the helm provider gives the chart, and the chart's `fullnameOverride` is pinned to the same key, so the address `provides` publishes is the Service the chart emits — see [Naming a Rendered Resource](../templates/rendered-resource-names.md).

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: postgres-chart
  version: 1.0.0
spec:
  capability: helm
  implements: core/postgres:1.0.0
  source:
    # A chart repository root paired with the chart's name.
    kind: helm-https-chart
    url: https://charts.example.com
    chart: postgresql
    version: 12.1.0
  locals:
    primary_compute: "postgresql"
  provides:
    host: "{{ .context.rendered_name }}"
    port: "5432"
  valuesMapping: |
    fullnameOverride: "{{ .context.rendered_name }}"
    primary:
      initdb:
        scripts:
          create_db.sql: "CREATE DATABASE {{ .values.db_name }};"
```

**5. Ops Domain: The Web Server Recipe**
The web server's Recipe consumes the pre-hydrated `.context.inject.env` pipe. By the time this template renders, the compiler has already filled it: `DB_HOST` → `"app-db"` and `DB_PORT` → `"5432"`.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: web-server-helm
  version: 1.0.0
spec:
  capability: helm
  implements: core/web-server:1.0.0
  source: "./charts/web-server"
  locals:
    primary_compute: "web-container"
  valuesMapping: |
    image: "{{ .values.image }}"
    env:
      {{- range $key, $value := .context.inject.env }}
      - name: {{ $key }}
        value: "{{ $value }}"
      {{- end }}
```

**6. Routing Domain: Manifest & Release**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: web-app-manifest
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        "core/web-server": "web-server-helm:1.0.0"
        "core/postgres": "postgres-chart:1.0.0"
---
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: web-app-release
  version: 1.0.0
  environment: production
spec:
  aggregate: web-app
  manifest: web-app-manifest
  boundaries:
    default-cluster:
      directory: "deploy/k8s"
      components:
        app-db: {}
        web-server: {}
```

**Compilation Trace (rendering):**

1. **Provides evaluation:** The compiler evaluates `app-db`'s Recipe `provides` → `{ host: "app-db", port: "5432" }`.
2. **Inject hydration:** The compiler maps `web-server`'s inject contract: `DB_HOST` → target `app-db`'s `provides["host"]` → `"app-db"`. `DB_PORT` → `provides["port"]` → `"5432"`. The `.context.inject.env` pipe is now `{ "DB_HOST": "app-db", "DB_PORT": "5432" }`.
3. **Base rendering:** The web server's `valuesMapping` template iterates over the pre-hydrated pipe, generating the Helm values.

---

## Example 3: Parameters — One Blueprint, Many Environments

A single Aggregate serves dev and production by hoisting environment-specific values into `parameters`. The Release fulfills the contract.

**1. Dev Domain: The Aggregate**
The developer uses `parameters` to declare an environment contract. Each parameter slot is typed; the compiler validates each Release-supplied value against the typed contract, then Go template interpolation (`{{ .parameters.X }}`) executes *before* the surrounding `values:` schema validation.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: configurable-app
  version: 1.0.0
spec:
  parameters:
    app_image:
      type: string
      required: true
    db_name:
      type: string
      required: true

  components:
    app-db:
      type: core/postgres:1.0.0            # Uses Component from Example 2
      values:
        db_name: "{{ .parameters.db_name }}"

    web-server:
      type: core/web-server:1.0.0          # Uses Component from Example 2
      values:
        image: "{{ .parameters.app_image }}"
      uses:
        databases:
          primary:
            target: app-db
            inject:
              env:
                - in: DB_HOST
                  from: "host"
                - in: DB_PORT
                  from: "port"
```

**2. Routing Domain: Two Releases (Dev & Prod)**
Each environment fulfills the parameter contract with its own values. The Aggregate is never modified.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: dev-release
  version: 1.0.0
  environment: development
spec:
  aggregate: configurable-app
  manifest: web-app-manifest              # Uses Manifest from Example 2
  parameters:
    app_image: "myregistry/web-app:dev"
    db_name: "dev_customers"
  boundaries:
    dev-cluster:
      directory: "deploy/dev"
      components:
        app-db: {}
        web-server: {}
---
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: prod-release
  version: 1.0.0
  environment: production
spec:
  aggregate: configurable-app
  manifest: web-app-manifest
  parameters:
    app_image: "myregistry/web-app:v3.1.0"
    db_name: "prod_customers"
  boundaries:
    prod-cluster:
      directory: "deploy/prod"
      components:
        app-db: {}
        web-server: {}
```

> **External parameters file (GitOps pattern):** For CI/CD-driven workflows that keep parameter values in a separate file, the Release uses the `$import:` form: `parameters: { $import: ./env/prod-values.yaml }`. The compiler loads the file's content and replaces the inline `parameters:` map. Multi-file layering (combining a base file with per-environment overrides) is expressed via Release `extends:` chains.
