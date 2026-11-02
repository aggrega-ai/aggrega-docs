---
example:
  level: start
  products: [core/ai-model/openai, core/ai-model/tei, core/datastore/cognee]
  shows: [connections, credentials, parameters]
---

# Credentials on connections — a key per connection, and one key at both ends

A semantic-memory store reaching two models and presenting a different key to
each, compiled to Kubernetes manifests. It reads ingested material with a
hosted model and encodes it with an embedding server running beside it in the
cluster. The key it presents to the hosted model is fetched from a cluster
secret store. The embedding server checks a key of its own, and the store
presents that same key — both ends read it from one parameter, so the two
cannot be written apart.

This workspace authors **no catalog entity of its own**. Every Component,
Feature and Recipe it names ships in the standard-library catalog; the files
here — three Aggregates, one Manifest and three Releases — are the whole of
what anyone writes.

## What it builds

```
             ┌── extraction_model ──►  llm          a hosted model API
             │     key on the connection, fetched from a secret store
   memory ───┤
             │
             └── embedding_model  ──►  embeddings   an embedding server that checks a key
                   key on the connection       ═══  the server's own api_key
                                                    (both read one parameter)
```

| instance | catalog Component | what it is here |
|---|---|---|
| `memory` | `core/datastore/cognee` | the caller: a semantic-memory store whose two model sockets each declare a `credential` slot for the key it presents on that connection |
| `llm` | `core/ai-model/openai` | a hosted model, labelled `component.aggrega.ai/hosting: managed`; reached as a reference, so nothing runs for it in the cluster |
| `embeddings` | `core/ai-model/tei` | Text Embeddings Inference in the cluster, labelled `self-hosted`; it requires a key of every caller and holds it in its own `api_key` slot |

Three releases share one Manifest, `manifest.yaml`, and each has an Aggregate
of its own:

| release | Aggregate | what it shows |
|---|---|---|
| `release-matched.yaml` | `aggregate-matched.yaml` | both connections written by the developer, the two ends of the embedding connection reading one parameter |
| `release-mismatched.yaml` | `aggregate-mismatched.yaml` | the same with the two ends reading two parameters: the build succeeds, and the conventions check advises |
| `release-operator-wired.yaml` | `aggregate-operator-wired.yaml` | the extraction connection left to the operator: the Release wires it and names its key in `infra` |

## Building

Build one release per run:

```bash
aggrega build --release release-matched.yaml           # → dist/matched/
aggrega build --release release-mismatched.yaml        # → dist/mismatched/
aggrega build --release release-operator-wired.yaml    # → dist/operator-wired/
```

Each release writes to its own directory, so the three rendered trees coexist
and can be diffed against each other.

A release needs its lockfile before it builds, and lockfiles are generated
rather than shipped. Resolve one first, or let the build fill it:

```bash
aggrega pull --release release-matched.yaml                 # resolve, then build normally
aggrega build --release release-matched.yaml --auto-pull    # or resolve during the build
```

The workspace resolves its entities from the default registry
`.aggrega-config.yaml` names, so no `--catalog` flag is needed.

The pull prints:

```text
[… omitted: a warning that the declared-sensitive origin of llm.credential reaches the target with no per-key sensitivity marking, because its realization maps it through a valuesMapping]
Pull complete: release-matched.lock (entities=15, source_artifacts=0, external_inputs=0)
```

and the build, with `<workspace>` standing for this example's folder:

```text
[… omitted: the same warning about llm.credential the pull printed]
  notice: LINT: Feature "core/referenced-secret" at core/referenced-secret:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 8 files written to <workspace>/dist
```

