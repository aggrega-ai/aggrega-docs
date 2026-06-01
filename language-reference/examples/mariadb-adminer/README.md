# MariaDB + Adminer — a runnable dual-target example

This example compiles a small, real stack — a **MariaDB** database with an
**Adminer** web UI in front of it — from a single Developer-authored
`Aggregate` to **two deployment targets**:

- **Docker Compose** for local development, and
- **Kubernetes** manifests for a local cluster (kind / minikube / k3d).

The same Aggregate drives both. Only the *Recipe layer* loaded at build time
changes. Every file here compiles with the shipped `aggrega` CLI, and the
rendered output runs: bring the stack up, open Adminer in a browser, and log
in to the live database.

## What it demonstrates

- **One authoring surface, many targets.** A single `aggregate.yaml` is the
  source of truth for *what* the stack is. Each target is a thin catalog
  layer that says *how* to realise it.
- **The String Pipe.** Adminer declares a `databases` use of MariaDB; the
  database Recipe's `provides.host` is piped into Adminer's
  `ADMINER_DEFAULT_SERVER` environment variable. The compiler routes the
  string without interpreting it — so the compose build wires a compose
  service name and the Kubernetes build wires a Service DNS name, from the
  same edge.
- **Workload synthesis.** The compose and self-contained Kubernetes Recipes
  declare a provider-agnostic `Workload`; the provider engine synthesises a
  `docker-compose.yaml` service or a `Deployment` + `Service` + `PersistentVolumeClaim`.
- **Features and FeatureRecipes.** Database credentials are attached as a
  small `Feature` whose per-provider `FeatureRecipe` injects the value into
  the database container's environment.
- **Provider selection by component type.** The Recipe that renders each
  component is chosen by the component *type* it implements, drawn from
  whichever catalog layer the build loads.

## Layout

```text
mariadb-adminer/
├── aggregate.yaml              # Developer intent — shared by every target
│
├── manifest-compose.yaml       # Ops mapping, Docker Compose target
├── release-compose.yaml        # Operator release, Docker Compose target
├── catalog-compose/            # Recipe layer: compose
│
├── manifest-helm-synth.yaml    # Ops mapping, self-contained Kubernetes target
├── release-helm-synth.yaml     # Operator release, self-contained Kubernetes target
├── catalog-helm-synth/         # Recipe layer: helm (Workload synthesis)
│
├── manifest-helm-bitnami.yaml  # Ops mapping, managed-chart Kubernetes target
├── release-helm-bitnami.yaml   # Operator release, managed-chart Kubernetes target
└── catalog-helm-bitnami/       # Recipe layer: helm (upstream Bitnami chart)
```

Each `catalog-*` directory is a self-contained catalog: the shared Component,
Feature, and Provider definitions plus the Recipes for that one target. A
build loads exactly one layer, so each component type resolves to exactly one
Recipe.

The Release, its `aggregate:`, and its `manifest:` are siblings in this
directory; the `--catalog` directory is separate.

## The shared Aggregate

```yaml
spec:
  components:
    db:
      type: core/database/mariadb
      values:
        database: appdb
        user: appuser
        charset: utf8mb4
        collation: utf8mb4_general_ci
      features:
        root-password:
          type: app/literal-credential
          values: { var: MARIADB_ROOT_PASSWORD, value: dev-root-pw-change-me }
        app-password:
          type: app/literal-credential
          values: { var: MARIADB_PASSWORD, value: dev-app-pw-change-me }

    web:
      type: app/adminer
      values:
        design: pepa-linha-dark
      uses:
        databases:
          db:
            target: db
            inject:
              env:
                - in: ADMINER_DEFAULT_SERVER
                  from: host
```

`web` declares a `databases` use of `db`. The `inject` block binds the
database Recipe's `provides.host` to the `ADMINER_DEFAULT_SERVER` environment
variable on the Adminer container. Nothing in the Aggregate names a provider;
that choice lives entirely in the catalog layer the build loads.

### A note on credentials

The MariaDB image needs a root password to start, and an application user
needs its own. This example injects those values with a small
`app/literal-credential` Feature so the stack runs from a single command —
suitable for local development and demos.

