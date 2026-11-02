---
example:
  level: authoring
  products: [core/datastore/postgres]
  shows: [multi-target, recipe-selection, credentials]
---

# One developer intent, two credential delivery shapes

How a credential reaches a running container is a property of **where you
deploy**, not of the application. One cluster has no secret store, so the
deployment ships the material itself in a Kubernetes Secret. Another runs a
secret-store operator, so the deployment ships only a pointer and the cluster
fetches the material at reconcile time.

This workspace holds **one** Aggregate and builds it for **two** targets. The
Aggregate does not change between them. Neither does the database's reference to
its password. What changes is one line in a Manifest.

## What moves, and what is held still

| file | local target | store target |
| --- | --- | --- |
| `aggregate.yaml` | the same file | the same file |
| Manifest | `manifest-local.yaml` | `manifest-store.yaml` |
| Release | `release-local.yaml` | `release-store.yaml` |

The two Manifests differ in their own name and in one mapping entry:

```console
$ diff manifest-local.yaml manifest-store.yaml
7c7
<   name: credential-shape-local-manifest
---
>   name: credential-shape-store-manifest
16c16
<         core/referenced-secret:1.0.0: helm/k8s-secret-from-parameter:1.0.0
---
>         core/referenced-secret:1.0.0: helm/k8s-external-secret:1.0.0
```

The two Releases differ in their own name and in which Manifest they point at:

```console
$ diff release-local.yaml release-store.yaml
7c7
<   name: credential-shape-local
---
>   name: credential-shape-store
12c12
<   manifest: credential-shape-local-manifest
---
>   manifest: credential-shape-store-manifest
```

Both Releases declare the same `environment`. That is deliberate: the
environment name is stamped onto every rendered document as a label, so holding
it still leaves exactly one thing free to move — the FeatureRecipe the Manifest
binds. A real pair of Releases would of course name their own environments,
and the credential shapes would differ in exactly the same way.

## The developer's side, once

`aggregate.yaml` fills both of the PostgreSQL Component's credential slots with
the same referenceable credential Feature:

```yaml
features:
  password:
    type: core/referenced-secret
    values:
      key: POSTGRES_PASSWORD
      origin: postgres-superuser-password
  app_user_password:
    type: core/referenced-secret
    values:
      key: APP_USER_PASSWORD
      origin: postgres-app-password
```

`core/referenced-secret` names a secret **resource**, one its FeatureRecipe's output
creates or one that already exists, and publishes that resource's locator — its
`name` and the data `key` within it — through its `provides` contract. The
consuming Recipe reads that locator. It never derives a resource name of its own,
and it never asks which FeatureRecipe produced it.

## What each target emits

Each build writes six files. Four of them — the StatefulSet, both Services and
the initialization ConfigMap — come out byte-identical from both targets. The
other two are the credential resources, one per filled slot, and they are where
the targets differ.

**Local target**, from `k8s-secret-from-parameter`, at
`dist/helm/helm/db--password--db-secret-db-password.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-password
  [… omitted: the labels and annotations naming the aggregate, component, environment, compiler and provider versions, boundary and Recipe — the same set every rendered document carries]
stringData:
  POSTGRES_PASSWORD: "postgres-superuser-password"
```

**Store target**, from `k8s-external-secret`, at
`dist/helm/helm/db--password--db-externalsecret-db-password.yaml`:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: db-password
  [… omitted: the same label and annotation set as above]
spec:
  refreshInterval: "1h"
  secretStoreRef:
    name: platform-secret-store
    kind: ClusterSecretStore
  target:
    name: db-password
    creationPolicy: Owner
  data:
    - secretKey: POSTGRES_PASSWORD
      remoteRef:
        key: "postgres-superuser-password"
```

Different API group, different kind, different body. On the local target the
credential material is in the rendered document, readable by anyone who can read
the deployment — which is why that shape suits local and development clusters
rather than a production one. On the store target the rendered document carries
only the entry name; the material stays in the store and the operator reconciles
it into a Secret named `db-password`.

Comparing the two output trees shows the difference and shows where it stops
(the Build section below has the commands that produce `local/` and `store/`):

```console
$ diff -r local store
Only in store/helm/helm: db--app-zuuser-zupassword--db-externalsecret-db-app-user-password.yaml
Only in local/helm/helm: db--app-zuuser-zupassword--db-secret-db-app-user-password.yaml
Only in store/helm/helm: db--password--db-externalsecret-db-password.yaml
Only in local/helm/helm: db--password--db-secret-db-password.yaml
```

Four lines, all in one directory, because an attachment's files sit beside the
component's own on this target rather than in a subdirectory. The filename is
what carries the two coordinates: `db--password--` is the `password` attachment
on `db`, and `db--app-zuuser-zupassword--` is the `app_user_password` one — the
underscore encoded as `-zu`, because the coordinate and the file's own name share
one string here.

Four lines, and nothing else: two credential resources present only in the local
target's tree, two present only in the store target's. `diff -r` reports no
content difference in any file the two trees share, so the four common documents
are identical rather than merely similar.

## The reference that does not move

The database container reads both credentials as environment variables backed by
a `secretKeyRef`. This block is byte-identical in both targets:

```yaml
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-password
      key: POSTGRES_PASSWORD
