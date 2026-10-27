---
example:
  level: start
  products: [core/storage/s3-object-store]
  shows: [multi-target, credentials, guardrails]
---

# S3-compatible object store — one component, two targets, a required key pair

This example compiles one **S3-compatible object store**, the
`core/storage/s3-object-store` component, to its two self-hosted realizations:

- **Docker Compose** for local development, through `compose/s3-object-store`,
  and
- the **synthesized helm Recipe** `helm/s3-object-store` on Kubernetes, with no
  external chart.

Both run **SeaweedFS** (Apache-2.0) from its project's published
`chrislusf/seaweedfs` image as one server process holding one bucket, created
before the server serves. The same component is realized on Amazon S3 and on
Google Cloud Storage by other Recipes; a consumer reads the same published
endpoint, bucket and region whichever realization the Manifest selects.

The component's two key slots, `access_key_id` and `secret_access_key`, are
optional, because a managed service takes no key from a bucket. SeaweedFS takes
the pair as the server's own S3 account and has no default for it, so both of
its realizations halt when either slot is empty. `aggregate.yaml` fills nothing
and shows the build halting; the two other Aggregates fill both slots in the
form each target delivers them: `aggregate-auth.yaml` for the Compose path
(inject-value credentials surfaced as environment variables), and
`aggregate-helm-synth-auth.yaml` for the synthesized helm path (referenceable
credentials materialized as Kubernetes Secrets).

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `store` component of type `core/storage/s3-object-store` holding the bucket `media`, with no key attached — a build of it halts, naming the empty `access_key_id` slot. |
| `aggregate-auth.yaml` | The same store with both keys attached as inject-value credentials (Compose path). |
| `aggregate-helm-synth-auth.yaml` | The same store with both keys attached as referenceable credentials for the synthesized helm path — each key is materialized as a Kubernetes Secret the StatefulSet references. |
| `manifest-compose.yaml` | Maps the store type to the Compose Recipe (`compose/s3-object-store`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the store type to the synthesized helm Recipe (`helm/s3-object-store`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations of `aggregate.yaml`, which attaches no key, so each build halts. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` | Operator records for the two Aggregates that fill both slots. |

## What it demonstrates

- **One component, many realizations.** The Aggregate names the bucket and
  nothing about the server. Each Manifest says *how* to realize the store, and
  a Manifest selecting a managed realization instead deploys the same
  Aggregate to Amazon S3 or Cloud Storage.
- **The bucket comes with the store.** The developer's `values.bucket` is the
  bucket the store holds and publishes. An init container on Kubernetes, and an
  init service on Compose, creates it before the server serves and leaves an
  existing one as it is, so a consumer never meets a store without its bucket.
  A bucket name SeaweedFS does not take halts the build, naming the rule.
- **A stateful server on one volume.** On Kubernetes the synthesized Recipe
  renders a **StatefulSet** of one replica with a volume claim mounted at
  `/data`, a ClusterIP Service and the headless Service the StatefulSet names;
  on Compose the service mounts a named volume at the same path and publishes
  the S3 port on the host.
- **A required key pair with no default.** With an account present, SeaweedFS
  authenticates every S3 request, so no key every reader of the catalog holds
  stands in for one. Each Recipe halts on an empty slot before anything renders,
  naming the slot and what to attach. The attached pair becomes the server's
  account, and the secret key is also the server's filer signing key, so the
  gRPC port beside the S3 port takes no unauthenticated change either.
- **What a consumer reads.** The store publishes `bucket`, `endpoint`
  (`http://store-default:8333` on Kubernetes, `http://store:8333` on Compose),
  `host`, `port` `8333`, `protocol` `s3` and `region` `us-east-1`, the region S3
  clients read from a server reporting none. A consumer wired to it points its
  S3 client at the endpoint and presents a key pair on its own connection.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose-auth.yaml --auto-pull

# Kubernetes (synthesized helm Recipe)
aggrega build --release release-helm-synth-auth.yaml --auto-pull
```

Rendered artifacts land under `dist/`.

Building `aggregate.yaml`, which attaches no key, halts on either target before
anything renders:

```sh
aggrega build --release release-helm-synth.yaml --auto-pull
```

```text
[… omitted: the pull's lines, which report the same halt, and a lint notice]
[CATALOG_ERROR E0033]
  Recipe/FeatureRecipe assertions
  caused by: Recipe "s3-object-store" instance "store" assertion "key_slots_filled": assertion "Recipe/s3-object-store/store/key_slots_filled": template: Recipe/s3-object-store/store/key_slots_filled:1:138: executing "Recipe/s3-object-store/store/key_slots_filled" at <fail (printf "the %s slot is empty, and SeaweedFS takes the access_key_id and secret_access_key pair as the account its S3 API authenticates every request by, so there is no default for either: attach a referenceable credential, such as core/referenced-secret, to %s" $slot $slot)>: error calling fail: assertion failed: the access_key_id slot is empty, and SeaweedFS takes the access_key_id and secret_access_key pair as the account its S3 API authenticates every request by, so there is no default for either: attach a referenceable credential, such as core/referenced-secret, to access_key_id
```

`release-compose.yaml` halts on the same assertion, and its remedy names the
form the Compose path takes: "attach a credential to access_key_id delivering
AWS_ACCESS_KEY_ID, such as core/secret-value with key AWS_ACCESS_KEY_ID and its
origin a Compose variable reference such as ${AWS_ACCESS_KEY_ID}". The fix is
the step the two other Aggregates take: attach a credential under each of
`features.access_key_id` and `features.secret_access_key` on the `store`
component.

## Credential delivery note

On the Compose path each key is an inject-value secret (`aggregate-auth.yaml`):
its value is delivered on the component's environment pipe under the variable
its `values.key` names, `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`, which
are the variables the Recipe gives the server, and an attachment delivering
under any other name halts the build, naming the slot. Each `origin` is a
Compose variable reference, so the rendered file carries the reference rather
than the key:

```yaml
environment:
  AWS_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID}
  AWS_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY}
  WEED_JWT_FILER_SIGNING_KEY: ${S3_SECRET_ACCESS_KEY}
```

The synthesized helm path uses referenceable credentials
(`aggregate-helm-synth-auth.yaml`): each key is materialized as a Kubernetes
Secret named after the component and the slot, and the StatefulSet references
it through an env `secretKeyRef`, so neither key appears in the StatefulSet
manifest — only in the Secrets:

```yaml
env:
  - name: AWS_ACCESS_KEY_ID
    valueFrom:
      secretKeyRef:
        name: store-access-key-id
        key: access-key-id
  - name: AWS_SECRET_ACCESS_KEY
    valueFrom:
      secretKeyRef:
        name: store-secret-access-key
        key: secret-access-key
  - name: WEED_JWT_FILER_SIGNING_KEY
    valueFrom:
      secretKeyRef:
        name: store-secret-access-key
        key: secret-access-key
```

The `origin` values in `aggregate-helm-synth-auth.yaml` are development
placeholders, written into the emitted Secrets as they are. For a Release
carrying real traffic, map `core/referenced-secret` to `k8s-existing-secret` instead, with
each `origin` naming a Secret that already exists in the namespace and holds
the key under the attachment's `key`.

## Run it (Compose)

```sh
aggrega build --release release-compose-auth.yaml --auto-pull
export S3_ACCESS_KEY_ID=<an access key identifier of your choosing>
export S3_SECRET_ACCESS_KEY=<a secret key of your choosing>
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

The S3 API answers on <http://localhost:8333> once the bucket service has
created `media`. Point any S3 client at that address with the exported key pair
and the region `us-east-1`. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