For shared or production environments, credentials belong in a secret store
rather than inline literals. The `core/database/mariadb` Component declares a
`secretsSchema` for exactly this: a `root_password` slot the database Recipe
consumes internally, and a transparent `user_password` slot. The production
path provisions those slots through a credential FeatureRecipe (a Kubernetes
`Secret`, an external secret-store reference, and so on) instead of the
literal-value Feature used here.

---

## Target 1 — Docker Compose

Build:

```bash
aggrega build --release release-compose.yaml --catalog catalog-compose
```

Output: `dist/app/compose/docker-compose.yaml` — two services on one network.
`db` runs `mariadb:11.4` with the database, user, charset, and injected
passwords; `web` runs `adminer:4`, publishes port `8080`, depends on `db`, and
carries `ADMINER_DEFAULT_SERVER: db` (the compose service name the database
Recipe emitted).

Run it:

```bash
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:8080> and log in:

| Field    | Value                   |
| -------- | ----------------------- |
| System   | MySQL / MariaDB         |
| Server   | `db` (already filled in)|
| Username | `appuser`               |
| Password | `dev-app-pw-change-me`  |
| Database | `appdb`                 |

(or `root` / `dev-root-pw-change-me`). Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down -v`.

---

## Target 2 — Kubernetes (self-contained)

This target renders plain Kubernetes manifests directly from the `Workload`,
with no external chart — a single offline build.

```bash
aggrega build --release release-helm-synth.yaml --catalog catalog-helm-synth
```

Output under `dist/app/helm/`:

```text
db-deployment.yaml        # mariadb:11.4, env + volume mount
db-data-pvc.yaml          # PersistentVolumeClaim for /var/lib/mysql
db-default-service.yaml   # ClusterIP Service "db-default" on 3306
web-deployment.yaml       # adminer:4, ADMINER_DEFAULT_SERVER: db-default
web-default-service.yaml  # NodePort Service "web-default" on 8080
```

Note `ADMINER_DEFAULT_SERVER: db-default` — for Kubernetes the database Recipe
emits the in-cluster Service DNS name, so the same Aggregate edge resolves to
a routable address on this target.

Apply and open it:

```bash
kubectl apply -f dist/app/helm/
kubectl rollout status deploy/db
kubectl port-forward svc/web-default 8080:8080
```

Open <http://localhost:8080> and log in with Server `db-default`, username
`appuser`, password `dev-app-pw-change-me`, database `appdb`. Remove it with
`kubectl delete -f dist/app/helm/`.

---

## Target 3 — Kubernetes (managed Bitnami chart)

The third layer implements the *same* `core/database/mariadb` Component
against the upstream **Bitnami MariaDB Helm chart** instead of synthesising
manifests. The Recipe sources the chart and maps the Component's values onto
the chart's value schema:

```yaml
spec:
  provider: helm
  implements: core/database/mariadb
  source:
    registry: oci://registry-1.docker.io/bitnamicharts
    chart: mariadb
    version: "{{ optional .infra `source_version` \"25.0.8\" }}"
  valuesMapping: |
    auth:
      database: "{{ .values.database }}"
      existingSecret: "{{ .locals.secret_target_root_password }}"
    primary:
      persistence:
        size: "{{ .infra.storage.size }}"
    # … resources, HA, metrics, backup mapped from infra …
```

Adminer is rendered by the same synthesised Recipe as Target 2. Because this
target consumes an upstream chart, building it fetches that chart into the
build cache first (an online step), and the chart provisions its credentials
from a Kubernetes `Secret` rather than from inline literals. The two
self-contained targets above are the zero-dependency way to run the stack
end to end.

---

## How a target is selected

Recipe selection is by **component type**. Each catalog layer contains exactly
one Recipe per type, so loading `catalog-compose` binds `core/database/mariadb`
to the compose Recipe, while loading `catalog-helm-synth` binds it to the
Kubernetes one. The provider engine that renders a node is the `spec.provider`
of whichever Recipe was bound. Swapping targets is swapping the `--catalog`
directory — the Aggregate never changes.
