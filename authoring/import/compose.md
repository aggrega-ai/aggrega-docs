# Import a Compose project

This walkthrough imports a small Compose project — an API, the PostgreSQL
database it keeps its notes in and a Redis cache — and builds the result for
Docker Compose. The import drafts every file the build reads, with what the
Compose file states carried over: the API's connections to the database and the
cache, the database's user and name, the password as a variable reference, and
each image's tag. Every file and every block of output below comes from a real
run; the project and each stage of the walkthrough are in the
[import-compose](../../language-reference/examples/import-compose/README.md)
example, where a check script runs the import again, compares what it writes,
what it prints and the blocks this page quotes with the files kept there, and
validates and builds what the import wrote.

## Scaffold the example

Write the example into a new folder named after it:

```bash
aggrega scaffold --example import-compose
```

It then prints the commands to run next. The first changes into the new folder;
the one after it, below, changes into its `source` folder, which holds what this
page imports and is where the import runs:

```bash
cd import-compose
```

## The project

`compose.yaml`:

<!-- quotes: source/compose.yaml -->
```yaml
# A small notes service: its API, the PostgreSQL database it keeps the notes in,
# and the Redis cache in front of it.
name: notes

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
# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside compose.yaml.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import weighs each service against the Components of the workspace's
catalog, and `--target` drafts a Manifest from its Recipes. The workspace names
no catalog folder, so the import reads the standard-library catalog from the
registry it fetches its importer from: a signed snapshot of the published
catalog, fetched, verified and kept in the workspace's content cache by the
first import, and named by its digest in the record the import writes beside
its drafts. A workspace that names its own catalog folders — in
`AGGREGA_CATALOG_DIRS`, or under `workspace.catalog_dirs` — imports against
those instead.

### The answers file

A build for Docker Compose needs nothing the Compose file does not state, so
this import asks for nothing. A build of the same project for Kubernetes, with
`--target helm`, needs one value no Compose file holds: the name of the
Kubernetes Secret the database's password is read from, since a Kubernetes
build reads a password from a Secret rather than from your shell. The example
keeps that answer in `import-answers.yaml`, beside `compose.yaml`, where the
import looks for it:

<!-- quotes: source/import-answers.yaml -->
```yaml
# Values the import could not draft from the source, keyed by the drafted file and the key path inside
# it. Write each one beside its key; an import of the same source, and a sync, read them from here and
# ask nothing. A secret is never written here: its key asks where the secret comes from — a variable
# name, ${NAME}, or the name of a Kubernetes Secret.
release.yaml:
  # The origin of the secret value, written by the operator in the Release. Read exactly as
  # values.origin is. Write it here or in values.origin, never in both. A secret: name where it comes
  # from, never the value.
  spec.components.db.features.password.infra.origin: "notes-db-password"
```

The import wrote the file itself, the first time it was run with
`--target helm`: it listed the value it could not draft, with its key empty,
and stopped. The answer is a Secret's name, never the password. The import
for Docker Compose owes no such value, keeps the answer in the file, and does
not use it. [The import answers file](../../language-reference/import-answers.md)
describes the file, the questions an import asks at a terminal instead, and
what it does with neither.

[`aggrega import`](../../language-reference/cli/aggrega-import.md) lists
every flag the command takes, `--answers`, which names an answers file kept
elsewhere, among them.

Change into `source`:

```bash
cd source
```

## Run the import

<!-- quotes: import-command -->
```bash
aggrega import compose.yaml --target compose
```

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
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
warn: the value of environment.POSTGRES_USER of node db is carried as written in the drafts: its format marks the field as no credential, though it can carry one, and setting empty_credentials to all writes it empty
warn: the value of environment.POSTGRES_DB of node db is carried as written in the drafts: its format marks the field as no credential, though it can carry one, and setting empty_credentials to all writes it empty
mapped api (ghcr.io/example/notes-api) to core/compute/server as a reference, NONE
mapped db (postgres) to core/datastore/postgres as a reference, HIGH at 0.9
mapped cache (redis) to core/datastore/redis as a reference, HIGH at 0.9
Pull complete: <workspace>/release.lock (entities=10, source_artifacts=0, external_inputs=0)
```

- **The `warn` lines** name each value the drafts carry as written, by its
  service and its variable and never by its value: Compose marks no value as
  a credential, and any of them could carry one. Here neither does. The
  variables the API reads from another service are not carried as values at
  all — the connections deliver them — and the two that read
  `${POSTGRES_PASSWORD}` are a variable reference and nothing else, so no
  warning names them.
- **The `mapped` lines** say what each service became. `api` runs an image of
  its own, so it is an instance of the standard library's generic server,
  `core/compute/server`. `db` and `cache` run the images the standard library's
  Compose Recipes run for `core/datastore/postgres` and `core/datastore/redis`;
  each matched that Component in the high tier, at 0.9, and the drafts reference
  it.
- **The `Pull complete` line** is the import fetching what the drafted Release
  depends on, as [`aggrega pull`](../../language-reference/cli/aggrega-pull.md)
  does, into `release.lock`, so the drafts validate and build at once. Under
  `--offline` the import pulls nothing and names the `aggrega pull` to run.

## What it wrote

The Aggregate, the Release and the Manifest are named `imported/notes`, after the
Compose project's `name:` — a Compose file with no `name:` is named after its
file, `compose`, and the directory holding it, imported as a directory, after
that directory, as Compose names a project — under the namespace the importer's
`target_namespace` setting sets, `imported` unless you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — one entry per service, the connections the API's environment
draws, and the values and the passwords the Compose file sets:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# Not carried, since the draft reads the services and the models alone: volumes.
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/notes
  version: 0.1.0
  description: Draft Aggregate imported from a source in the compose format.
