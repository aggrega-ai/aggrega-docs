---
example:
  level: start
  products: [core/datastore/postgres]
  shows: [multi-target, credentials, guardrails]
---

# Credential delivery — `secretKeyRef` end-to-end

A single PostgreSQL database whose password is supplied by the credential
subsystem, shown per provider. The same `password` slot on
`core/datastore/postgres` accepts either credential family; the family the
developer attaches decides how the password is delivered, and the database
Recipe reads the slot the way its provider supports.

## Building

This example has three releases. Build one per run:

```bash
aggrega build --release release-helm.yaml --auto-pull
aggrega build --release release-compose.yaml --auto-pull
aggrega build --release release-negative.yaml --auto-pull   # expected to fail (see below)
```

Every release resolves its catalog entities through this workspace's
`.aggrega-config.yaml`, from the hub registry it names as the default, so no
`--catalog` flag is needed, and
`--auto-pull` writes the lockfile a fresh clone lacks during the build.

## Helm — a referenceable Secret + `secretKeyRef`

`aggregate-helm.yaml` attaches **`core/referenced-secret`** to the `password`
slot. The Manifest maps that to `k8s-secret-from-parameter`, which materializes a
Kubernetes Secret and publishes the Secret's identity as `provides {name, key}`.
The postgres helm Recipe references the slot through `containers.attachments`, which
the synthesizer renders as an env `secretKeyRef`.

```bash
aggrega build --release release-helm.yaml --auto-pull
```

The generated Secret (`dist/helm/helm/db--password--db-secret-db-password.yaml`) and the
database's `secretKeyRef` (`dist/helm/helm/db-statefulset.yaml`) name the **same**
resource, because both read `.features.password.provides.name` — there is no
re-derivation and no convention for the two sides to agree on:

```yaml
# db--password--db-secret-db-password.yaml
[… omitted: the apiVersion and the Secret kind]
metadata:
  name: db-password
  [… omitted: the labels and annotations every rendered document carries]
stringData:
  POSTGRES_PASSWORD: "dev-pw-change-me"

# db-statefulset.yaml (container env)
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-password        # == the Secret's metadata.name
      key: POSTGRES_PASSWORD    # == the Secret's data key
```

## Compose — an inject-value credential

`aggregate-compose.yaml` attaches **`core/secret-value`**. Compose has no
Secret-resource / `secretKeyRef` primitive, so the Manifest maps the credential
to `dotenv-secret`, which delivers the value on the inject pipe under the key the
attachment names in `values.key`, `POSTGRES_PASSWORD` here, and the postgres
compose Recipe reads it under that key.

```bash
aggrega build --release release-compose.yaml --auto-pull
# dist/compose/compose/docker-compose.yaml → POSTGRES_PASSWORD: dev-pw-change-me
```

## Negative — a non-referenceable fill rejected from a reference

`aggregate-negative.yaml` attaches the inject-value `core/secret-value` to the
`password` slot, then builds on **helm**, where the postgres Recipe references the
slot via `containers.attachments` (a `secretKeyRef`). A `secretKeyRef` needs a Secret
resource to point at, but an inject-value credential publishes none — so the build
halts loudly:

```bash
aggrega build --release release-negative.yaml --auto-pull
# [… omitted: the pull's lines, which carry the same halt, and two lint notices]
# [CATALOG_ERROR E0212] instance db
#   rendering node "db"
# [… omitted: the cause, "workload attachment slot is not referenceable", naming the Recipe and its path in your catalog, then one line each for the "name" and the "key" the slot's provides does not expose]
```

This release is expected to fail — the halt is the lesson. The build exits `1`
rather than reporting success, so the guardrail is visible to a reader and to
any script that runs it.

There are two fixes. Attach a referenceable credential (`core/referenced-secret`),
as in `aggregate-helm.yaml`; or keep the `core/secret-value` attachment and map it
in the Manifest to `k8s-secret-from-value`, the Helm realization of
`core/secret-value` that writes the value into a Secret it emits and publishes
that Secret's name and key, so the reference has a resource to point at. Bound to
`env-secret`, an inject-value credential reaches the container through the inject
pipe instead, never a `containers.attachments` reference.
