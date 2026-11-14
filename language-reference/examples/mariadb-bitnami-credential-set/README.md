---
example:
  level: authoring
  tier: authoring
  position: 6
  products: [core/datastore/mariadb]
  shows: [credentials, catalog-authoring, external-sources]
---

# MariaDB (Bitnami chart) — one multi-key credential Secret

A single MariaDB database realized by the **Bitnami Helm chart**, whose
passwords are supplied by **one multi-key referenceable secret**
(`core/referenced-secret-set`).

The Bitnami chart authenticates from a single Kubernetes Secret named by
`auth.existingSecret`, and expects that Secret to carry fixed data keys —
`mariadb-root-password` and, when a custom user is set, `mariadb-password`
(a replication deployment adds `mariadb-replication-password`). There is no
knob to rename those keys; they are fixed by the chart.

Rather than have the database Recipe guess the Secret's name, the developer
attaches a multi-key credential that carries exactly those fixed keys, and the
Recipe reads the produced Secret's name from `.features.root_password.provides.name`.
The reference name and the generated Secret's `metadata.name` are one value —
there is no re-derivation and no convention for the two sides to agree on.

## Scaffold the example

You can build this example with the commands below, or [have your AI assistant build it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega scaffold --example mariadb-bitnami-credential-set
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd mariadb-bitnami-credential-set
```

## Build

```bash
aggrega build --release release.yaml --auto-pull
```

`--auto-pull` writes the lockfile a fresh clone lacks during the build.

The `mariadb-bitnami` Recipe resolves from this example's own local `catalog/`
copy — an enterprise-authored local sourced Recipe — while the
`core/datastore/mariadb` Component and the credential features resolve from
`hub.aggrega.ai`, the default registry `.aggrega-config.yaml` names; the local
`catalog/` is listed under `catalog_dirs` there. The Bitnami chart is pulled
from its OCI source.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `mariadb-bitnami-credential-set` folder yet, call the `scaffold` tool once with `example` set to `mariadb-bitnami-credential-set` and no `dir`: it writes the example into a new `mariadb-bitnami-credential-set` folder. Then call the `build` tool with `workspace_root` set to `mariadb-bitnami-credential-set`, `release` set to `release.yaml`, `auto_pull` set to true and `write` set to true. Tell me which files the build wrote; they are under `mariadb-bitnami-credential-set/dist/`.

## What the credential produces

The `db` component attaches `core/referenced-secret-set` to its required
`root_password` slot, supplying the chart's fixed key names as data. The
Manifest maps that credential to `k8s-secret-set`, which materializes one
Kubernetes Secret and publishes its name as `provides.name`:

```yaml
# dist/app/helm/db--root-zupassword--db-secret-db-root-password.yaml
[… omitted: the apiVersion and the Secret kind]
metadata:
  name: db-root-password
  [… omitted: the labels and annotations every rendered document carries]
stringData:
  mariadb-root-password: "dev-root-pw-change-me"
  mariadb-password: "dev-user-pw-change-me"
```

## What the chart references

The `mariadb-bitnami` Recipe wires `auth.existingSecret` from the slot's
published name, so the rendered StatefulSet mounts the **same** Secret the
credential produced — both sides read `.features.root_password.provides.name`:

```yaml
# dist/app/helm/db-statefulset-default-db-mariadb.yaml (credential volume)
- name: mariadb-credentials
  secret:
    secretName: db-root-password        # == the produced Secret's metadata.name
    items:
      - key: mariadb-root-password       # a fixed key the chart reads
        path: mariadb-root-password
      - key: mariadb-password
        path: mariadb-password
```

Because `auth.existingSecret` is set, the chart does not generate a Secret of
its own — the only Secret in the build is the one the credential produced.

## The single-key sibling

`core/referenced-secret` (see the `credential-secretkeyref` example) is the
single-key member of the same family: it wraps one caller-named data key and
publishes both the resource name and that key, for a consumer that references
one key by `secretKeyRef`. Use `core/referenced-secret-set` instead when the
consuming target reads a fixed set of keys from one Secret it names as a whole,
as the Bitnami chart does.
