---
example:
  level: advanced
  products: [core/datastore/postgres, core/devtool/adminer]
  shows: [multi-target, boundaries, connections, catalog-authoring]
---

# Cross-boundary networking — one intent, two deployments

A two-component stack — an **Adminer** database UI and a **PostgreSQL** database
— split across **two boundaries**, where Adminer must reach the database across
the boundary seam. The same developer intent deploys two ways, and **the
contrast is the lesson**:

- **Local (Docker Compose):** each boundary is its own compose network, and a
  service in one cannot reach a service in the other by name. The standard-library
  **`core/compose-bridge`** Feature's compose FeatureRecipe generates an
  `aggrega-gw` gateway to cross that seam.
- **Kubernetes (Helm):** each boundary is its own **namespace**, and a pod in
  one reaches a Service in another by **native cross-namespace DNS**
  (`db-default.backend`) — **no bridge**. The database publishes a bare service
  name; the consumer's **`core/k8s-dns-resolver`** routing feature qualifies it
  with the target namespace.

**The compose-bridge is what Kubernetes namespaces + cross-namespace DNS give you
natively.** The seam-crossing is an Ops/Operator concern that differs by target;
the developer intent does not change. The very same `aggrega.ai/namespace`
boundary annotation drives compose **network** placement in one variant and
Kubernetes **namespace** placement in the other.

## The shared developer intent

`aggregate.yaml` is identical for both variants:

```yaml
components:
  adminer:
    type: core/devtool/adminer
    uses:
      databases:
        primary:
          target: db
          inject:
            env:
              - in: ADMINER_DEFAULT_SERVER   # rewritten/resolved per variant
                from: host                   # ← the target db's provides.host
  db:
    type: core/datastore/postgres
```

The one `uses` edge injects the database's `host` into `ADMINER_DEFAULT_SERVER`.
What that host *resolves to* is an Ops concern decided below the Aggregate — so
the same edge yields `aggrega-gw:5432` under compose and `db-default.backend`
under helm, with no change to developer intent.

## Variant A — local (Docker Compose): the bridge

```bash
aggrega pull --release release-compose.yaml --catalog catalog-compose
aggrega build --release release-compose.yaml --catalog catalog-compose
```

A parent `bridge` boundary holds two children, `frontend` (adminer) and
`backend` (db), sharing one directory so they merge into a single
`dist/bridge/compose/docker-compose.yaml`. Each child's `aggrega.ai/namespace`
annotation becomes a compose **network**. `core/compose-bridge`, attached at the
parent (boundary-scope), derives an `aggrega-gw` gateway from the cross-network
`uses` edge. Its standard-library FeatureRecipe computes, once for the boundary,
a table of the edges to bridge — both ends in this one compose file, on
different networks — and everything below is read from that table by its own
templates:

