# Credential Features

This page explains one idea, the standard library's credential Features and how a Manifest chooses what realizes
each, and is not a runnable workspace.
[One developer intent, two credential delivery shapes](credential-shape-per-target/README.md) builds one Aggregate
against two realizations of the same credential; write it into a folder of your own with:

```sh
aggrega scaffold --example credential-shape-per-target
```

It then prints the commands to run next:

```sh
cd credential-shape-per-target
aggrega build --release release-local.yaml --auto-pull
aggrega build --release release-store.yaml --auto-pull
```

A credential fills a slot a Component declares in its `featuresSchema` (see
[entities/component.md](../entities/component.md#attachment-slots-featuresschema)); the slot, the Feature that fills
it and the FeatureRecipe the Manifest binds form the whole path from an author's attachment to a running workload.

## The Credential Feature Family

A credential Feature carries the `feature.aggrega.ai/kind: secret` label. The label is catalog metadata describing what
the attachment produces; no compiler branch reads it, and a credential Feature is attached under `features:` like any
other Feature, by the developer in the Aggregate or the operator in the Release.

The standard library splits credential Features by what the realization does with the secret:

- **`core/secret-value`** delivers a value into the component's inject pipe, where its Recipe reads it — a chart value,
  an environment variable.
- **`core/secret-provided`** also yields a value, but publishes it as a `provides` key instead, so the attachment's own
  `inject:` block on a transparent slot says where it goes.
- **`core/referenced-secret`** names a secret *resource* — a Kubernetes Secret, an AWS Secrets Manager secret, a Vault
  entry — that its realization creates or that already exists, and publishes that resource's `name` and `key`, which a
  consumer reads as `.features.<slot>.provides.name` and `.features.<slot>.provides.key`.
- **`core/referenced-secret-set`** materializes one such resource holding a set of data keys the author supplies, and
  publishes its locator alone, for a consumer whose target already fixes the key names it reads.
  [MariaDB (Bitnami chart) — one multi-key credential Secret](mariadb-bitnami-credential-set/README.md) uses it.
- **`core/generated-secret`** produces nothing: the target engine generates and manages the credential itself, as a
  managed database does with its administrator password. The operator attaches it in the Release, because whether the
  engine owns the credential follows from the Recipe the Manifest picks; [Terraform RDS (inline HCL artifact)](terraform-rds/README.md)
  binds a required slot this way.
- **`core/random-password`** renders a *request* for the target to generate a password into a secret resource, and
  publishes that resource's locator as `core/referenced-secret` does. Nobody writes the credential and the rendered
  output carries none.

They are peers — same label, same attachment surface, same slot — so a slot is always filled, and what changes between
Releases is what fills it. A credential Feature that declares a `provides` contract obliges every FeatureRecipe
implementing it to publish those keys, and the build halts if one does not; that is what makes the consumer's read
safe.

`core/random-password` needs something on the target to draw the value, since the build never does: on Kubernetes a
controller (the External Secrets Operator, or kubernetes-secret-generator) that the Release affirms with
`infra.control_plane_present: true`; on Terraform a `random_password` resource; on CloudFormation a Secrets Manager
secret that generates its own string. No realization ships for Docker Compose, so a build binding it there halts. Every
request draws its own value, so two components share one generated password by attaching it once, with `name` pinned,
and reading it elsewhere through `core/referenced-secret` bound to `helm/k8s-existing-secret`.

## Who names the credential: `values` or `infra`, exactly one

`core/secret-value`, `core/secret-provided`, `core/referenced-secret` and `core/referenced-secret-set` accept the
credential's locator from either author: the developer writes it in the attachment's `values` in the Aggregate, the
operator in the attachment's `infra` in the Release. The leaf is the same in both — `origin`, or `entries` for the set
— and every realization reads whichever pillar carries it.

The operator's form is what makes a credential usable where the developer cannot write one: on a connection the
Release wires, and on an attachment the Release alone makes, since a Release writes `values` nowhere.

```yaml
# Release: the operator wires the connection and names the secret.
spec:
  components:
    router:
      uses:
        models:
          gpt:
            target: gpt
            features:
              credential:
                type: core/referenced-secret
                infra:
                  origin: openai-team-a
```

**Exactly one of the two.** Each pillar is validated on its own, so neither schema can require the locator; each
Feature's own `assertions` hold the rule instead, and an attachment carrying the locator in both pillars, or in
neither, halts the build (`E0033`) naming the Feature, the attachment and the component. That is the catalog entities'
contract: the compiler evaluates their assertion as it evaluates any Feature's.

**Everything else keeps its pillar.** `key` stays a `values` leaf, so an attachment only the Release makes reads the
default data key, `value`. Declaring `origin` in both pillars is exactly what the pillar-overlap advisory looks for, so
loading these Features reports it — `LINT: Feature "core/referenced-secret" ... declares property "origin" in both
values: and infra: pillars`. Here the overlap is the contract; the advisory changes no verdict and no rendered byte.

## The Manifest chooses the realization

Several FeatureRecipes can implement one Feature for the same target, and the Manifest chooses. `core/referenced-secret`
has three on Kubernetes, and where the credential lives decides between them:

- **`helm/k8s-secret-from-parameter`** writes the value an author supplied into a Secret it emits, so the material sits
  in the rendered output: for evaluation and local work.
- **`helm/k8s-external-secret`** renders an `ExternalSecret` naming an entry in a secret store, which the External
  Secrets Operator in the cluster reconciles into a Secret.
- **`helm/k8s-existing-secret`** emits nothing: it reads `origin` as the name of a Secret that already exists and
  publishes it as written.

The first two derive the Secret's name the same way, from the host's rendered name and the slot's, so a consumer reads
the same locator from either and its rendered reference is unchanged; that is what the example shows. The third
publishes the existing Secret's own name, so binding it changes the consumer's reference on purpose.

`core/secret-value` is realized on Docker Compose by `compose/dotenv-secret`, which writes the value into the service's
environment exactly as authored: an origin written as `${DB_PASSWORD}` lands as that reference, which Docker Compose
fills from your shell or a `.env` file when the stack starts. On Kubernetes, `helm/env-secret` delivers the value into
the inject pipe, and `helm/k8s-secret-from-value` also writes it into a Secret and publishes its locator, for a
consumer that reads the credential by reference. Neither Kubernetes realization accepts a Compose variable reference,
which nothing there would fill.

A FeatureRecipe name shipped for more than one target, such as `provided-secret`, is named with its target in the
Manifest, `compose/provided-secret:1.0.0`, since the bare name matches both.

## One name, published once

A consumer's Recipe never derives the name of the Secret a credential produces: it reads the locator the credential
publishes, `existingSecret: "{{ .features.root_password.provides.name }}"`. The name is authored once, on the
FeatureRecipe's `provides`, so changing how it is composed is an edit there alone.
[Credential delivery — `secretKeyRef` end-to-end](credential-secretkeyref/README.md) builds the referenceable path on
Kubernetes and the injected one on Docker Compose, and
[Sharing a credential — per-consumer, shared, and both at once](model-api-key-sharing/README.md) shows several
consumers holding their own key or sharing one.
