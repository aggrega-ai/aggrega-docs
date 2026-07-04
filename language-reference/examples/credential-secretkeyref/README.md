# Credential delivery — `secretKeyRef` end-to-end

A single PostgreSQL database whose password is supplied by the credential
subsystem, shown per provider. The same `password` slot on
`core/datastore/postgres` accepts either credential family; the family the
developer attaches decides how the password is delivered, and the database
Recipe reads the slot the way its provider supports.

## Building

This example has three releases. Build one per run with the helper script, which
echoes the equivalent direct `aggrega build` command before running it:

```bash
./build-release.sh helm       # release-helm.yaml
./build-release.sh compose    # release-compose.yaml
./build-release.sh negative   # release-negative.yaml — expected to fail (see below)
```

The `helm` and `compose` releases resolve their catalog entities from the
configured/hub catalog, so no `--catalog` flag is needed. The commands shown per
provider below spell the invocation out in full for reference.

## Helm — a referenceable Secret + `secretKeyRef`

`aggregate-helm.yaml` attaches **`core/referenced-secret`** to the `password`
slot. The Manifest maps that to `k8s-secret-from-parameter`, which materializes a
Kubernetes Secret and publishes the Secret's identity as `provides {name, key}`.
The postgres helm Recipe references the slot through `containers.secrets`, which
the synthesizer renders as an env `secretKeyRef`.

```bash
aggrega build --release release-helm.yaml --catalog ../../../../aggrega-hub/aggrega-catalog
```

The generated Secret (`dist/helm/helm/secrets/password/secret.yaml`) and the
database's `secretKeyRef` (`dist/helm/helm/db-statefulset.yaml`) name the **same**
resource, because both read `.secrets.password.provides.name` — there is no
re-derivation and no convention for the two sides to agree on:

```yaml
# secrets/password/secret.yaml
metadata:
  name: "db-password"
stringData:
  "POSTGRES_PASSWORD": "dev-pw-change-me"

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
to `dotenv-secret`, which delivers the value on the inject pipe; the postgres
compose Recipe reads `.context.inject.env.POSTGRES_PASSWORD`.

```bash
aggrega build --release release-compose.yaml --catalog ../../../../aggrega-hub/aggrega-catalog
# dist/compose/compose/docker-compose.yaml → POSTGRES_PASSWORD: dev-pw-change-me
```

## Negative — a non-referenceable fill rejected from a reference

`aggregate-negative.yaml` attaches the inject-value `core/secret-value` to the
`password` slot, then builds on **helm**, where the postgres Recipe references the
slot via `containers.secrets` (a `secretKeyRef`). A `secretKeyRef` needs a Secret
resource to point at, but an inject-value credential publishes none — so the build
halts loudly:

```bash
aggrega build --release release-negative.yaml --catalog ../../../../aggrega-hub/aggrega-catalog
# halts: workload secret slot is not a referenceable secret
```

This release is expected to fail — the halt is the lesson. `./build-release.sh
negative` surfaces the compiler's raw non-zero exit code unchanged rather than
reporting success, so the guardrail is visible to a reader and to any wrapping
script:

```bash
./build-release.sh negative
# ... halts: workload secret slot is not a referenceable secret
# exit status: 1
```

The fix is to attach a referenceable credential (`core/referenced-secret`), as in
`aggregate-helm.yaml`. An inject-value credential reaches the container through
the inject pipe instead, never a `containers.secrets` reference.
