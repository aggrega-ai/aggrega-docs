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
  declare a capability-agnostic `Workload`; the provider synthesises a
  `docker-compose.yaml` service, or the Kubernetes objects the Workload's `form`
  calls for — a `Deployment` and a `Service` for the stateless web UI, and for
  the `form: stateful` database a `StatefulSet` whose per-replica volume claim
  template carries the data directory, alongside the Headless `Service` that
  governs it and the `ClusterIP` `Service` consumers dial.
- **The credential subsystem.** Database passwords are attached in the
  component's `features:` pillar — each a `Feature` labeled
  `feature.aggrega.ai/kind: secret`, kept apart from application `values`. The
  Component's `featuresSchema` declares two slot kinds, and the example exercises
  both: a *black-box* slot whose FeatureRecipe delivers the value internally, and
  a *transparent* slot whose value the developer delivers explicitly with a
  `secret.inject` block on the attachment.
- **Remote chart sources.** The managed Kubernetes target sources the upstream
  Bitnami MariaDB chart by OCI reference. `aggrega pull` pins the chart in a
  lockfile and fetches it into a content-addressed cache; `aggrega build` renders
  from that cache, so lock-time and build-time resolve the same chart. The chart
  version comes from the operator's `infra.source_version` where the Release pins
  one, and otherwise from a developer-authored value (a value flowing into source
  resolution). The per-release lockfiles pin entity identities and digests:
  after catalog entities are renamed or their content changes, refresh a stale
  local lockfile with
  `aggrega pull --upgrade --release release-<variant>.yaml --catalog catalog-<variant>`.
  Each release variant resolves against its own sibling catalogue directory, so
  pairing the two is required: without `--catalog`, this example's recipes are
  not found locally and resolution falls through to a registry lookup that
  cannot succeed.
- **Provenance as annotations.** Every rendered Kubernetes object carries an
  `aggrega.ai/recipe-uri` annotation recording the Recipe that produced it —
  an annotation, not a label, because the URI value contains characters a
  Kubernetes label value may not.
- **Chart composition (vs synthesis).** The same Aggregate can produce a
  redistributable Helm chart instead of rendered manifests. The `helm-chart`
  provider composes an umbrella chart: each component's local sub-chart is copied
  in verbatim (its Helm `{{ }}` preserved untouched), and the umbrella's
  `values.yaml` routes each component's mapped values — including the piped
  database host — under that component's alias.
- **Provider selection by component type.** The Recipe that renders each
  component is chosen by the component *type* it implements, drawn from
  whichever catalog layer the build loads.

## Authoring and consumption — a mixed workspace

This example works both ends of the catalog at once: it **authors** some entities
locally and **consumes** others from Aggrega's standard library. The MariaDB
database Component, its credential Features, and the per-target Recipes are built
from scratch in the local `catalog-*/` directories — one Aggregate renders that
locally-authored database across four providers. The Adminer web UI, by contrast,
is **consumed**: the `web` component references the shipped `core/devtool/adminer`
Component directly, and each target authors only a local Recipe that implements
it. The same workspace therefore shows entity *authoring* on the database side
next to catalog *consumption* on the UI side. The entities you build here are the
same *kind* that ship in the standard library: a database Component, credential
Features, provider Recipes.

The [catalog-only](../catalog-only/) example sits at the pure-consumption end of
the same curriculum: it assembles this very stack — a MariaDB database with an
Adminer UI — by *referencing* standard-library entities, authoring none of its
own. Read the database side of this example to learn how catalog entities are
**built**; read the consumption examples to learn how a whole stack is **used**
from the shipped catalog.

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
├── catalog-helm-bitnami/       # Recipe layer: helm (upstream Bitnami chart)
│
├── manifest-helm-chart.yaml    # Ops mapping, composed-Helm-chart target
├── release-helm-chart.yaml     # Operator release, composed-Helm-chart target
└── catalog-helm-chart/         # Recipe layer: helm-chart (umbrella composition)
```

Each `catalog-*` directory carries the locally-authored MariaDB Component and
Feature definitions plus the Recipes for that one target. The Adminer Component
is not among them — it resolves from the standard library. A build loads one
`catalog-*` layer over that standard library, so each component type resolves to
exactly one Recipe.

The Release, its `aggregate:`, and its `manifest:` are siblings in this
directory; the `--catalog` directory is separate.

## The shared Aggregate

```yaml
spec:
  components:
    db:
      type: core/datastore/mariadb
      values:
        database: appdb
        user: appuser
        charset: utf8mb4
        collation: utf8mb4_general_ci
        chart_version: "25.0.8"          # the managed-chart target's chart, absent an operator pin
      features:
        root_password:                    # black-box slot: the FeatureRecipe delivers it
          type: core/secret-value
          values: { key: MARIADB_ROOT_PASSWORD, origin: dev-root-pw-change-me }
        user_password:                    # transparent slot: the developer delivers it
          type: core/secret-provided
          values: { origin: dev-app-pw-change-me }
          inject:
            env: { MARIADB_PASSWORD: value }

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