spec:
  components:
    api:
      type: core/compute/server
      features:
        # For the compose target, the lines below declare database_password on api: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
        database_password:
          type: core/secret-value
          values:
            key: DATABASE_PASSWORD
      uses:
        cache:
          cache:
            target: cache
            # The variables the source sets to what cache publishes, delivered from it under the names the source gives them.
            inject:
              env:
                - in: "CACHE_HOST"
                  from: host
        db:
          db:
            target: db
            # The variables the source sets to what db publishes, delivered from it under the names the source gives them.
            inject:
              env:
                - in: "DATABASE_HOST"
                  from: host
                - in: "DATABASE_USER"
                  from: user
                - in: "DATABASE_NAME"
                  from: database
    db:
      type: core/datastore/postgres
      # The values of core/datastore/postgres the source sets as POSTGRES_USER, POSTGRES_DB, the variables its Compose Recipes set from them.
      values:
        user: "notes"
        database: "notes"
      features:
        # For the compose target, the lines below declare password on db: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
        password:
          type: core/secret-value
          values:
            key: POSTGRES_PASSWORD
    cache:
      type: core/datastore/redis
```

Each variable of the API that names another service becomes that connection's
`inject` block: the Compose file set `DATABASE_HOST` to `db`, and the
connection delivers the database's published `host` under that name, so it
follows the database on any target rather than being copied. `DATABASE_USER`
and `DATABASE_NAME` matched the user and the database the PostgreSQL service is
created with, so they are delivered from what it publishes too, and those two
values become the database's own `values`. Each password becomes a
`core/secret-value` attachment, declared with the key its variable is read
under.

`release.yaml` — the environment, the API's image and port, each datastore's
engine version, and where each password comes from:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/notes
  # environment is a drafted default, since no source names the environment this Release deploys to; change it to name the one it deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the compose format.
spec:
  aggregate: imported/notes
  manifest: imported/notes
  components:
    # The source also states, for the Release to carry where core/compute/server takes it:
    #   ports:
    #     - "8080:8080"
    api:
      infra:
        image: "ghcr.io/example/notes-api:2.3.0"
        port: 8080
      features:
        database_password:
          type: core/secret-value
          infra:
            # Attached by reference, never as a value: the value api reads as DATABASE_PASSWORD, read from the variable POSTGRES_PASSWORD, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
            origin: "${POSTGRES_PASSWORD}"
    # The source states, for the Release to carry where core/datastore/postgres takes it:
    #   volumes:
    #     - "db-data:/var/lib/postgresql/data"
    db:
      infra:
        # The tag of the image the source runs, postgres:16, the engine_version of core/datastore/postgres its Compose Recipes run.
        engine_version: "16"
      features:
        password:
          type: core/secret-value
          infra:
            # Attached by reference, never as a value: the password of db, which the source sets as POSTGRES_PASSWORD, read from the variable POSTGRES_PASSWORD, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
            origin: "${POSTGRES_PASSWORD}"
    cache:
      infra:
        # The tag of the image the source runs, redis:7, the engine_version of core/datastore/redis its Compose Recipes run.
        engine_version: "7"
```

The environment, `development`, is a default the import writes because no
Compose file names one; change it where the Release deploys elsewhere. The
image tags become the engine versions the standard-library Components take.
What no key takes stays a comment above its entry: the published port, which
the server's `port` already carries, and the database's named volume.

`manifest.yaml` — the Compose Recipe of each component type, and the
realization that writes a password's variable reference into the Compose file
as written:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/notes
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/compute/server: compose/server
        core/datastore/postgres: compose/postgres
        core/datastore/redis: compose/redis
    features:
      type:
        core/secret-value: compose/dotenv-secret
```

`release.lock` records the catalog entities the Release resolved to, by
digest, and `.aggrega-import.json` is the record of what the import wrote,
which a later `aggrega import --sync` reads.

## Validate and build

```bash
aggrega validate --release release.yaml
aggrega build --release release.yaml
```

The validation prints:

```text
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

and the build, with `<workspace>` standing for the folder you ran it in:

```text
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 file written to <workspace>/dist
```

The `notice` line is advisory: the password Feature accepts its `origin` from
the Aggregate's `values` or the Release's `infra`, and the notice reports that
one leaf is declared in both. It changes no verdict.

The `api` service in `dist/compose/docker-compose.yaml` reads the environment
the Compose project gave it, delivered by the connections and the password
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

and the database and the cache run the images the Compose file named:

```yaml
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: notes
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: notes
    [… omitted: the labels, the network and a health check running PostgreSQL's pg_isready]
```

```yaml
  cache:
    image: redis:7
    [… omitted: the labels, the network and a health check running redis-cli ping]
```

Two differences from the project you started with show in the rendered file.
The port is published on the loopback address alone, as the generic server's
Compose Recipe publishes it. And the named volume the Compose file mounted for
the database's data appears nowhere: the draft lists it in a comment above the
database's entry, no key of the PostgreSQL Component takes it, and the
rendered database service mounts no volume.

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

Build again with the change. The Release no longer matches the `release.lock`
the import wrote, so the build needs `--auto-pull`, which resolves it again;
without it the build stops and names `aggrega pull`. Docker Compose fills both
`${POSTGRES_PASSWORD}` references from your shell, so set the password before
you start the stack: left unset, Compose warns
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

It changes only what the import wrote, and reads the same answers file. A part
the source left alone stays as it is on disk, edited or not; where the source
changed a part you edited, it stops, names the part, and writes nothing, for
you to reconcile by hand. [aggrega import](../../language-reference/cli/aggrega-import.md)
describes the rules and every flag in full.
