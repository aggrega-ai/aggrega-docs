# Cross-boundary compose bridging — `core/compose-bridge`

This example compiles a two-component stack — a **web** front end and a
**PostgreSQL** database — that the Release splits across **two boundaries**.
Under Docker Compose each boundary is its own network seam, and a compose
service in one cannot reach a service in the other by name. The standard-library
**`core/compose-bridge`** FeatureRecipe closes that seam: from the cross-network
`uses` edge it generates a single `aggrega-gw` gateway service — nginx with a
compiler-generated TCP `stream` config — joins it to both networks, and rewrites
the consumer's `DB_HOST` to point at it.

Kubernetes needs no such bridge — cross-boundary references resolve via Service
DNS (the [advanced-platform](../advanced-platform/) example shows that
bridgeless). `core/compose-bridge` is **compose-specific**; this is its compose
home.

## What it demonstrates

- **A boundary-scope FeatureRecipe.** `core/compose-bridge` is attached
  **boundary-wide** in the Release (under a boundary's `features:`, not on a
  component) because its FeatureRecipe is `executionScope: boundary`. It renders
  the `aggrega-gw` gateway **once** for the boundary that attaches it.
- **Nested boundaries collapsing to one compose file.** The parent `bridge`
  boundary holds two children, `frontend` (web) and `backend` (db), each sharing
  `directory: "{{ .parent_boundary.directory }}"`. All three contributions —
  web, db, and the gateway — merge into one
  `dist/bridge/compose/docker-compose.yaml`. Each child's
  `aggrega.ai/namespace` annotation becomes a compose network (`frontend`,
  `backend`).
- **The bridge is derived from the `uses` edge — nothing is hand-addressed.**
  The attachment carries **no `infra`**. The web component declares a `backend`
  use of the database and injects the database host into `DB_HOST` (`from:
  host`). From that single cross-network edge the bridge derives everything: the
  listen port is the target's own port (`5432`), and the consumer env var to
  rewrite is `DB_HOST`. (`portBase` and `providesField` are optional knobs; the
  defaults `10000` / `host` are correct here.)
- **The gateway's `stream` config is compiler-generated.** The vendored bridge
  fragment declares only `image: nginx:alpine` — no ports, no config. The
  compose engine generates the nginx `stream` config from the edge (one
  `server { listen 5432; proxy_pass db:5432; }` block) and installs it as the
  `aggrega-gw` **`command:`** (a base64-encoded config written to
  `/etc/nginx/nginx.conf` at container start). You author none of it.
- **The gateway joins both bridged networks.** `aggrega-gw` is placed on
  `frontend` and `backend` (plus the parent boundary's own `bridge_compose`
  network) so the relay path resolves: `web` reaches the gateway on `frontend`,
  the gateway reaches `db` on `backend`.
- **The consumer's `DB_HOST` is rewritten — consumer-scoped.** Through the
  boundary→component env channel the bridge rewrites `web`'s `DB_HOST` to
  `aggrega-gw:5432`. The rewrite is keyed to the **consumer endpoint of the
  `uses` edge** — only `web` (which declared the dependency) is rewritten; `db`
  (the target) is untouched. It is not a blanket pass over every service in the
  boundary.
- **Host swapped, port kept.** The rewrite changes the *host* (`db` →
  `aggrega-gw`) and keeps the *port* (`5432`): traffic flows `web →
  aggrega-gw:5432 → proxy_pass db:5432` across the network seam. The bridge
  interposes a gateway on the same port, on both networks — it does not remap
  the port.
- **Sourced vs synthesized recipes side by side.** `web` is a **sourced**
  compose Recipe (a `web-fragment.yaml` skeleton + a `valuesMapping` overlay);
  `db` is a **synthesized** Recipe (a `Workload` the compose provider turns into
  a service). Both render into the same merged document.

## What the compiler does — and what it does not (compile-time vs runtime)

The proof here is **compile-time wiring**, inspected in `dist/`: the gateway
service exists, its `stream` config is generated and installed as its
`command:`, it is joined to both bridged networks, and the consumer's `DB_HOST`
points at it. The compiler is an ahead-of-time text router — it does **not**
stand up a running proxy or resolve any address.

The upstream `db:5432` baked into the generated `stream` config is a
**deterministic compile-time compose service pointer**. Compose's runtime DNS
resolves the name `db` to a container IP when the stack comes up; the compiler
never performs that resolution. So this example proves that Aggrega *wires the
bridge ahead of time* — the gateway, its config, its network membership, and the
`DB_HOST` rewrite are all compiled — while the live data path is completed by
the compose runtime.

There is **no runtime-mounted config** in this example: the nginx `stream` rules
are compiler-generated and travel inside the rendered `docker-compose.yaml` (the
gateway `command:`), not mounted from a separate operator-supplied file.

## Layout

```text
compose-bridge/
├── aggregate.yaml      # Developer intent: web + db, web uses db (DB_HOST from host)
├── manifest.yaml       # Ops mapping (empty — recipes resolve by `implements`)
├── release.yaml        # parent `bridge` boundary attaches core/compose-bridge;
│                       #   two children frontend (web) + backend (db)
└── catalog/            # one self-contained compose catalog
    ├── provider/compose.yaml
    ├── component/{web,db}.yaml
    ├── recipe/web.yaml + web-fragment.yaml   # sourced web
    ├── recipe/db.yaml                         # synthesized postgres:16
    ├── feature/core/compose-bridge.yaml       # vendored from the standard library
    └── feature-recipe/compose/bridge/         # vendored from the standard library
        ├── recipe.yaml
        └── bridge-fragment.yaml
```

The three `core/compose-bridge` files under `catalog/` are a **snapshot** of the
standard-library entity, vendored so this workspace builds standalone. The
canonical entity ships in the Aggrega standard-library catalog; the
build-faithful regression guard for it lives in the compiler's tests, not here.

Two categories of file meet in a built example:

1. **Authored** — everything above (the inputs you write or vendor).
2. **Compiler-generated** — `dist/bridge/compose/docker-compose.yaml`, produced
   by `aggrega build`. This **includes** the gateway's nginx `stream` config
   (compiled into the `aggrega-gw` `command:`) and the gateway's network
   membership. You do not author any of it; the compiler emits it.

## Build it

```bash
aggrega build --release release.yaml --catalog catalog
```

Output: `dist/bridge/compose/docker-compose.yaml` — one document with three
services (`aggrega-gw`, `web`, `db`) across the `frontend`, `backend`, and
`bridge_compose` networks. Inspect it:

- `aggrega-gw` carries a `command:` that base64-decodes to the generated stream
  config, and joins `frontend` + `backend`:

  ```bash
  # pull the base64 payload out of the command: and decode it
  grep -A1 'base64 -d' dist/bridge/compose/docker-compose.yaml \
    | grep -oE '[A-Za-z0-9+/=]{40,}' | base64 -d
  # => events {}
  #    stream { server { listen 5432; proxy_pass db:5432; } }
  ```

- `web` carries `DB_HOST: aggrega-gw:5432` (host swapped, port kept) — and `db`
  carries no such rewrite.

The build is deterministic — re-run it and the output is byte-identical.
