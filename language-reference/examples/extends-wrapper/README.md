---
example:
  level: authoring
  products: [core/devtool/adminer, core/gateway/nginx]
  shows: [catalog-authoring, guardrails]
---

# A published wrapper, served by its base's Recipe

This example teaches one thing: a Component that `extends` another inherits that
base's whole data contract, so every Recipe written for the base already
implements the extending Component. Publishing a specialized variant of a
standard-library component therefore costs one catalog entity and one Manifest
line — no Recipe of its own, and no change to the base.

The wrapper here is **`example/gateway/nginx-reviewed`**. It ships in the catalog
beside `core/gateway/nginx`, the component it extends.

## What the wrapper adds, and what it inherits

The wrapper's whole authored surface is metadata plus one socket:

```yaml
metadata:
  name: example/gateway/nginx-reviewed
  labels:
    component.aggrega.ai/type: server
    component.aggrega.ai/category: gateway
    gateway.example.com/audit-tier: reviewed        # added
    gateway.example.com/data-zone: eu-west          # added
  annotations:
    governance.example.com/review-board: platform-architecture   # added
    governance.example.com/contact: platform-architecture@example.com
spec:
  extends: core/gateway/nginx:1.0.0
  schema: inherited
  usesSchema:
    reviewed_upstream:                              # added
      selector: "gateway.example.com/audit-tier=reviewed"
      inject: [env]
```

`schema: inherited` is the literal marker an extending Component writes in place
of a `schema:` block. It states that the three data pillars — `values`, `infra`
and `provides` — are the base's, exactly as the base authored them. The wrapper
declares no pillar key of its own and cannot: the contract belongs to the base,
at every depth of a chain.

Everything the wrapper does not mention, it inherits. `aggrega inspect
example/gateway/nginx-reviewed --resolved` shows the merged entity, and two
things in it are worth reading closely:

