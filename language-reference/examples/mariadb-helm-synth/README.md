---
example:
  level: start
  products: [core/datastore/mariadb]
  shows: [credentials]
---

# MariaDB on Kubernetes — synthesized helm (StatefulSet), two-slot credentials

A single MariaDB database rendered on Kubernetes by the helm provider's Workload
synthesis — no external chart. The `core/datastore/mariadb` Component binds to the
`helm/mariadb` Recipe, which declares a `form: stateful` Workload; the helm provider
translates it into a **StatefulSet**, a **ClusterIP Service**, a **Headless
Service** (the StatefulSet's stable network identity), and a
**volumeClaimTemplate** for the data directory.

The example's purpose is MariaDB's **two-slot credential model** on the
synthesized helm target. The two password slots are delivered by different
mechanisms because the Component declares them differently, and the Recipe wires
each the way its slot demands.

## Building

```bash
aggrega build --release release.yaml --auto-pull
```

The catalog resolves from the hub registry named in `.aggrega-config.yaml`,
so no `--catalog` flag is needed, and `--auto-pull` writes the lockfile a fresh
clone lacks during the build. Four manifests land under `dist/helm/helm/`.

## root_password — Black-Box, delivered on the inject pipe

`root_password` is a **Black-Box** slot: the Component's `featuresSchema` declares
`inject: []`, so the Recipe controls delivery and the developer cannot dictate it.
The Aggregate attaches `core/secret-value`, which the Manifest maps to
`env-secret`. That FeatureRecipe puts the value on the component's inject pipe
under the chosen key, and the Recipe reads it as
`.context.inject.env.MARIADB_ROOT_PASSWORD`, emitting a plain container env var:

```yaml
# db-statefulset.yaml (container env)
- name: MARIADB_ROOT_PASSWORD
  value: dev-root-pw-change-me
```

A Black-Box slot is never referenced from a workload container's `attachments:` block, and no
Kubernetes Secret resource is generated for it — the value reaches the container
straight through the inject pipe.

## user_password — transparent, delivered as a Secret + `secretKeyRef`

`user_password` is a **transparent** slot (`inject: [env, file]`). The Aggregate
attaches `core/referenced-secret`, which the Manifest maps to
`k8s-secret-from-parameter`. That FeatureRecipe materializes a Kubernetes Secret
and publishes the Secret's identity as `provides {name, key}`. The Recipe
references the slot through `containers.attachments`, which the synthesizer renders as
an env `secretKeyRef`. The generated Secret and the container's reference name the
**same** resource because both read `.features.user_password.provides.name` — there
is no re-derivation and no convention for the two sides to agree on. The published
name normalizes underscores in the slot name to hyphens, so `user_password`
becomes the valid Kubernetes resource name `db-user-password`. The filename that
carries it is a separate derivation and reads differently: it prefixes the
component and the slot name as the attachment's own coordinates, encoded for a
filename alphabet that admits only lowercase letters and digits, so the
underscore appears there as an escape rather than as a hyphen.

```yaml
# db--user-zupassword--db-secret-db-user-password.yaml
[… omitted: the apiVersion and the Secret kind]
metadata:
  name: db-user-password
  [… omitted: the labels and annotations every rendered document carries]
stringData:
  MARIADB_PASSWORD: "dev-user-pw-change-me"

# db-statefulset.yaml (container env)
- name: MARIADB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-user-password    # == the Secret's metadata.name
      key: MARIADB_PASSWORD      # == the Secret's data key
```

Leaving `user_password` unattached is also valid: the Recipe falls back to an
inline development default (`MARIADB_PASSWORD: apppass`) and no Secret is
generated, so a minimal deployment still renders and runs.

## Operator sizing

`release.yaml` fulfills the operator-sizing pillar per environment: the container
image tag comes from `infra.engine_version` (`mariadb:11.4`), and the
volumeClaimTemplate's request and storage class come from `infra.storage`
(`5Gi`, `standard`). The developer's Aggregate never carries these fields.
