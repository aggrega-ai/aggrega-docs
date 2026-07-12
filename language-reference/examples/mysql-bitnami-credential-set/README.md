# MySQL (Bitnami chart) — one multi-key credential Secret

A single MySQL database realized by the **Bitnami Helm chart**, whose
passwords are supplied by **one multi-key referenceable secret**
(`core/referenced-secret-set`).

The Bitnami chart authenticates from a single Kubernetes Secret named by
`auth.existingSecret`, and expects that Secret to carry fixed data keys —
`mysql-root-password` and, when a custom user is set, `mysql-password`
(a replication deployment adds `mysql-replication-password`). There is no
knob to rename those keys; they are fixed by the chart.

Rather than have the database Recipe guess the Secret's name, the developer
attaches a multi-key credential that carries exactly those fixed keys, and the
Recipe reads the produced Secret's name from `.secrets.root_password.provides.name`.
The reference name and the generated Secret's `metadata.name` are one value —
there is no re-derivation and no convention for the two sides to agree on.

## Building

```bash
./build-release.sh
# equivalent: aggrega build --release release.yaml
```

The catalog entities resolve from the sibling hub catalog named in
`.aggrega-config.yaml`; the Bitnami chart is pulled from its OCI source.

## What the credential produces

The `db` component attaches `core/referenced-secret-set` to its required
`root_password` slot, supplying the chart's fixed key names as data. The
Manifest maps that credential to `k8s-secret-set`, which materializes one
Kubernetes Secret and publishes its name as `provides.name`:

```yaml
# dist/app/helm/secrets/root_password/db-secret-db-root-password.yaml
metadata:
  name: db-root-password
stringData:
  mysql-root-password: "dev-root-pw-change-me"
  mysql-password: "dev-user-pw-change-me"
```

## What the chart references

The `mysql-bitnami` Recipe wires `auth.existingSecret` from the slot's
published name, so the rendered StatefulSet mounts the **same** Secret the
credential produced — both sides read `.secrets.root_password.provides.name`:

```yaml
# dist/app/helm/db-statefulset-default-db-mysql.yaml (credential volume)
- name: mysql-credentials
  secret:
    secretName: db-root-password        # == the produced Secret's metadata.name
    items:
      - key: mysql-root-password         # a fixed key the chart reads
        path: mysql-root-password
      - key: mysql-password
        path: mysql-password
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
