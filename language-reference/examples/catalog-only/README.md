---
example:
  level: start
  products: [core/datastore/mariadb, core/devtool/adminer]
  shows: [connections, credentials]
---

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

- **`aggregate.yaml`** — the Developer's intent: *what*
  the stack is. Two components picked from the catalog by `type:`, a
  required credential as a slot-filling attachment, and one `uses` edge wiring
  the database into Adminer's `databases` socket.
- **`release.yaml`** — the Operator's per-environment
  fulfillment: *how big and where*. The `infra:` blocks (engine version,
  storage size, published port) belong to the Operator; the Aggregate never
  carries them.
- **`manifest.yaml`** — the Operator's routing: *which
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
- **The attachment pillar.** The database Component's `featuresSchema` requires
  a `root_password` slot, filled with the catalog's `core/secret-value`
  Feature. The slot is *black-box*: the FeatureRecipe selected by the
  Manifest controls delivery, and the Developer cannot dictate it.
- **Provider-qualified Recipe routing.** The Manifest maps
  `core/datastore/mariadb:1.0.0` to `compose/mariadb:1.0.0` — qualified by
  provider — because the standard library ships a mariadb Recipe under
  more than one provider (compose and helm among them). The
  Operator's mapping is what disambiguates the target: a bare, unqualified
  reference that matches more than one provider's Recipe halts the build
  loudly rather than silently picking one. Re-target the stack by re-pointing
  these mappings; the Aggregate does not change.

## Build

From this directory, with the catalog entities resolved from `hub.aggrega.ai`,
the default registry `.aggrega-config.yaml` names:

```bash
aggrega pull --release release.yaml
aggrega build --release release.yaml
```

The pull resolves every referenced entity and pins it in `release.lock`
(identity + content digest; run it again to regenerate a stale lockfile).
With a checkout of the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs)), name its
`aggrega-catalog` directory with `--catalog` on both commands to read the entities from there.
The build reads that lockfile — without it, the build halts and names the two ways forward, the pull or `--auto-pull`
— and renders `dist/compose/docker-compose.yaml`. The Release authors its components
directly (no `boundaries:` block), so the compiler folds them into the
synthesized default scope and emits flat under `dist/` — one boundary, no
boundary-name segment in the path.

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
cd dist/compose
docker compose up -d
```

Open <http://localhost:8080>: the server field is pre-filled with `db`.
Log in as `root` with the development password from the Aggregate's
attachment (`dev-root-pw-change-me` — a placeholder to replace in
anything beyond local development), database `appdb`.

## Where next

The [Authoring tier](../mariadb-adminer/) builds this same platform layer
yourself — the Components, Recipes, and credential FeatureRecipes this
example consumed ready-made — and compiles one Aggregate to four targets.
