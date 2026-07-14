# PostgreSQL bootstrap scripts and custom configuration — synthesized helm

`core/datastore/postgres` exposes two optional developer values that shape the
database's first start: `init_scripts` (SQL or shell run once on initialization)
and `custom_config` (a `postgresql.conf` fragment). On the synthesized helm
target, the Recipe carries them into the container as mounted ConfigMaps. This
example shows the feature is **additive**: a deployment that sets neither value
renders exactly as a minimal database does, and a deployment that sets them gains
the ConfigMaps, volumes, and mounts with nothing else disturbed.

Two deployments of the same Component, same Manifest, differing only in the
developer values:

- **`release-bare.yaml`** (`aggregate-bare.yaml`) — `init_scripts` and
  `custom_config` unset.
- **`release-config.yaml`** (`aggregate-config.yaml`) — both set.

## Building

```bash
./build-release.sh bare      # release-bare.yaml
./build-release.sh config    # release-config.yaml
```

The catalog resolves from the sibling hub catalog named in `.aggrega-config.yaml`,
so no `--catalog` flag is needed. The bare release writes three files under
`dist/helm/helm/`; the configured release writes five.

## Bare — the additive baseline

`aggregate-bare.yaml` leaves both values unset. The rendered output is a
StatefulSet, a ClusterIP Service, and a Headless Service — no ConfigMap, no
`configmap` volume, no volume mount into the init directory, and no config-file
command override. This is the ordinary shape of a minimal PostgreSQL database:

```text
dist/helm/helm/db-statefulset.yaml
dist/helm/helm/db-default-service.yaml
dist/helm/helm/db-headless-service.yaml
```

Because both values are presence-guarded in the Recipe, an unset value emits
nothing — the ConfigMap body renders empty and is skipped, and the volume, mount,
and command lines are guarded out. A deployment that never touches these values
is unchanged by their existence.

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
StatefulSet. The two values ride in **separate** ConfigMaps because each mounts
whole into a different container path:

- `init_scripts` → ConfigMap `db-initdb`, one data key per script (`01-schema.sql`,
  `02-seed.sql`). A `configmap` volume mounts it at `/docker-entrypoint-initdb.d`,
  where PostgreSQL runs the files once on first initialization, in alphabetical
  key order.
- `custom_config` → ConfigMap `db-config`, one data key `postgresql.conf`. A
  second `configmap` volume mounts it at `/etc/postgresql`, and the container's
  command points the server at it: `postgres -c
  config_file=/etc/postgresql/postgresql.conf`. Settings the fragment omits keep
  their built-in defaults.

```yaml
# db-statefulset.yaml (container)
containers:
  - name: main
    image: postgres:16
    command:
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf
    volumeMounts:
      - name: data
        mountPath: /var/lib/postgresql/data
      - name: initdb
        mountPath: /docker-entrypoint-initdb.d
      - name: pgconf
        mountPath: /etc/postgresql
volumes:
  - name: initdb
    configMap:
      name: db-initdb
  - name: pgconf
    configMap:
      name: db-config
```

Setting only one of the two values is equally valid — the other's ConfigMap,
volume, and mount are simply absent, and the config-file command appears only
when `custom_config` is set.

## Compose

The Compose Recipe for `core/datastore/postgres` reads the same Component, but it
honors `init_scripts` and `custom_config` only on the helm-synth target. Compose
has no ConfigMap-equivalent primitive here, so a Compose deployment that sets
either value renders without it. Reach for the helm target when bootstrap scripts
or a custom `postgresql.conf` are required.