The MariaDB image needs a root password to start, and the application user needs
its own. Both are attached in the database component's `features:` pillar — kept
apart from application `values` — as Features labeled
`feature.aggrega.ai/kind: secret`. The `core/datastore/mariadb` Component's
`featuresSchema` declares the two slots, and the example exercises both delivery
models:

- `root_password` is a **black-box** slot (`inject: []`): the FeatureRecipe
  delivers the value into the component's pipe. The developer does not — and may
  not — dictate how.
- `user_password` is a **transparent** slot (`inject: [env, file]`): the
  credential exposes its value, and the developer maps it to an environment
  variable with the `secret.inject` block on the attachment.

The values here are inline literals so the stack runs from a single command —
suitable for local development and demos. For shared or production environments,
the same attachments resolve their values from a secret store: the
target's catalog loads a FeatureRecipe that fetches them, and the Aggregate does
not change.

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

The database's `Workload` declares `form: stateful`, so it synthesises a
`StatefulSet` whose data directory is a per-replica volume claim template rather
than a `Deployment` sharing one claim. Two companions travel with that form: the
volume is declared as a `persistentTemplate`, and a Headless `Service` supplies
the stable per-pod DNS identity the `StatefulSet` names as its governing
service. Adminer keeps no state, so its `Workload` leaves `form` at the default
and stays a `Deployment` — persistence is a property of the Workload, not a
different component.

```bash
aggrega build --release release-helm-synth.yaml --catalog catalog-helm-synth
```

Output under `dist/app/helm/`:

```text
db-statefulset.yaml       # mariadb:11.6, env + mount, volumeClaimTemplate for /var/lib/mysql
db-default-service.yaml   # ClusterIP Service "db-default" on 3306
db-headless-service.yaml  # Headless Service "db-headless" — the StatefulSet's serviceName
web-deployment.yaml       # adminer:4, ADMINER_DEFAULT_SERVER: db-default
web-default-service.yaml  # NodePort Service "web-default" on 8080
```

Note `ADMINER_DEFAULT_SERVER: db-default` — for Kubernetes the database Recipe
emits the in-cluster Service DNS name, so the same Aggregate edge resolves to
a routable address on this target.

Apply and open it:

```bash
kubectl apply -f dist/app/helm/
kubectl rollout status statefulset/db
kubectl port-forward svc/web-default 8080:8080
```

Open <http://localhost:8080> and log in with Server `db-default`, username
`appuser`, password `dev-app-pw-change-me`, database `appdb`. Remove it with
`kubectl delete -f dist/app/helm/`.

---

## Target 3 — Kubernetes (managed Bitnami chart)

The third layer implements the *same* `core/datastore/mariadb` Component
against the upstream **Bitnami MariaDB Helm chart** instead of synthesising
manifests. The Recipe sources the chart by OCI reference and maps the
Component's values onto the chart's value schema:

```yaml
spec:
  capability: helm
  implements: core/datastore/mariadb
  source:
    kind: helm-oci-chart
    url: oci://registry-1.docker.io/bitnamicharts/mariadb
    version: "{{ optional .infra `source_version` .values.chart_version }}"   # operator pin, else the value
  valuesMapping: |
    auth:
      database: "{{ .values.database }}"
      rootPassword: "{{ .context.inject.env.MARIADB_ROOT_PASSWORD }}"
      username: "{{ .values.user }}"
      password: "{{ .context.inject.env.MARIADB_PASSWORD }}"
    primary:
      persistence:
        size: "{{ .infra.storage.size }}"
    # … resources, HA, metrics mapped from infra …
```

The Recipe's `source.version` prefers the operator's `infra.source_version` and
falls back to the developer-authored `.values.chart_version`. Chart-version
pinning is an infrastructure concern, so the operator's pin wins wherever a
Release sets one; this Release deliberately sets none, so the `.values` key is the
version that actually resolves — which is the whole point of the target, because a
developer value reaching source resolution is only observable in the rendered
output while the operational pin is absent. Pin `source_version` on the `db`
component in `release-helm-bitnami.yaml` and the rendered `helm.sh/chart` label
follows that version instead.