- name: APP_USER_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-app-user-password
      key: APP_USER_PASSWORD
```

It is identical because the consuming Recipe does not branch. It asks the slot
for its published `name` and `key` and writes them out. Both FeatureRecipes
publish the same two keys because the Feature declares them, so either one
satisfies the consumer — and on the store target the reference resolves once the
operator has reconciled the ExternalSecret into a Secret under that name.

**This invariance is what makes the two shapes substitutable.** If the consuming
side had derived the Secret name itself, swapping the binding would have left it
pointing at a resource that no longer existed under that name.

## `origin` means what the FeatureRecipe says it means

`core/referenced-secret` declares `origin` as where the material comes from, and
leaves its interpretation to the FeatureRecipe:

- `k8s-secret-from-parameter` writes it into the Secret as the material.
- `k8s-external-secret` reads it as the key to fetch from the store.

The compiler pipes the string through unchanged; it is agnostic to which of those a
given string is. That is what lets one attachment serve both shapes with no edit
on the developer's side — and it is the thing to check before swapping a
binding, because the same authored string has to be meaningful to whichever
FeatureRecipe reads it.

## The published name, and the underscore in a slot name

The Component names its second credential slot `app_user_password`. A Kubernetes
object name may not contain an underscore, so the published `provides.name`
normalizes underscores to hyphens, and the resource lands as
`db-app-user-password`:

```yaml
- name: APP_USER_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-app-user-password
```

Both FeatureRecipes normalize identically, which is why swapping the binding does
not move the consumer's reference. The name is published once, on the producing
side, and the emitted resource and the consumer's reference both resolve from
that one published value.

## What the store target expects of the cluster

`ExternalSecret` is a custom resource. Applying the store target's output to a
cluster requires a secret-store operator to be running there, and a
`ClusterSecretStore` named `platform-secret-store` to exist. Nothing in this
workspace installs either: the example renders what such a cluster consumes, and
teaches how the shape is chosen.

Which store a cluster runs, and under what name, is a property of the target
rather than of the application, so `k8s-external-secret` carries no authoring key
for it. A cluster whose store is named differently is served by a FeatureRecipe
that names that store.

## Build

```bash
aggrega build --release release-local.yaml --auto-pull
aggrega build --release release-store.yaml --auto-pull
```

`--auto-pull` resolves the catalog into a lockfile beside the Release on the
first build; later builds of the same Release need no flag.

Both targets write to `dist/`, and `aggrega build` does not clear it, so keep
each run's output aside to compare the two:

```bash
out=$(mktemp -d)
rm -rf dist && aggrega build --release release-local.yaml --auto-pull && cp -r dist "$out/local"
rm -rf dist && aggrega build --release release-store.yaml --auto-pull && cp -r dist "$out/store"
( cd "$out" && diff -r local store )
```

To confirm each target renders deterministically, add `--verify-determinism`:
every node is rendered twice and the build halts if any node's two renders
differ.

```bash
aggrega build --release release-local.yaml --verify-determinism
aggrega build --release release-store.yaml --verify-determinism
```

## Files

- `aggregate.yaml` — developer intent: one `db` component of type
  `core/datastore/postgres`, with both credential slots filled by
  `core/referenced-secret`. Used unchanged by both Releases.
- `manifest-local.yaml` — binds `core/referenced-secret` to
  `k8s-secret-from-parameter`, which renders a Kubernetes Secret from the
  authored material.
- `manifest-store.yaml` — binds the same Feature to `k8s-external-secret`, which
  renders an ExternalSecret naming the store entry. Identical to
  `manifest-local.yaml` apart from its own name and that one line.
- `release-local.yaml`, `release-store.yaml` — the two Releases. Identical
  apart from their own names and which Manifest each points at.
- `.aggrega-config.yaml` — names the hub registry the catalog entities resolve
  from.

The `origin` values here are placeholders. They are not credentials for any real
service, and on the local target both are rendered into the output in the clear.