- **Three `uses` sockets**, not one: `upstream` and `guard` (the base's, `upstream`
  selecting `component.aggrega.ai/type=server`) and `reviewed_upstream` (the
  wrapper's). Extending *adds* a socket; it does not replace the set.
- **The base's three pillars, verbatim** — `values.upstream_path`,
  `infra.port` / `engine_version` / `compute` / `overrides`, and
  `provides.host` / `port` / `protocol`, each with the base's own descriptions.

## What a consuming Aggregate writes

`aggregate-reviewed.yaml` declares two gateway tiers as the wrapper, fronting a
database console:

```yaml
components:
  edge:
    type: example/gateway/nginx-reviewed
    values:
      upstream_path: /api/          # declared by the base; the wrapper never mentions it
    uses:
      reviewed_upstream:            # the socket the wrapper ADDS
        internal: { target: internal, inject: { env: [ ... ] } }
  internal:
    type: example/gateway/nginx-reviewed
    values:
      upstream_path: /
    uses:
      upstream:                     # the socket the wrapper INHERITS
        console: { target: console, inject: { env: [ ... ] } }
  console:
    type: core/devtool/adminer
```

`upstream_path` is the key to notice. It is declared in `core/gateway/nginx`'s
`values` pillar and appears nowhere in the wrapper's file, yet an author
writes it on a wrapper instance and it reaches the rendered gateway
configuration. That is what inheriting the pillars whole means in practice.

The Manifest is the other half, and it is one line per type:

```yaml
mappings:
  components:
    type:
      example/gateway/nginx-reviewed:1.0.0: compose/nginx:1.0.0
      core/gateway/nginx:1.0.0: compose/nginx:1.0.0
      core/devtool/adminer:1.0.0: compose/adminer:1.0.0
```

Both gateway lines name the **same Recipe**. `compose/nginx` declares
`implements: core/gateway/nginx:1.0.0`, and a Recipe that names a base is the
implementation for every Component extending that base — so the wrapper is
served by it unchanged. Two facts hold at once here, and they are separate:

- **The Recipe matches.** No Recipe implementing the wrapper's own type exists,
  and none is needed.
- **The mapping is still required.** Recipe selection is by exact mapping key, so
  the wrapper needs its own `type` entry; it does not inherit the base's. A
  wrapper instance with no entry of its own halts with the unmapped-instance
  diagnostic even when its base is mapped.

## Build it

```bash
aggrega build --release release-reviewed.yaml --auto-pull
```

The rendered output and the lockfile are generated, not shipped: this example
commits its inputs and regenerates everything else. `--auto-pull` resolves the
lockfile during the build; `aggrega pull --release release-reviewed.yaml` once
beforehand does the same thing and lets later builds run with no flag at all.

Both the wrapper and the base it extends live in the shared catalog, which
resolves from `hub.aggrega.ai`, the default registry `.aggrega-config.yaml`
declares. The build command needs no `--catalog` flag, and neither does
`aggrega inspect` run from this directory.

The pull fetches `core/gateway/nginx` because the wrapper extends it: a base is a
dependency of everything that extends it, so the pull follows the wrapper's
`extends:` and pins the base in the lockfile whether or not the Manifest names
it. The Manifest here maps the base for another reason — the control release
below declares an instance of the base itself.

The rendered `dist/compose/docker-compose.yaml` carries the evidence:

```yaml
  edge:
    image: nginx:1.27.5-alpine
    entrypoint:
      - /bin/sh
      - -c
      - echo 'server { listen 8080; location /api/ { proxy_pass http://internal:8081; } }' > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'
    [… omitted: the published port]
    labels:
      [… omitted: the other provenance labels every rendered document carries]
      aggrega.ai/recipe-uri: nginx:1.0.0
    [… omitted: the service's network, its depends_on naming internal, and its healthcheck]
```

Three readings, in order of what they prove:

- `aggrega.ai/recipe-uri: nginx:1.0.0` — the base's Recipe shaped this service.
  The provenance label on a wrapper instance names the base's Recipe because that
  is the Recipe that rendered it.
- `location /api/` — `values.upstream_path`, a key only the base declares,
  authored on a wrapper instance and rendered.
- `proxy_pass http://internal:8081` — the `reviewed_upstream` edge resolved. The
  target's `provides.host` and `provides.port` arrived on the injection context
  under the delivery keys the base's Recipe reads, so a socket the wrapper added
  flows through a Recipe that has never heard of it.

The lockfile the build resolves records the same fact from the resolver's side:
one `compose/nginx:1.0.0` entry at one digest, referenced from **both** mapping
keys — the base's type and the wrapper's.

The wrapper's labels and annotations travel with the resolved edge: a consuming
node's render context carries each target's `provides`, `labels` and annotations,
so `edge`'s context knows its upstream is `audit-tier=reviewed` and who reviewed
it. Whether any of that appears in a rendered artifact is the Recipe's choice —
these labels and annotations are component identity for selectors and policy to
read, not output the compiler stamps.

## The control: what the added label is for

`aggregate-unreviewed.yaml` is `aggregate-reviewed.yaml` with one edit — the
internal tier is declared as the bare `core/gateway/nginx` base instead of the
wrapper — and it is **expected to fail**:

```bash
aggrega build --release release-negative-unreviewed.yaml --auto-pull
# [DEVELOPER_ERROR E0007] aggregate-unreviewed.yaml at .spec.components.edge.uses.reviewed_upstream.internal
#   selector violation ("gateway.example.com/audit-tier=reviewed", declared on socket "reviewed_upstream", not satisfied by the labels of "internal"). Add the labels the selector requires to the target's component type, or wire the socket to a component that already carries them.
```

The halt is the lesson. The base satisfies its own `upstream` socket — it is
`component.aggrega.ai/type=server`, and the internal tier is wired through that
socket in exactly the same way — but it carries no `audit-tier` label, so the
wrapper's stricter socket rejects it. The label the wrapper adds is what makes an
instance of it selectable, and the selector is where that shows.

Two more halts are worth knowing about, and both are the schema doing its job:

- A Component that declares `extends` and authors pillar content under `schema:`
  is refused when the document loads, naming the constraint. So is one that omits
  `schema:` entirely. `schema: inherited` is the only accepted form, and it is
  written rather than implied so a reader can never confuse an inherited pillar
  block with a forgotten one.
- A `values` key the base does not declare is refused on a wrapper instance, at
  the authored path, because the enforced contract is the base's.

## Why this is useful

An organization that has settled on a reviewed shape for a standard-library
component needs somewhere to keep it. Kept in prose, the labels, annotations and
sockets get restated in every Aggregate that needs them, and drift apart as they
are. Published as a Component that extends the base, the shape becomes a
versioned, reviewable catalog entity with a name: a team consuming it writes
`type: example/gateway/nginx-reviewed` and one Manifest line, and inherits the
base's whole contract along with every Recipe already written against it, on
every target the base supports.

The cost of the wrapper is what makes this work: it adds structure and metadata
and nothing else. Because it declares no pillars, an instance of the wrapper and
an instance of the base validate against one contract, and a Recipe written for
the base can never be surprised by a specialization of it.
