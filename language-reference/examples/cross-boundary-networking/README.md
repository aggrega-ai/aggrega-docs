# Cross-boundary networking — one intent, two deployments

A two-component stack — an **Adminer** database UI and a **PostgreSQL** database
— split across **two boundaries**, where Adminer must reach the database across
the boundary seam. The same developer intent deploys two ways, and **the
contrast is the lesson**:

- **Local (Docker Compose):** each boundary is its own compose network, and a
  service in one cannot reach a service in the other by name. The standard-library
  **`core/compose-bridge`** FeatureRecipe generates an `aggrega-gw` gateway to
  cross that seam.
- **Kubernetes (Helm):** each boundary is its own **namespace**, and a pod in
  one reaches a Service in another by **native cross-namespace DNS**
  (`db-default.backend`) — **no bridge**.

**The compose-bridge is what Kubernetes namespaces + cross-namespace DNS give you
natively.** The seam-crossing is an Ops/Operator concern that differs by target;
the developer intent does not change. The very same `aggrega.ai/namespace`
boundary annotation drives compose **network** placement in one variant and
Kubernetes **namespace** placement in the other.

## The shared developer intent

[`aggregate.yaml`](aggregate.yaml) is identical for both variants:

```yaml
components:
  adminer:
    type: app/adminer
    uses:
      backend:
        primary:
          target: db
          inject:
            env:
              - in: ADMINER_DEFAULT_SERVER   # rewritten/resolved per variant
                from: host                   # ← the target db's provides.host
  db:
    type: core/postgres
```

The one `uses` edge injects the database's `host` into `ADMINER_DEFAULT_SERVER`.
What that host *resolves to* is decided by the bound Recipe's `provides.host`
(an Ops concern), not by the Aggregate — so the same edge yields
`aggrega-gw:5432` under compose and `db-default.backend` under helm, with no
change to developer intent.

## Variant A — local (Docker Compose): the bridge

```bash
aggrega build --release release-compose.yaml --catalog catalog-compose
```

A parent `bridge` boundary holds two children, `frontend` (adminer) and
`backend` (db), sharing one directory so they merge into a single
`dist/bridge/compose/docker-compose.yaml`. Each child's `aggrega.ai/namespace`
annotation becomes a compose **network**. `core/compose-bridge`, attached at the
parent (boundary-scope), derives an `aggrega-gw` gateway from the cross-network
`uses` edge:

- the gateway's nginx `stream` config is **compiler-generated** and delivered as
  a mounted compose **config** (top-level `configs:`, mounted at
  `/etc/nginx/nginx.conf`); it carries a `resolver` and a per-edge variable
  `proxy_pass` so the upstream resolves at connection time (the `$` is escaped to
  `$$` so Compose's interpolation leaves it intact for nginx);
- the gateway joins both bridged networks;
- the consumer's `ADMINER_DEFAULT_SERVER` is rewritten to `aggrega-gw:5432`.

So traffic flows `adminer → aggrega-gw:5432 → proxy_pass db:5432`, crossing the
network seam through the gateway.

### Run it

```bash
cd dist/bridge/compose
docker compose up
```

Open **`http://localhost:8080`** (server pre-filled `aggrega-gw:5432`) and log in:

| Field | Value |
| --- | --- |
| System | PostgreSQL |
| Server | `aggrega-gw:5432` (pre-filled) |
| Username | `appuser` |
| Password | `apppass` |
| Database | `appdb` |

The credentials are **demo-only** (set inline on the db recipe so the stack runs
out of the box); a real deployment uses the credential subsystem.

## Variant B — Kubernetes (Helm): namespaces + cross-namespace DNS

```bash
aggrega build --release release-helm.yaml --catalog catalog-helm
```

The same Aggregate, deployed to Kubernetes. Two **sibling** boundaries, each with
a distinct `aggrega.ai/namespace` annotation that cascades to every resource as
`metadata.namespace`:

```text
dist/frontend/helm/adminer-deployment.yaml      # metadata.namespace: frontend
dist/frontend/helm/adminer-default-service.yaml # metadata.namespace: frontend
dist/backend/helm/db-deployment.yaml            # metadata.namespace: backend
dist/backend/helm/db-default-service.yaml        # metadata.namespace: backend
```

There is **no `aggrega-gw`**. The helm `db` recipe's `provides.host` is the
namespace-qualified DNS name of its synthesized Service — the helm provider names
the Service `<instance_id>-<service-key>` (`db-default`), in the `backend`
namespace, so a consumer in another namespace dials `db-default.backend`. The
shared inject edge pipes exactly that into Adminer:

```yaml
# dist/frontend/helm/adminer-deployment.yaml
- name: ADMINER_DEFAULT_SERVER
  value: db-default.backend          # == the rendered db Service <name>.<namespace>
```

That value **byte-matches** the rendered db Service's `metadata.name` +
`metadata.namespace`, which is the whole proof: Kubernetes cross-namespace DNS is
a deterministic contract, so if the rendered host equals the rendered Service
identity, it resolves at runtime — no gateway, no live cluster needed to verify
the wiring.

## The duality

| | compose (Variant A) | helm (Variant B) |
| --- | --- | --- |
| boundary seam | separate compose **networks** | separate **namespaces** |
| crossing mechanism | `core/compose-bridge` gateway (`aggrega-gw`) | native cross-namespace **DNS** |
| `ADMINER_DEFAULT_SERVER` resolves to | `aggrega-gw:5432` (rewritten) | `db-default.backend` (direct) |
| extra resource | the `aggrega-gw` service + its config | none |
| same `aggrega.ai/namespace` drives | compose network placement | k8s namespace placement |

One developer intent; the seam-crossing is provider-specific Ops/Operator
machinery. The compose bridge exists because a flat compose network has no
namespace-scoped DNS; Kubernetes gives you that natively.

## Layout

```text
cross-boundary-networking/
├── aggregate.yaml            # SHARED developer intent (both variants)
├── release-compose.yaml      # Variant A: parent bridge boundary + two networks
├── manifest-compose.yaml
├── catalog-compose/          # compose provider, recipes, core/compose-bridge
├── release-helm.yaml         # Variant B: two namespace boundaries, no bridge
├── manifest-helm.yaml
└── catalog-helm/             # helm provider, synthesized recipes (db host namespace-qualified)
```

The `core/compose-bridge` files under `catalog-compose/` are a vendored snapshot
of the standard-library entity (so the example builds standalone); the canonical
entity ships in the Aggrega standard-library catalog, and its build-faithful
regression guard lives in the compiler's tests.

Two categories of file meet in a built variant: **authored** inputs (everything
above) and **compiler-generated** output under `dist/` (the merged
`docker-compose.yaml`, or the per-namespace helm manifests) — you author none of
the latter. `dist/` is regenerated by `aggrega build` and is gitignored.
