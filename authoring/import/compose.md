# Import a Compose project

This walkthrough imports a small Compose project — an API, the PostgreSQL
database it keeps its notes in and a Redis cache — reviews what the import
drafts, and builds the result for Docker Compose. Every file and every block of
output below comes from a real run; the project and each stage of the
walkthrough are in the
[import-compose](../../language-reference/examples/import-compose/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## The project

`compose.yaml`:

<!-- quotes: source/compose.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# A small notes service: its API, the PostgreSQL database it keeps the notes in,
# and the Redis cache in front of it.
services:
  api:
    image: ghcr.io/example/notes-api:2.3.0
    ports:
      - "8080:8080"
    environment:
      DATABASE_HOST: db
      DATABASE_USER: notes
      DATABASE_NAME: notes
      DATABASE_PASSWORD: ${POSTGRES_PASSWORD}
      CACHE_HOST: cache
    depends_on:
      - db
      - cache
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: notes
      POSTGRES_DB: notes
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - db-data:/var/lib/postgresql/data
  cache:
    image: redis:7

volumes:
  db-data:
```

Beside it, an `.aggrega-config.yaml` makes the folder a workspace, so the import
writes its drafts there:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside compose.yaml.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import weighs each service against the Components of the workspace's
catalog, and `--target` drafts a Manifest from its Recipes, so name a checkout
of the standard-library catalog ([where to get one](README.md#how-an-import-runs)), by its absolute
path:

```bash
export AGGREGA_CATALOG_DIRS=/path/to/aggrega-catalog
```

## Run the import

<!-- quotes: import-command -->
```bash
aggrega import compose.yaml --target compose
```

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
wrote components/imported-datastore-postgres.yaml
wrote components/imported-datastore-redis.yaml
wrote aggregate.yaml
wrote release.yaml
wrote manifest.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

<!-- quotes: draft/import.txt -->
```text
[… omitted: a warning that the importer runs unverified, printed where its module is read from beside its Plugin entity in a catalog folder rather than fetched]
read as the compose format, with drafted paths relative to <workspace>
warn: the value of environment.DATABASE_HOST of node api is carried as written in the Release the draft writes: its format marks the field as no credential, though it can carry one, and setting empty_credentials to all writes it empty
warn: the value of environment.DATABASE_USER of node api is carried as written in the Release the draft writes: its format marks the field as no credential, though it can carry one, and setting empty_credentials to all writes it empty
warn: the value of environment.DATABASE_NAME of node api is carried as written in the Release the draft writes: its format marks the field as no credential, though it can carry one, and setting empty_credentials to all writes it empty
warn: the value of environment.CACHE_HOST of node api is carried as written in the Release the draft writes: its format marks the field as no credential, though it can carry one, and setting empty_credentials to all writes it empty
warn: the value of environment.POSTGRES_USER of node db is carried as written in the Release the draft writes: its format marks the field as no credential, though it can carry one, and setting empty_credentials to all writes it empty
warn: the value of environment.POSTGRES_DB of node db is carried as written in the Release the draft writes: its format marks the field as no credential, though it can carry one, and setting empty_credentials to all writes it empty
warn: the drafted Manifest leaves the component type "imported/datastore/postgres" unmapped: no Recipe in the workspace's catalog binds to the target "compose" and implements it, so a build of the drafts halts naming each instance of it until a mapping is added
warn: the drafted Manifest leaves the component type "imported/datastore/redis" unmapped: no Recipe in the workspace's catalog binds to the target "compose" and implements it, so a build of the drafts halts naming each instance of it until a mapping is added
mapped api (ghcr.io/example/notes-api) to core/compute/server as a reference, NONE
mapped db (postgres) to imported/datastore/postgres as a draft, HIGH at 0.9
mapped cache (redis) to imported/datastore/redis as a draft, HIGH at 0.9
```

Three kinds of line are worth reading before the files:

- **The `warn` lines about values** name every environment value that holds
  something, by its service and its variable and never by its value: Compose
  marks no value as a credential, and any of them could carry one. Here none
  does. The two values that read `${POSTGRES_PASSWORD}` are a variable reference
  and nothing else, so they hold no value of their own, and no warning names
  them.
- **The `mapped` lines** say what each service became. `api` runs an image of
  its own, so it is an instance of the standard library's generic server,
  `core/compute/server`. `db` and `cache` run images the standard library's
  Compose Recipes run for `core/datastore/postgres` and `core/datastore/redis`;
  each matched that Component in the high tier, at 0.9, and was drafted as a
  Component of its own all the same, because by default an import suggests and
  you choose.
- **The `warn` lines about the Manifest** say which component types it could not
  map: no Recipe in the catalog realizes a Component the import has just
  drafted.

## What it wrote

`aggregate.yaml` — one entry per service, and one connection per service a
service's `depends_on` names, each under an alias of its own, the name of the
service it reaches:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# Not carried, since the draft reads the services and the models alone: volumes.
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the compose format.
spec:
  components:
    api:
      type: core/compute/server
      uses:
        cache:
          cache:
            target: cache
        db:
          db:
            target: db
    db:
      type: imported/datastore/postgres
    cache:
      type: imported/datastore/redis
```

`release.yaml` — what each service states for its operation, as keys where a
key takes it and as comments where none does:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the compose format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    # The source also states, for the Release to carry where core/compute/server takes it:
    #   ports:
    #     - "8080:8080"
    #   environment:
    #     DATABASE_HOST: "db"
    #     DATABASE_USER: "notes"
    #     DATABASE_NAME: "notes"
    #     DATABASE_PASSWORD: "${POSTGRES_PASSWORD}"
    #     CACHE_HOST: "cache"
    api:
      infra:
        image: "ghcr.io/example/notes-api:2.3.0"
        port: 8080
    # The source states, for the Release to carry where imported/datastore/postgres takes it:
    #   image: "postgres:16"
    #   volumes:
    #     - "db-data:/var/lib/postgresql/data"
    #   environment:
    #     POSTGRES_USER: "notes"
    #     POSTGRES_DB: "notes"
    #     POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
    db:
      infra: {}
    # The source states, for the Release to carry where imported/datastore/redis takes it:
    #   image: "redis:7"
    cache:
      infra: {}
```

`manifest.yaml` — the one type the catalog has exactly one Compose Recipe for:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/compute/server: compose/server
```

`components/imported-datastore-postgres.yaml`, and its Redis twin, which differs
only in its names:

<!-- quotes: draft/components/imported-datastore-postgres.yaml -->
```yaml
# resembles core/datastore/postgres (score 0.9000); reference it by setting type: core/datastore/postgres
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: imported/datastore/postgres
  version: 0.1.0
  labels:
    component.aggrega.ai/type: resource
    component.aggrega.ai/category: datastore
spec: {}
```

`.aggrega-import.json` is the record of what the import wrote, which a later
`aggrega import --sync` reads.

## Review

Validate the draft as it stands:

```bash
aggrega validate --release release.yaml
```

```text
[OPS_ERROR E0215] release.yaml
  document envelope validation failed (Release, at release.yaml); 3:1: metadata.environment: missing required property: environment. correct the document to match its kind's schema
```

Each refusal names the document and the key it is about. With the environment
set, the next is the drafted PostgreSQL Component:

```text
[E0114]
  resolve: no entity in the catalog matches this URI: entity "imported/datastore/postgres" (referenced from aggregate.spec.components.db.type)
  note: local entities are read from `catalog/` at the workspace root and from every directory .aggrega-config.yaml lists under `workspace.catalog_dirs`. The workspace root itself holds 3 documents declaring an entity kind, and the root is read only while it is listed there. Put the entity under `catalog/`, or list the directory holding it under `workspace.catalog_dirs`.
```

The drafted Components sit in `components/`, which the workspace's catalog does
not read, and each is an empty Component no Recipe realizes. The comment at the
top of each says what to do instead, and that is the review's first change:

- **Reference the Components the hints name.** `db` becomes
   `core/datastore/postgres` and `cache` becomes `core/datastore/redis`, and
   `components/` is deleted. The Compose file's `POSTGRES_USER` and `POSTGRES_DB`
   become the Component's `user` and `database` values.

With that change made, validate reports two refusals at once:

```text
  [OPS_ERROR E0099] .spec.components.db
    no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type (Manifest, at .spec.components.db, "db", of type "core/datastore/postgres", recipes implementing it "cloudformation/postgres-rds:1.0.0, compose/postgres:1.0.0, helm/postgres-cloudnative-pg:1.0.0, helm/postgres-external:1.0.0, helm/postgres:1.0.0, terraform/postgres-cloud-sql:1.0.0, terraform/postgres-flexible-server:1.0.0, terraform/postgres-rds-terraform-aws-modules:1.0.0, terraform/postgres-rds:1.0.0"). pin one of them in the Manifest
  [OPS_ERROR E0099] .spec.components.cache
    no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type (Manifest, at .spec.components.cache, "cache", of type "core/datastore/redis", recipes implementing it "cloudformation/redis-elasticache:1.0.0, compose/redis:1.0.0, helm/redis:1.0.0, terraform/redis-azure-managed:1.0.0, terraform/redis-elasticache:1.0.0"). pin one of them in the Manifest
release dependency validation failed: 2 diagnostic(s)
```

The rest of the review answers them, and carries what the Compose file stated:

- **Deliver the environment through the connections.** The API reads
   `DATABASE_HOST`, `DATABASE_USER`, `DATABASE_NAME` and `CACHE_HOST`. Rather
   than copying the values the Compose file wrote, each connection's `inject`
   block delivers them from what the database and the cache publish, so they
   follow the realization on any target. The password, a variable reference,
   becomes a `core/secret-value` attachment on each end reading the same
   `${POSTGRES_PASSWORD}`, which Docker Compose fills from your shell.
- **Fill the Release.** It names its environment, `development`, and carries
   each image's tag as the engine version the standard-library Component takes.
- **Map the Manifest.** The two types the review chose map to their Compose
   Recipes, and the password attachments to the realization that writes their
   variable reference into the Compose file as written.

The reviewed `aggregate.yaml`:

<!-- quotes: reviewed/aggregate.yaml -->
```yaml
# The draft aggregate.yaml after review. Each change is marked "Reviewed:".
# Not carried, since the draft reads the services and the models alone: volumes.
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the compose format.
spec:
  components:
    api:
      type: core/compute/server
      # Reviewed: the password the API signs in with, read from the same
      # variable the Compose file read it from. Docker Compose fills it from
      # your shell when the stack starts, so no file carries the password.
      features:
        database_password:
          type: core/secret-value
          values:
            key: DATABASE_PASSWORD
            origin: "${POSTGRES_PASSWORD}"
      uses:
        cache:
          cache:
            target: cache
            # Reviewed: the cache's address, under the name the API reads.
            inject:
              env:
                - in: CACHE_HOST
                  from: host
        db:
          db:
            target: db
            # Reviewed: the database's address, user and name, under the names
            # the API reads, each filled from what the database publishes.
            inject:
              env:
                - in: DATABASE_HOST
                  from: host
                - in: DATABASE_USER
                  from: user
                - in: DATABASE_NAME
                  from: database
    db:
      # Reviewed: the standard library's PostgreSQL, as the hint in the drafted
      # Component suggested, with the user and database the Compose file named.
      type: core/datastore/postgres
      values:
        user: notes
        database: notes
      features:
        password:
          type: core/secret-value
          values:
            key: POSTGRES_PASSWORD
            origin: "${POSTGRES_PASSWORD}"
    cache:
      # Reviewed: the standard library's Redis, as the hint suggested.
      type: core/datastore/redis
```

The reviewed `release.yaml`:

<!-- quotes: reviewed/release.yaml -->
```yaml
# The draft release.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # Reviewed: the environment this Release deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the compose format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    # Reviewed: the environment the source stated is now delivered by the edges
    # and the password attachment in the Aggregate; the port is infra.port.
    api:
      infra:
        image: "ghcr.io/example/notes-api:2.3.0"
        port: 8080
    # Reviewed: the image's tag is the database's engine version. The user, the
    # database and the password are set in the Aggregate.
    db:
      infra:
        engine_version: "16"
    # Reviewed: the image's tag is the cache's engine version.
    cache:
      infra:
        engine_version: "7"
```

The reviewed `manifest.yaml`:

<!-- quotes: reviewed/manifest.yaml -->
```yaml
# The draft manifest.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/compute/server: compose/server
        # Reviewed: the Compose Recipes of the two types the review chose.
        core/datastore/postgres: compose/postgres
        core/datastore/redis: compose/redis
    # Reviewed: the realization that writes a password's variable reference
    # into the Compose file as written.
    features:
      type:
        core/secret-value: compose/dotenv-secret
```

## Validate and build

```bash
aggrega validate --release release.yaml
aggrega build --release release.yaml --auto-pull
```

The validation prints:

```text
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

and the build, with `<workspace>` standing for the folder holding the reviewed
files:

```text
Pull complete: release.lock (entities=9, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 files written to <workspace>/dist
```

The `notice` line is advisory: the password Feature accepts its `origin` from
the Aggregate's `values` or the Release's `infra`, and the notice reports that
one leaf is declared in both. It changes no verdict.

The `api` service in `dist/compose/docker-compose.yaml` reads the environment
the Compose project gave it, now delivered by the connections and the password
attachment:

```yaml
  api:
    image: ghcr.io/example/notes-api:2.3.0
    environment:
      CACHE_HOST: cache
      DATABASE_HOST: db
      DATABASE_NAME: notes
      DATABASE_PASSWORD: ${POSTGRES_PASSWORD}
      DATABASE_USER: notes
    ports:
      - 127.0.0.1:8080:8080
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    networks:
      - compose
    depends_on:
      - cache
      - db
    [… omitted: the CPU and memory the server's defaults reserve]
```

Two differences from the project you started with are the review's to weigh,
and both show in the rendered file. The port is published on the loopback
address alone, as the generic server's Compose Recipe publishes it. And the
named volume the Compose file mounted for the database's data appears nowhere:
the draft listed it in a comment for the Release to carry where the Component
takes it, this review carried it nowhere, and the rendered database service
mounts no volume.

## Run it

`ghcr.io/example/notes-api:2.3.0` stands for your own API's image. It is a
placeholder, and Docker Compose stops on it with
`Error Head "https://ghcr.io/v2/example/notes-api/manifests/2.3.0": denied`. Name your
API's image in `infra.image` of `api` in `release.yaml`. Until your API is
ready, an image that answers HTTP on port 8080 can stand in for it. The run
below used `mendhak/http-https-echo:39`, which answers every request with a
description of the request it received:

```yaml
    api:
      infra:
        image: "mendhak/http-https-echo:39"
        port: 8080
```

Build again with the change. Docker Compose fills both `${POSTGRES_PASSWORD}`
references from your shell, so set the password before you start the stack:
left unset, Compose warns
`The "POSTGRES_PASSWORD" variable is not set. Defaulting to a blank string.`
and writes an empty value in its place.

```bash
aggrega build --release release.yaml --auto-pull
export POSTGRES_PASSWORD='a password of your own'
docker compose -p notes -f dist/compose/docker-compose.yaml up -d --wait
```

`-p` names the project, as the run step of
[How an import runs](README.md#how-an-import-runs) explains. `--wait` returns
once the database and the cache pass the health checks the build gives them
and the API's container is running: the build gives the API no health check.

Ask the API at the address the rendered service above publishes:

```bash
curl -sS http://127.0.0.1:8080/notes
```

```text
{
  "path": "/notes",
  "headers": {
    "host": "127.0.0.1:8080",
    [… omitted: the user agent and the media types the client sent]
  },
  "method": "GET",
  [… omitted: the rest of the request as the stand-in received it, the client's address and the container's host name]
}
```

What the connections deliver is in the API service's environment, under the
names your API reads:

```bash
docker compose -p notes -f dist/compose/docker-compose.yaml exec api printenv DATABASE_HOST DATABASE_USER DATABASE_NAME CACHE_HOST
```

```text
db
notes
notes
cache
```

Stop the stack with:

```bash
docker compose -p notes -f dist/compose/docker-compose.yaml down
```

## When the Compose file changes

Keep `.aggrega-import.json` beside the drafts, and after the Compose file
changes run:

```bash
aggrega import compose.yaml --sync
```

It changes only what the import wrote. A part the source left alone stays as
it is on disk, edited or not; where the source changed a part you edited, it
stops, names the part, and writes nothing, for you to reconcile by hand. [aggrega import](../../language-reference/cli/aggrega-import.md)
describes the rules in full.
