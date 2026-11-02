---
example:
  level: start
  products: [core/datastore/postgres]
  shows: []
---

# PostgreSQL bootstrap scripts and custom configuration — synthesized helm

`core/datastore/postgres` exposes two optional developer values that shape the
database's first start: `init_scripts` (SQL or shell run once on initialization)
and `custom_config` (a `postgresql.conf` fragment). On the synthesized helm
target, the Recipe carries them into the container as mounted ConfigMaps. This
example shows the feature is **additive**: an Aggregate that sets neither value
renders exactly as a minimal database does, and an Aggregate that sets them gains
the ConfigMaps, volumes, and mounts with nothing else disturbed.

Two Releases of the same Component, same Manifest, differing only in the
developer values:

- **`release-bare.yaml`** (`aggregate-bare.yaml`) — `init_scripts` and
  `custom_config` unset.
- **`release-config.yaml`** (`aggregate-config.yaml`) — both set.

## Building

```bash
aggrega build --release release-bare.yaml --auto-pull
aggrega build --release release-config.yaml --auto-pull
```

The catalog resolves from the hub registry named in `.aggrega-config.yaml`,
so no `--catalog` flag is needed, and `--auto-pull` writes the lockfile a fresh
clone lacks during the build. The bare release writes three files under
`dist/helm/helm/`; the configured release writes those three plus two more under
`dist/helm/helm/db/`.

## Bare — the additive baseline

`aggregate-bare.yaml` leaves both values unset. The rendered output is a
StatefulSet, a ClusterIP Service, and a Headless Service — no ConfigMap, no
`configmap` volume, no volume mount into the init directory, and no config-file
argument on the container. This is the ordinary shape of a minimal PostgreSQL
database:

```text
dist/helm/helm/db-statefulset.yaml
dist/helm/helm/db-default-service.yaml
dist/helm/helm/db-headless-service.yaml
```

Because both values are presence-guarded in the Recipe, an unset value emits
nothing — the ConfigMap body renders empty and is skipped, and the volume, mount,
and server-argument lines are guarded out. An Aggregate that never touches these
values is unchanged by their existence.

## Configured — scripts and configuration mounted

`aggregate-config.yaml` sets both values:

```yaml
values:
  init_scripts:
    01-schema.sql: |
      CREATE TABLE app_users ( ... );
    02-seed.sql: |
      INSERT INTO app_users (email) VALUES ('founder@example.com');
  custom_config: |
    max_connections = 200
    shared_buffers = 256MB
```

The build now writes two additional ConfigMaps and wires them into the
StatefulSet:

```text
dist/helm/helm/db/initdb-configmap.yaml
dist/helm/helm/db/config-configmap.yaml
```

Both sit under `db/`, the component's own name. The Recipe names them in its
`artifacts:` block, and a file named there carries the key its author wrote
rather than anything identifying the component — so the build writes it under the
component that declared it, and two components sharing one Recipe cannot land on
one path. The StatefulSet and the two Services are named by the target from the
component they belong to, so they stay at the boundary's own directory.

The two values ride in **separate** ConfigMaps because each mounts
whole into a different container path:

- `init_scripts` → ConfigMap `db-initdb`, one data key per script (`01-schema.sql`,
  `02-seed.sql`). A `configmap` volume mounts it at `/docker-entrypoint-initdb.d`,
  where PostgreSQL runs the files once on first initialization, in alphabetical
  key order.
- `custom_config` → ConfigMap `db-config`, one data key `postgresql.conf`. A
  second `configmap` volume mounts it at `/etc/postgresql`, and the container's
  `args:` point the server at it: `postgres -c
  config_file=/etc/postgresql/postgresql.conf`. Settings the fragment omits keep
  their built-in defaults.

```yaml
# db-statefulset.yaml (container)
containers:
  - name: main
    image: postgres:16
    args:
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf
    [… omitted: the container's port, environment and resources]
    volumeMounts:
      - name: data
        mountPath: /var/lib/postgresql/data
      - name: initdb
        mountPath: /docker-entrypoint-initdb.d
      - name: pgconf
        mountPath: /etc/postgresql
    [… omitted: the liveness and readiness probes]
volumes:
  - name: initdb
    configMap:
      name: db-initdb
  - name: pgconf
    configMap:
      name: db-config
```

Those server arguments arrive as `args:` rather than as `command:`, and the
difference decides whether the database comes up populated: `args:` supplies
arguments **to** the image's entrypoint, while `command:` **replaces** it. That
entrypoint is the startup script that creates the database on an empty data
directory, reads the `POSTGRES_*` environment, and runs the files under
`/docker-entrypoint-initdb.d`. Replacing it would start the server against the
mounted `postgresql.conf` and skip both the initialization and the bootstrap
scripts — the values the Aggregate set would render into the manifest and never
run.

Setting only one of the two values is equally valid — the other's ConfigMap,
volume, and mount are simply absent, and the config-file argument appears only
when `custom_config` is set.

## Compose

The Compose Recipe for `core/datastore/postgres` reads the same Component and
realizes both values through compose's own primitive: it renders top-level
`configs:` entries, and the service mounts each one as a file.

- `init_scripts` → one config per key, each mounted at its own filename under
  `/docker-entrypoint-initdb.d`. The image runs the files it finds there once, in
  filename order, and only when the data directory is empty — a database that
  already holds data is left untouched.
- `custom_config` → one config, mounted as the single file
  `/etc/postgresql/postgresql.conf`, with the same `postgres -c config_file=…`
  arguments pointing the server at it. Settings the fragment omits keep their
  built-in defaults.

Each half is presence-guarded here too, so an Aggregate that leaves one value
unset renders as though that key did not exist.

One setting is worth naming when writing a `custom_config` block for a compose
deployment: `listen_addresses` accepts local connections only by default, so a
block that omits it leaves the database unreachable from the other services on
the compose network.

The Manifest in this example routes `core/datastore/postgres` to the helm Recipe.
Building the same Aggregate on compose means a Manifest that routes it to
`compose/postgres` instead; the developer values are untouched.
