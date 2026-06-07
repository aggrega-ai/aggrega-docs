# Cross-boundary compose bridging — `core/compose-bridge`

This example compiles a two-component stack — an **Adminer** database UI and a
**PostgreSQL** database — that the Release splits across **two boundaries**.
Under Docker Compose each boundary is its own network seam, and a compose
service in one cannot reach a service in the other by name. The standard-library
**`core/compose-bridge`** FeatureRecipe closes that seam: from the cross-network
`uses` edge it generates a single `aggrega-gw` gateway service — nginx with a
compiler-generated TCP `stream` config — joins it to both networks, and rewrites
the consumer's `ADMINER_DEFAULT_SERVER` to point at it. Adminer is a real client
that opens that connection, so the running stack **exercises** the bridge end to
end, not just wires it.

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
  boundary holds two children, `frontend` (adminer) and `backend` (db), each
  sharing `directory: "{{ .parent_boundary.directory }}"`. All three
  contributions — adminer, db, and the gateway — merge into one
  `dist/bridge/compose/docker-compose.yaml`. Each child's
  `aggrega.ai/namespace` annotation becomes a compose network (`frontend`,
  `backend`).
- **The bridge is derived from the `uses` edge — nothing is hand-addressed.**
  The attachment carries **no `infra`**. The adminer component declares a
  `backend` use of the database and injects the database host into
  `ADMINER_DEFAULT_SERVER` (`from: host`). From that single cross-network edge
  the bridge derives everything: the listen port is the target's own port
  (`5432`), and the consumer env var to rewrite is `ADMINER_DEFAULT_SERVER`.
  (`portBase` and `providesField` are optional knobs; the defaults `10000` /
  `host` are correct here.)
- **The gateway's `stream` config is compiler-generated.** The vendored bridge
  fragment declares only `image: nginx:alpine` — no ports, no config. The
  compose engine generates the nginx `stream` config from the edge (a
  `resolver` plus one `server { listen 5432; set $u0 db:5432; proxy_pass $u0; }`
  block) and delivers it as a **mounted compose config** — a top-level
  `configs:` entry with inline content, referenced from `aggrega-gw`'s
  `configs:` and mounted at `/etc/nginx/nginx.conf`. You author none of it.
  (Inline `configs.content` requires Docker Compose **≥ 2.23.1**.)