`optional` reads the pin by name rather than as a dotted path, which is what lets
an absent pin fall through to the developer value rather than resolve to an empty
version — see [`optional`](../../templates/sprig-functions.md#optional--presence-aware-fallback)
for the presence-check semantics.

Building this target is a two-step flow: `aggrega pull` resolves the chart,
pins it in `release-helm-bitnami.lock`, and fetches it into the content-addressed
build cache (the one online step); `aggrega build` then renders from the cache,
so lock-time and build-time resolve the identical chart. The injected credentials
flow into the chart's `auth` values, and the chart generates the Kubernetes
`Secret` the database reads. Adminer is rendered by the same synthesised Recipe
as Target 2 and dials the chart's primary Service (`db-mariadb`). The two
self-contained targets above are the zero-dependency way to run the stack
end to end.

---

## Target 4 — Kubernetes (composed Helm chart)

The fourth layer implements the *same* components against the `helm-chart`
provider, which **composes a redistributable Helm umbrella chart** rather than
rendering manifests (Target 2) or rendering an upstream chart (Target 3). Each
Recipe sources a small local chart:

```yaml
spec:
  capability: helm-chart
  implements: core/datastore/mariadb
  source: ./charts/mariadb          # copied verbatim as the sub-chart
  valuesMapping: |
    { "database": "{{ .values.database }}",
      "rootPassword": "{{ .context.inject.env.MARIADB_ROOT_PASSWORD }}",
      "serviceName": "{{ .context.instance_id }}-mariadb" }
```

Build it:

```bash
aggrega build --release release-helm-chart.yaml --catalog catalog-helm-chart
```

Output under `dist/app/helm-chart/`:

```text
Chart.yaml                 # umbrella; lists db and web as sub-chart dependencies
values.yaml                # alias-keyed: db.* and web.* value blocks
charts/
├── db/                    # the local ./charts/mariadb, copied verbatim
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── deployment.yaml
│       ├── service.yaml
│       ├── pvc.yaml
│       └── netpol.yaml           # injected artifact (see below)
└── web/                   # the local ./charts/adminer, copied verbatim
```

Install it (the sub-charts are vendored under `charts/`, so no
`helm dependency build` is needed first):

```bash
helm install mariadb-adminer dist/app/helm-chart/
```

The umbrella's `values.yaml` already carries each component's resolved values, so
the database starts with its credentials and Adminer is wired to the MariaDB
Service — the same connection the other targets express, now shipped as a chart
you can install or vendor.

Two distinct delimiter regimes apply, and they do not overlap:

- **Sourced sub-charts are copied verbatim.** The files under `./charts/mariadb`
  and `./charts/adminer` are bundled into the umbrella unchanged — their Helm
  `{{ }}` directives are *not* touched by the compiler and resolve at
  `helm install` time. The composer's only job there is assembly, not templating.
- **`$import:` artifacts are dual-delimiter.** A Recipe may inject extra template
  files via `artifacts: { name: { $import: ... } }`. *Those* files — and only
  those — are pre-rendered by the compiler with the `[[ ]]` delimiters before they
  land, while their `{{ }}` is preserved for Helm. The `netpol.yaml` artifact —
  keyed `netpol.yaml` and imported from `./extras/mariadb-netpol.yaml`, since the
  key names the emitted file and the import selects its content — shows the mix:
  `[[ .context.instance_id ]]` (filled at build) and `{{ .Release.Namespace }}`
  (left for install).

The String Pipe is expressed in chart terms: Adminer's `databases` use of MariaDB
resolves the database Recipe's `provides.host` into the umbrella's `values.yaml`
under the web alias (`adminerDefaultServer: db-mariadb`), which the Adminer
sub-chart reads as `{{ .Values.adminerDefaultServer }}`. The same value names the
MariaDB sub-chart's Service, so the wiring resolves consistently at install. The
output is a chart to `helm install` or vendor — not a set of applied manifests.

---

## How a target is selected

Recipe selection is by **component type**. Each catalog layer contains exactly
one Recipe per type, so loading `catalog-compose` binds `core/datastore/mariadb`
to the compose Recipe, while loading `catalog-helm-synth` binds it to the
Kubernetes one. The provider that renders a node is the `spec.capability`
of whichever Recipe was bound. Swapping targets is swapping the `--catalog`
directory — the Aggregate never changes.
