# Catalog-only — MariaDB + Adminer with zero platform authoring

This example deploys a small, real stack — a **MariaDB** database with an
**Adminer** web UI in front of it — by referencing **standard-library catalog
entities only**. No Component, Feature, or Recipe is authored here: three
short YAML files route everything to entities the catalog already ships.

It is the smallest authoring surface Aggrega offers, and the natural first
contact with the language. The [Authoring-tier sibling](../mariadb-adminer/)
deploys the *same stack* while building its own catalog layer — read this
example first to see what a finished catalog buys you, then that one to learn
how the layer underneath is made.

## The three files

- **[`aggregate.yaml`](aggregate.yaml)** — the Developer's intent: *what*
  the stack is. Two components picked from the catalog by `type:`, a
  required credential in the `secrets:` pillar, and one `uses` edge wiring
  the database into Adminer's `databases` socket.
- **[`release.yaml`](release.yaml)** — the Operator's per-environment
  fulfillment: *how big and where*. The `infra:` blocks (engine version,
  storage size, published port) belong to the Operator; the Aggregate never
  carries them.
- **[`manifest.yaml`](manifest.yaml)** — the Operator's routing: *which
  Recipe realises each type on this target*. See below for why the
  references are provider-qualified.

## What it demonstrates

- **Components as catalog references.** `type: core/datastore/mariadb` and
  `type: core/devtool/adminer` are the entire compute declaration. The
  Developer authors only the values the Component schemas expose — every
  omitted field takes its schema default (compare the rendered output's
  charset and collation env vars with the one-line `values:` block that
  produced them).
- **The String Pipe.** Adminer's catalog Component declares a `databases`
  uses-socket accepting any component labeled
  `component.aggrega.ai/type=stateful-server`. The Aggregate's edge injects
  the database Recipe's `provides.host` into `ADMINER_DEFAULT_SERVER`. The
  compiler routes the string without interpreting it — on this target it is
  a compose service name; the same edge on a Kubernetes target would carry
  a Service DNS name.
- **The secrets pillar.** The database Component's `secretsSchema` requires
  a `root_password` slot, filled with the catalog's `core/secret-value`
  Feature. The slot is *black-box*: the FeatureRecipe selected by the
  Manifest controls delivery, and the Developer cannot dictate it.
- **Provider-qualified Recipe routing.** The Manifest maps
  `core/datastore/mariadb:1.0.0` to `compose/mariadb:1.0.0` — qualified by
  provider — because the standard library ships a mariadb Recipe under
  *four* providers (compose, helm, terraform, cloudformation). The
  Operator's mapping is what disambiguates the target: a bare
  `mariadb:1.0.0` would match all four and the build halts loudly rather
  than silently picking one. Re-target the stack by re-pointing these
  mappings; the Aggregate does not change.

## Build

From this directory, with a checkout of the standard-library catalog
available (in this repository layout it sits four levels up):

```bash
aggrega build --release release.yaml --catalog ../../../../aggrega-hub/aggrega-catalog
```

The build resolves every referenced entity, pins it in `release.lock`
(identity + content digest; regenerate a stale lockfile with
`aggrega pull --regenerate --release release.yaml`), and renders
`dist/app/compose/docker-compose.yaml`.

## Read the output

The rendered compose file is where the wiring becomes visible:

- the `web` service carries `ADMINER_DEFAULT_SERVER: db` — the database
  Recipe's `provides.host` (the compose service name) delivered through the
  uses edge;
- the same edge produced `depends_on: [db]` — topology, not just strings;
- the `db` service's `MARIADB_CHARACTER_SET_SERVER` and
  `MARIADB_COLLATION_SERVER` come from schema defaults the Aggregate never
  mentions;
- `image: mariadb:11.4` and the `8080:8080` port binding come from the
  Release's `infra:` blocks — the Operator's pillar, rendered next to the
  Developer's.

## Run

```bash
cd dist/app/compose
docker compose up -d
```

Open <http://localhost:8080>: the server field is pre-filled with `db`.
Log in as `root` with the development password from the Aggregate's
`secrets:` block (`dev-root-pw-change-me` — a placeholder to replace in
anything beyond local development), database `appdb`.

## Where next

The [Authoring tier](../mariadb-adminer/) builds this same platform layer
yourself — the Components, Recipes, and credential FeatureRecipes this
example consumed ready-made — and compiles one Aggregate to four targets.
