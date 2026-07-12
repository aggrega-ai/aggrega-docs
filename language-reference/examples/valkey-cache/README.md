# Valkey — one Aggregate, two targets, optional authentication

This lean example compiles a single **Valkey** in-memory cache (Redis wire
protocol) from one Developer-authored `Aggregate` to several deployment realizations:

- **Docker Compose** for local development,
- the **synthesized helm Recipe** running the official upstream `valkey/valkey`
  image directly on Kubernetes (no external chart), and
- the **Bitnami Valkey Helm chart** for Kubernetes.

The synthesized helm Recipe is the preferred Kubernetes path: it depends only on
an official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The same `aggregate.yaml` drives all of them. Only the Recipe layer selected by
the Manifest changes per realization. A second Aggregate, `aggregate-auth.yaml`,
shows the same cache with an optional password credential attached for the
Compose and Bitnami paths; `aggregate-helm-synth-auth.yaml` attaches a
referenceable credential for the synthesized helm path.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `cache` component of type `core/datastore/valkey`, no credential — the cache runs without authentication. |
| `aggregate-auth.yaml` | The same cache with a password credential attached to the component's optional `password` slot (Compose and Bitnami paths). |
| `aggregate-helm-synth-auth.yaml` | The same cache with a referenceable credential attached for the synthesized helm path — the value is materialized as a Kubernetes Secret the Deployment references. |
| `manifest-compose.yaml` | Maps the Valkey type to the Compose Recipe (`compose/valkey`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the Valkey type to the synthesized helm Recipe (`helm/valkey`) and the credential to `k8s-secret-from-parameter`. |
| `manifest-bitnami.yaml` | Maps the Valkey type to the Bitnami chart-wrap Recipe (`valkey-bitnami`) and the credential to `env-secret`. |
| `release-compose.yaml` / `release-helm-synth.yaml` / `release-bitnami.yaml` | Operator records for the three realizations, no authentication. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` / `release-bitnami-auth.yaml` | Operator records that enable authentication. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A cache-role datastore.** Valkey is used here as an in-memory cache and
  stores nothing durably, so the component is typed as a plain `server` rather
  than a `stateful-server`. On Kubernetes the chart renders a **Deployment**,
  not a StatefulSet, and requests no persistent volume; on Compose the service
  declares no data volume.
- **Chart wrapping (Kubernetes).** The Bitnami target sources the upstream
  Valkey chart by OCI reference and maps the component's `infra` onto the
  chart's own value structure — `architecture: standalone`, a single
  `primary` Deployment with persistence disabled, `primary.containerPorts`,
  `primary.service.ports`, and `primary.resources`.
- **Workload synthesis (Kubernetes).** The synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official
  `valkey/valkey` image — that the helm provider translates into Kubernetes
  manifests with no external chart. The rendered resource set is exactly what
  the Workload declares. Because both a Compose and a synthesized helm Recipe
  carry the name `valkey`, the Manifests reference them provider-scoped as
  `compose/valkey` and `helm/valkey`.
- **Optional authentication via a credential slot.** The component declares one
  optional `password` slot in its `secretsSchema`. When no credential is
  attached (the base Aggregate), the Recipe renders the cache with
  authentication disabled — byte-identically to a Recipe with no slot. When a
  credential is attached (`aggregate-auth.yaml`), the injected value enables the
  chart's password authentication on Kubernetes (the chart provisions its own
  Secret from the supplied password) and surfaces as the `VALKEY_PASSWORD`
  environment variable on Compose.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose), no authentication
aggrega build --release release-compose.yaml

# Kubernetes (synthesized helm Recipe, official image), no authentication
aggrega build --release release-helm-synth.yaml

# Kubernetes (Bitnami Valkey Helm chart), no authentication
aggrega build --release release-bitnami.yaml

# The same realizations with authentication enabled
aggrega build --release release-compose-auth.yaml
aggrega build --release release-helm-synth-auth.yaml
aggrega build --release release-bitnami-auth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on first run and pins it in a lockfile.

## Credential delivery note

On the Compose and Bitnami paths the credential is an inject-value secret
(`aggregate-auth.yaml`): its value is delivered on the component's environment
pipe. On Compose it becomes a service environment variable directly; the
`VALKEY_PASSWORD` variable enables authentication for images that read it
(Bitnami-packaged Valkey), while the plain upstream image expects the password
through its configuration instead. On Kubernetes the chart-wrap Recipe feeds the
value into the chart's `auth.password`, and the chart provisions the Kubernetes
Secret and mounts it into the workload.

The synthesized helm path uses a referenceable credential
(`aggregate-helm-synth-auth.yaml`): the value is materialized as a Kubernetes
Secret, the Deployment references it through an env `secretKeyRef`, and Valkey is
started with `--requirepass` reading that environment variable. The plaintext
password therefore never appears in the Deployment manifest — only in the
Secret. This is what actually enables authentication on the official
`valkey/valkey` image, which does not read a password from the environment on
its own.

The `origin` value in the authenticated Aggregates is a development placeholder;
supply a real value through your credential source for any real deployment.