- its `valuesMapping` writes the gateway's nginx `stream` config, delivered as
  a mounted compose **config** (top-level `configs:`, mounted at
  `/etc/nginx/nginx.conf`); it carries a `resolver` and a per-edge variable
  `proxy_pass` so the upstream resolves at connection time (the `$` is escaped to
  `$$` so Compose's interpolation leaves it intact for nginx);
- the same `valuesMapping` names both ends under the gateway's
  `x-aggrega-networks-of`, which the compose provider resolves, so the gateway
  joins both bridged networks;
- its `injectMapping`, run for adminer, rewrites the consumer's
  `ADMINER_DEFAULT_SERVER` to `aggrega-gw:5432`. The rewrite replaces what
  adminer's own `databases` connection delivered; had another Feature attached
  to adminer delivered that variable, the build would halt naming both rather
  than replace it.

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
aggrega pull --release release-helm.yaml --catalog catalog-helm
aggrega build --release release-helm.yaml --catalog catalog-helm
```

The same Aggregate, deployed to Kubernetes. Two **sibling** boundaries, each with
a distinct `aggrega.ai/namespace` annotation that cascades to every resource as
`metadata.namespace`:

```text
dist/frontend/helm/adminer-deployment.yaml      # metadata.namespace: frontend
dist/frontend/helm/adminer-default-service.yaml # metadata.namespace: frontend
dist/backend/helm/db-statefulset.yaml           # metadata.namespace: backend
dist/backend/helm/db-default-service.yaml       # metadata.namespace: backend
dist/backend/helm/db-headless-service.yaml      # metadata.namespace: backend
```

There is **no `aggrega-gw`**. The helm `db` recipe publishes a **bare** service
name in `provides.host` — the helm provider names the synthesized Service
`<rendered_name>-<service-key>` (`db-default`), with no namespace. The consumer
attaches the **`core/k8s-dns-resolver`** routing feature (the Release points it at
`ADMINER_DEFAULT_SERVER`), and the feature qualifies that bare host with the
target's namespace on the consumer's own side — producing the cross-namespace DNS
name `db-default.backend` before Adminer renders. The host is **derived**, not
hand-written into the producer:

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
| `ADMINER_DEFAULT_SERVER` resolves to | `aggrega-gw:5432` (rewritten) | `db-default.backend` (qualified caller-side) |
| extra resource | the `aggrega-gw` service + its config | none |
| same `aggrega.ai/namespace` drives | compose network placement | k8s namespace placement |

One developer intent; the seam-crossing is provider-specific Ops/Operator
machinery. The compose bridge exists because a flat compose network has no
namespace-scoped DNS; Kubernetes gives you that natively.

## When the two ends render under different providers

Both variants above keep one developer intent and let the crossing ride on a
**deterministic pointer string**: the database's `provides.host` flows across the
boundary seam as a stable pointer, and each target resolves that pointer its own
way — a compose gateway address, or a cross-namespace DNS name. The pointer
always crosses, because the compiler pipes strings between a producer and a
consumer without interpreting them.

A provider can go further and wire a **native cross-reference** between two of its
*own* assembled artifacts on either side of the seam — a reference in that
provider's own vocabulary that the target platform resolves at deploy time. The
CloudFormation provider does this for a `uses` edge that crosses stacks: the
producer stack publishes an `Export` and the consumer stack reads it with
`Fn::ImportValue` (see [providers/cloudformation.md](../../providers/cloudformation.md)).
A native cross-reference is a **same-provider** upgrade — it works because both
ends speak the same artifact vocabulary, so one side can publish a reference the
other side knows how to resolve.

When a `uses` edge crosses a boundary **between two different providers** — the
producer assembles under one provider and the consumer under another — no native
cross-reference is possible. A reference minted in one provider's vocabulary means
nothing to the other, and the compiler does not translate between them: it pipes
strings, it does not infer meaning or rewrite one provider's reference into
another's form. So the producer's deterministic pointer crosses the seam
unchanged; where either of the two providers wires native cross-references of
its own, as CloudFormation does, the compiler emits a **warning** naming both
endpoints, both provider names, and the socket; and the build completes on that
pointer. The compiler
trusts the author and does not halt: a deterministic pointer the author supplied
may well be resolvable across the seam — a stable DNS name or an infrastructure
interpolation string — and only the author knows the target topology.

This keeps the seam-crossing where it belongs. Whether a cross-provider pointer is
usable is a deployment concern the author owns; translating one provider's native
reference into another provider's consumer form is opinionated, provider-specific
work that lives outside the neutral core.

## Layout

```text
cross-boundary-networking/
├── .aggrega-config.yaml      # marks this folder as the workspace root; names the hub registry
├── aggregate.yaml            # SHARED developer intent (both variants)
├── release-compose.yaml      # Variant A: parent bridge boundary + two networks
├── manifest-compose.yaml
├── catalog-compose/          # local adminer compose recipe (the component + the rest from standard)
├── release-helm.yaml         # Variant B: two namespace boundaries, no bridge
├── manifest-helm.yaml
└── catalog-helm/             # local adminer helm recipe (the components + the rest from standard)
```

This example **consumes the standard library**. Each variant builds with
`--catalog catalog-<variant>`, its own local directory, and resolves what that
directory does not declare from `hub.aggrega.ai`, the default registry
`.aggrega-config.yaml` names, so local entities resolve before the shared ones.
`core/datastore/postgres`, the shared `core/devtool/adminer` UI component, the
`core/compose-bridge` and `core/k8s-dns-resolver` Features with their compose and helm
FeatureRecipes, and the `compose`/`helm` providers come from the standard catalog. What
stays local is the example-specific teaching content: the per-target Adminer recipes. The
helm `db` recipe is the standard library's `helm/postgres`, whose `provides.host` is a
**bare, self-contained** service name. The consumer
qualifies it with the target namespace caller-side via the standard-library
`core/k8s-dns-resolver` routing feature, so the recipe hardcodes no boundary
namespace.

Two categories of file meet in a built variant: **authored** inputs (everything
above) and **compiler-generated** output under `dist/` (the merged
`docker-compose.yaml`, or the per-namespace helm manifests) — you author none of
the latter. `dist/` is regenerated by `aggrega build` and is gitignored.