- **The upstream resolves at runtime, not at startup.** The `stream` config
  carries `resolver 127.0.0.11 valid=10s;` (Docker's embedded DNS) and proxies
  through a per-edge variable (`set $u0 db:5432; proxy_pass $u0;`, written `$$u0`
  in the compose file — see the note under "Build it"). A bare
  `proxy_pass db:5432` resolves once at startup and the gateway would die
  (`host not found in upstream`) when it starts before the target; the variable
  form defers resolution to connection time.
- **The gateway joins both bridged networks.** `aggrega-gw` is placed on
  `frontend` and `backend` (plus the parent boundary's own `bridge_compose`
  network) so the relay path resolves: `adminer` reaches the gateway on
  `frontend`, the gateway reaches `db` on `backend`.
- **The consumer's `ADMINER_DEFAULT_SERVER` is rewritten — consumer-scoped.**
  Through the boundary→component env channel the bridge rewrites `adminer`'s
  `ADMINER_DEFAULT_SERVER` to `aggrega-gw:5432`. The rewrite is keyed to the
  **consumer endpoint of the `uses` edge** — only `adminer` (which declared the
  dependency) is rewritten; `db` (the target) is untouched. It is not a blanket
  pass over every service in the boundary.
- **Host swapped, port kept.** The rewrite changes the *host* (`db` →
  `aggrega-gw`) and keeps the *port* (`5432`): traffic flows `adminer →
  aggrega-gw:5432 → proxy_pass db:5432` across the network seam. The bridge
  interposes a gateway on the same port, on both networks — it does not remap
  the port.
- **Sourced vs synthesized recipes side by side.** `adminer` is a **sourced**
  compose Recipe (an `adminer-fragment.yaml` skeleton + a `valuesMapping`
  overlay); `db` is a **synthesized** Recipe (a `Workload` the compose provider
  turns into a service). Both render into the same merged document.

## What the compiler does — and what it does not (compile-time vs runtime)

The proof here is **compile-time wiring**, inspected in `dist/`: the gateway
service exists, its `stream` config is generated and mounted as a compose
config, it is joined to both bridged networks, and the consumer's
`ADMINER_DEFAULT_SERVER` points at it. The compiler is an ahead-of-time text
router — it does **not** stand up a running proxy or resolve any address.

The upstream `db:5432` baked into the generated `stream` config is a
**deterministic compile-time compose service pointer**. Compose's runtime DNS
resolves the name `db` to a container IP when the stack comes up; the compiler
never performs that resolution. So this example proves that Aggrega *wires the
bridge ahead of time* — the gateway, its config, its network membership, and the
`ADMINER_DEFAULT_SERVER` rewrite are all compiled — while the live data path
(Adminer actually opening a connection through the gateway) is completed by the
compose runtime.

There is **no operator-supplied config file** in this example: the nginx
`stream` rules are compiler-generated and travel inside the rendered
`docker-compose.yaml` (a top-level `configs:` entry with inline content), not
mounted from a separate file you maintain.

## Layout

```text
compose-bridge/
├── aggregate.yaml      # Developer intent: adminer + db, adminer uses db (ADMINER_DEFAULT_SERVER from host)
├── manifest.yaml       # Ops mapping (empty — recipes resolve by `implements`)
├── release.yaml        # parent `bridge` boundary attaches core/compose-bridge;
│                       #   two children frontend (adminer) + backend (db)
└── catalog/            # one self-contained compose catalog
    ├── provider/compose.yaml
    ├── component/{adminer,db}.yaml
    ├── recipe/adminer.yaml + adminer-fragment.yaml   # sourced adminer
    ├── recipe/db.yaml                                 # synthesized postgres:16
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
   (a top-level `configs:` entry mounted into `aggrega-gw`) and the gateway's
   network membership. You do not author any of it; the compiler emits it.

## Build it

```bash
aggrega build --release release.yaml --catalog catalog
```

Output: `dist/bridge/compose/docker-compose.yaml` — one document with three
services (`aggrega-gw`, `adminer`, `db`) across the `frontend`, `backend`, and
`bridge_compose` networks. Inspect it:

- the top-level `configs.aggrega-gw-nginx.content` holds the generated stream
  config, and `aggrega-gw` references it (mounted at `/etc/nginx/nginx.conf`)
  and joins `frontend` + `backend`. The mounted config nginx runs is:

  ```nginx
  events {}
  stream {
    resolver 127.0.0.11 valid=10s;
    server {
      listen 5432;
      set $u0 db:5432;
      proxy_pass $u0;
    }
  }
  ```

  In the compose file the `$` appears doubled (`set $$u0 db:5432;`): Docker
  Compose runs `$`-interpolation over `configs.content`, so the compiler escapes
  `$` → `$$` and Compose un-escapes it back to `$` in the mounted file. nginx
  sees `$u0`.

- `adminer` carries `ADMINER_DEFAULT_SERVER: aggrega-gw:5432` (host swapped, port
  kept) — and `db` carries no such rewrite.

The build is deterministic — re-run it and the output is byte-identical.

## Run it — exercise the bridge

```bash
cd dist/bridge/compose
docker compose up
```

Then open **`http://localhost:8080`**. Adminer's login screen arrives with the
server field pre-filled as `aggrega-gw:5432` (the rewritten
`ADMINER_DEFAULT_SERVER`). Choose system **PostgreSQL** and log in with the
demo credentials:

| Field | Value |
| --- | --- |
| System | PostgreSQL |
| Server | `aggrega-gw:5432` (pre-filled) |
| Username | `appuser` |
| Password | `apppass` |
| Database | `appdb` |

The connection travels `adminer → aggrega-gw:5432 → proxy_pass db:5432`,
crossing from the `frontend` network to the `backend` network through the
gateway — a real client reaching the database across the seam, not just a
correct-looking config.

The username, password, and database are **demo-only**, set inline on the db
recipe so the stack runs out of the box. A real deployment supplies database
credentials through the credential subsystem rather than inline values.