The other two releases print the same lines, each pull naming its own
lockfile and each build writing eight files. The `notice:`
line is about the credential Feature every attachment here uses:
`core/referenced-secret` accepts the name of its secret, `origin`, from either
the developer's `values` or the operator's `infra`, and the advisory reports
that one leaf is declared in both pillars. It changes no verdict and no
rendered byte; [Credential Features](../05-credential-features.md#who-names-the-credential-values-or-infra-exactly-one)
explains why the leaf sits in both.

Where this page prints what a build produced, the block is copied from a real
run — see [Reading the output on these pages](../reading-the-output.md) for the
convention and the mark it uses for lines left out.

## The rendered tree

```
dist/matched/helm/
├── embeddings-default-service.yaml
├── embeddings-headless-service.yaml
├── embeddings-statefulset.yaml
├── llm-service.yaml
├── memory--llm-zdcredential--memory-externalsecret-memory-memory-llm-credential.yaml
├── memory-default-service.yaml
├── memory-headless-service.yaml
└── memory-statefulset.yaml
```

One file was brought by an attachment rather than a component's own Recipe:
the `ExternalSecret` that fetches the key the store presents to the hosted
model. Its filename carries the component it is attached to, `memory`, and the
attachment's name, `llm.credential`, written `llm-zdcredential` because the
dot shares one string with the file's own name; see
[Naming a Rendered Resource](../../templates/rendered-resource-names.md#names-derived-from-a-connections-attachment).
No file carries the embedding key: it lives in a Secret the namespace already
holds, as the sections below show.

## Which document wrote what

- **The catalog** declares the binding points. The store's Component declares
  a `credential` slot on each of its two model sockets; the embedding server's
  Component declares `api_key` on itself; each Recipe decides the variable a
  key is delivered as.
- **The Aggregate** — the developer — writes which models the store reaches,
  the credential on each connection, the key the server verifies, and the one
  parameter both ends of the embedding connection read.
- **The Manifest** — the operator's routing for this target — decides what
  each credential becomes on Kubernetes: a reference to a Secret the namespace
  already holds for every `core/referenced-secret` attachment, except the one
  on the connection to the hosted model, which is fetched from a cluster secret
  store.
- **The Release** — the operator's document for one environment — fulfils the
  parameters, places the boundary in a namespace and, in the operator-wired
  release, wires the extraction connection and names the key presented on it.

## A key per connection

The store reaches two models over two sockets its catalog entity declares,
`extraction_model` and `embedding_model`, and each socket declares a
`credential` slot. So the key the store presents sits on the connection it is
presented on, and each connection carries its own. From
`aggregate-matched.yaml`:

```yaml
memory:
  type: core/datastore/cognee
  values:
    # The width of the vectors the embedding model above returns.
    embedding_dimensions: 384
  uses:
    extraction_model:
      llm:
        target: llm
        features:
          credential:              # the key presented to the hosted model
            type: core/referenced-secret
            values:
              key: api-key
              origin: "{{ .parameters.provider_key_entry }}"
    embedding_model:
      embeddings:
        target: embeddings
        features:
          credential:              # the key presented to the embedding server
            type: core/referenced-secret
            values:
              key: api-key
              origin: "{{ .parameters.embedding_key_secret }}"
```

An attachment written on a connection becomes one of the store's own
attachments, named for the connection's alias, a dot and the slot:
`llm.credential` and `embeddings.credential`. Here are the first two and the
last four entries of the store's container `env`, from
`dist/matched/helm/memory-statefulset.yaml`:

```yaml
- name: LLM_API_KEY
  valueFrom:
    secretKeyRef:
      name: memory-llm.credential
      key: api-key
- name: EMBEDDING_API_KEY
  valueFrom:
    secretKeyRef:
      name: embedding-server-key
      key: api-key
[… omitted: the store's own settings, HTTP_PORT to EMBEDDING_DIMENSIONS]
- name: EMBEDDING_ENDPOINT
  value: http://embeddings-default:8080/v1
- name: EMBEDDING_MODEL
  value: BAAI/bge-small-en-v1.5
- name: LLM_ENDPOINT
  value: https://api.openai.com/v1
- name: LLM_MODEL
  value: gpt-4o-mini
```

The first two are the keys, each from the credential on its own connection,
under the variable the store's Recipe gives that side — `LLM_API_KEY` for
extraction, `EMBEDDING_API_KEY` for embedding. Both are references, not
values, and the helm provider writes the entries it reads from a Secret ahead
of the plain ones. The last four came off the two connections: each model
publishes its address and its model name, and the store's Recipe reads them
per socket.

The store's Component also declares a key slot on itself, `model_api_key`. Its
Recipe reads that slot only for a socket left unwired, where the store reaches
a provider at the provider's own address and there is no connection to carry a
key. Both sockets are wired here, so it is not read.

## One key at both ends

The embedding server checks a key. It holds that key in a slot of its own
Component, `api_key`, and its Recipe delivers whatever fills the slot as
`API_KEY`, the variable Text Embeddings Inference reads at startup. From
`aggregate-matched.yaml`:

```yaml
embeddings:
  type: core/ai-model/tei
  values:
    model: BAAI/bge-small-en-v1.5
  features:
    api_key:                       # the key the server verifies
      type: core/referenced-secret
      values:
        key: api-key
        origin: "{{ .parameters.embedding_key_secret }}"
```

That is one attachment on the server. The key the store presents is another,
on the store's connection, shown above. Filling one end's slot fills nothing on
the other, so declaring the key at both ends is the minimum rather than a
duplicate. What keeps the two one key is that both read one parameter,
`embedding_key_secret`, which the Aggregate declares and the Release fulfils:

```yaml
parameters:
  provider_key_entry: ai/openai-api-key
  embedding_key_secret: embedding-server-key
```

The Manifest binds `core/referenced-secret` to `k8s-existing-secret`, which
reads `origin` as the name of a Secret the namespace already holds and renders
nothing. So both ends reference that one Secret. In the server's container
`env`, from `dist/matched/helm/embeddings-statefulset.yaml`:

```yaml
- name: API_KEY
  valueFrom:
    secretKeyRef:
      name: embedding-server-key
      key: api-key
```

and in the store's, from `dist/matched/helm/memory-statefulset.yaml`:

```yaml
- name: EMBEDDING_API_KEY
  valueFrom:
    secretKeyRef:
      name: embedding-server-key
      key: api-key
```

The Secret is created outside the Release, by whoever deploys it, so the key's
material never passes through an authored file or a rendered artifact.

## Why the server never sees its callers' keys

An attachment on a connection lands on the caller alone. The store's two
credentials are attachments of the store: what they render sits beside the
store, and the store's container references it. Nothing about them reaches
the component a connection points at, so a target renders the same whatever
the connections reaching it carry.

The hosted model shows it plainly. It renders one file, a Service mapping an
in-cluster name onto the provider's host — the whole `spec` of
`dist/matched/helm/llm-service.yaml`:

```yaml
spec:
  type: ExternalName
  externalName: api.openai.com
  ports:
    - port: 443
```

The key the store presents to it is fetched beside the store, as the next
section shows. The embedding server shows it by comparison: the mismatched
release below changes the key on the store's embedding connection and leaves
the server's alone, and the server's three files in `dist/mismatched/` differ
from those in `dist/matched/` only in the `aggrega.ai/aggregate-name` label,
which names the Aggregate each was built from.

So nothing in the server's configuration names a key a caller holds. At run
time a request carries the caller's key and the server compares it with the
one it holds; the caller, for its part, reads only what the server publishes:
an address and a model name.

## One key per server

Text Embeddings Inference checks one key. Every caller presents the same key,
a caller presenting any other is refused, and the server cannot tell one
caller from another, so withdrawing one caller's access means changing the key
every caller presents. However many connections reach it, its `api_key` slot
holds one key. That limit is the server's own, and the catalog's
`core/ai-model/vllm` and `core/ai-model/tgi` share it. It is not a limit of the
connection: a caller reaching several servers holds one key per connection, as
the store here holds two.

## One connection's key from a secret store

The Manifest binds every `core/referenced-secret` attachment by its type, and
one of them by its name. From `manifest.yaml`:

```yaml
features:
  # One realization for every core/referenced-secret attachment: the Secret
  # already exists in the namespace, and origin is its name.
  type:
    core/referenced-secret:1.0.0: helm/k8s-existing-secret:1.0.0
  # One attachment bound differently, by its name. An attachment written on
  # a connection is named for the connection's alias, a dot and the slot,
  # so the memory store's credential on its llm connection is
  # llm.credential. That key is fetched from the store, and origin is the
  # store entry to fetch.
  name:
    llm.credential: helm/k8s-external-secret:1.0.0
```

`k8s-external-secret` reads `origin` as the store entry to fetch. The
connection's `origin` is the parameter `provider_key_entry`, fulfilled as
`ai/openai-api-key`, so the attachment renders an `ExternalSecret` that a
secret-store operator in the cluster reconciles into a Secret. The whole `spec`
of
`dist/matched/helm/memory--llm-zdcredential--memory-externalsecret-memory-memory-llm-credential.yaml`:

```yaml
spec:
  refreshInterval: "1h"
  secretStoreRef:
    name: platform-secret-store
    kind: ClusterSecretStore
  target:
    name: memory-llm.credential
    creationPolicy: Owner
  data:
    - secretKey: api-key
      remoteRef:
        key: "ai/openai-api-key"
```

The Secret it fills, `memory-llm.credential`, is named for the store and the
connection, and it is the name the store's `LLM_API_KEY` references above. The
realization reads from a `ClusterSecretStore` named `platform-secret-store`.

What a parameter carries follows from the realization that reads it: a store
entry for the hosted model's key, a Secret's name for the embedding key. One
connection's key takes a realization of its own while every other attachment
of the same type keeps the type's.

## Where the two ends resolve a secret

A target platform resolves a secret by reference inside a **secret scope**: the
boundary within which one resource can name another. Where both ends of a
connection sit in one scope, both reference one secret resource. Where they sit
in different scopes, each end holds a secret resource of its own, realized from
the same store entry. The Manifest chooses each end's realization — by Feature
type for every attachment of that type, or for one attachment by its name.

Each target draws the scope in its own terms. On Kubernetes, which this
workspace builds for, it is the namespace: a workload references a Secret only
in its own. Each release here places its one boundary in one namespace,
`aggrega.ai/namespace: memory`, and every rendered document carries it — the
head of both StatefulSets:

```yaml
# dist/matched/helm/memory-statefulset.yaml
metadata:
  name: memory
  namespace: memory

# dist/matched/helm/embeddings-statefulset.yaml
metadata:
  name: embeddings
  namespace: memory
```

So both ends reference the one Secret above. With the embedding server in a
namespace of its own, the Manifest binds both ends' credentials by name —
`api_key` and `embeddings.credential` — to `k8s-external-secret`, the Release
fulfils the parameter with the store entry, and each end holds an
`ExternalSecret` in its own namespace, both fetching that one entry. The store
then reaches the server across namespaces, which
[cross-boundary-networking](../cross-boundary-networking/) covers. On the other
targets the scope is a Compose project, a Terraform root configuration and a
CloudFormation stack; the [Credential Model](../../../architecture/08-credential-model.md#a-key-both-ends-of-a-connection-hold)
describes each.

## The operator wires a connection

`aggregate-operator-wired.yaml` writes the embedding connection and leaves the
store's `extraction_model` socket unbound: the store's catalog entity declares
it, and the developer leaves it to the operator. The Release wires it to the
hosted model the Aggregate declares. From `release-operator-wired.yaml`:

```yaml
memory:
  uses:
    # A connection the Aggregate does not write, into a socket the
    # store's catalog entity declares, to a component the Aggregate
    # declares. A Release writes no values, so the credential on it
    # names its secret in infra.
    extraction_model:
      llm:
        target: llm
        features:
          credential:
            type: core/referenced-secret
            infra:
              origin: ai/openai-api-key
```

A Release may wire a connection into a socket the catalog entity declares and
the Aggregate leaves unbound, to a component the Aggregate declares. It adds no
component, and it never retargets a connection the Aggregate wrote. It writes
no `values`, so the credential on that connection names its secret in `infra`:
`core/referenced-secret` takes `origin` from the developer's `values` or the
operator's `infra`, exactly one of the two, and the build halts on an
attachment carrying both or neither.

The attachment is named `llm.credential` exactly as in the matched release, so
the Manifest's name tier binds it the same way. Beside the label naming the
Aggregate, two lines differ between `dist/operator-wired/` and
`dist/matched/`. The `data` of the `ExternalSecret`:

```yaml
data:
  - secretKey: value
    remoteRef:
      key: "ai/openai-api-key"
```

and the store's reference to the Secret it fills, in
`dist/operator-wired/helm/memory-statefulset.yaml`:

```yaml
- name: LLM_API_KEY
  valueFrom:
    secretKeyRef:
      name: memory-llm.credential
      key: value
```

The data key is `value` rather than `api-key` because `key` is a `values`
leaf, which only the Aggregate writes, so an attachment the Release alone makes
reads the Feature's default. The realization publishes that key and the store
reads it from what was published, so the two still agree.

The hosted model is labelled `managed`, so a connection reaching it carries a
credential or says in its own `values` that the model takes none,
`unauthenticated: true`. That holds whichever document wrote the connection.
Remove the `features:` block from the Release's connection and the build
halts. The halt is `E0033`, a failed assertion of the store's Component, and
its message ends with the rule's own sentence: *the extraction_model connection
llm of "memory" reaches "llm", whose component.aggrega.ai/hosting label is
managed, with no credential: attach one under credential on that connection, or
set unauthenticated: true in its values*.

## When the two ends disagree

`aggregate-mismatched.yaml` gives the server's key and the store's key two
parameters:

```yaml
parameters:
  provider_key_entry:
    type: string
    description: >
      The store entry holding the key the memory store presents to the hosted
      model provider.
  embedding_key_secret:
    type: string
    description: The Secret holding the key the embedding server verifies.
  # The fault: a second parameter for what is meant to be the same key.
  memory_embedding_key_secret:
    type: string
    description: The Secret holding the key the memory store presents to the embedding server.
```

The server's `api_key` reads `embedding_key_secret` and the store's connection
reads `memory_embedding_key_secret`, which the Release fulfils with two
different Secrets. The build succeeds and writes eight files: the compiler
evaluates each attachment it is given and compares nothing between the two
ends. The server still references `embedding-server-key`, and the store now
presents another, from `dist/mismatched/helm/memory-statefulset.yaml`:

```yaml
- name: EMBEDDING_API_KEY
  valueFrom:
    secretKeyRef:
      name: embedding-client-key
      key: api-key
```

Deployed, the server accepts the store's requests only if those two Secrets
happen to hold the same key.

The publishing conventions check of a Release is where this is caught:

```bash
aggrega lint --release release-mismatched.yaml
```

```text
release-mismatched.yaml:
warn: E0329 connection-credential-matches-target-key: connection "embeddings" on socket "embedding_model" of component "memory" carries a credential in its credential slot and its target "embeddings" holds a key in its api_key slot, but the two ends write their secret's locator differently, so they may name different secrets and the target would refuse the key this caller presents. The locators are compared as written, and neither is shown here. Reading one parameter at both ends keeps them one key; that agreement is the standard-catalog convention, and the build does not check it.
conventions checked: 10 entities, 1 advisory finding(s)
```

The same check over the matched release reports nothing:

```bash
aggrega lint --release release-matched.yaml
```

```text
conventions checked: 10 entities, 0 advisory finding(s)
```

and over the operator-wired release nothing either.

The rule finds the two ends by the names the standard catalog gives them — the
target's `api_key` and the connection's `credential` — and compares the
`origin` each end writes, as written: two ends reading one parameter compare
equal, and nothing is resolved. It never quotes either, since what is written
there can be the secret itself. It does not judge a target labelled `managed`,
whose `api_key`, where it declares one, is the key presented to its vendor
rather than one its callers present; so the connection to `llm` draws nothing
in any of the three releases. The finding is advice: `aggrega lint` exits 0,
and a workspace whose two ends deliberately differ opts out with
`allow_connection_credential_mismatches`. An editor asking the daemon the same
question, `aggrega/lint` naming the Release, receives the same finding under
the code `connection-credential-matches-target-key` and the short code `E0329`.
The rule and what it reads are described under
[The discipline rules](../../cli/aggrega-lint.md#the-discipline-rules).

## Determinism

All three releases build under `--verify-determinism`, which renders every
node twice and compares the emitted bytes:

```bash
aggrega build --release release-matched.yaml --verify-determinism
```

Rebuilding any of the three from a clean tree reproduces its rendered output
byte for byte.

## Adapting it

- **Add a second caller of the embedding server.** Its connection's credential
  reads `embedding_key_secret` too. The server holds one key for every caller,
  so the second caller presents the same key.
- **Fetch the embedding key from the store as well.** Bind `api_key` and
  `embeddings.credential` by name to `k8s-external-secret` and fulfil
  `embedding_key_secret` with a store entry instead of a Secret's name. Both
  ends change together because both read the parameter.
- **Reach a model that checks no key.** Leave the credential off the
  connection. Where the target is labelled `managed`, say so on the connection
  with `unauthenticated: true` in its `values`.

For sharing one key across several callers' connections, see
[model-api-key-sharing](../model-api-key-sharing/). For a router that holds
the provider keys on its callers' behalf, see
[ai-agent-and-model-router](../ai-agent-and-model-router/). The model behind
all of it is the [Credential Model](../../../architecture/08-credential-model.md).
