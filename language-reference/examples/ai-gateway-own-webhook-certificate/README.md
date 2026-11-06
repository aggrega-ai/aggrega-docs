---
example:
  level: advanced
  products: [core/gateway/envoy-ai-gateway-operator]
  shows: [external-sources, catalog-authoring, guardrails]
---

# A webhook certificate of your own: leaving a chart's generated Secret out

This is an advanced example. It teaches the Recipe field `omits:`, which most
Recipes never need: it is for a source you take as it is — here, a chart fetched
from a registry — that renders a document your Release must not ship. Reach for
it when you meet that case.

The workspace builds the Envoy AI Gateway control plane, the controller Envoy
Gateway calls as its extension server, through the standard-library Recipe
`helm/envoy-ai-gateway-operator`, in both of the modes its webhook certificate
can take. In one of them the project's chart renders a Secret holding a key and
a certificate it generates afresh on every render, and the Recipe's `omits:`
entry leaves that Secret out of the build. Two more Releases show the two halts
you can meet around the field: the one the entry exists to prevent, and the one
an entry that no longer matches anything produces.

## What it builds

One component, `ai-controller`, of `core/gateway/envoy-ai-gateway-operator`,
compiled to Kubernetes manifests. The Aggregate is the same for every Release.
Each Release places the controller in `envoy-ai-gateway-system` and chooses the
certificate mode; each Manifest chooses the Recipe:

| Release | its Manifest binds | certificate mode | outcome |
|---|---|---|---|
| `release-cert-manager.yaml` | `helm/envoy-ai-gateway-operator`, from the standard library | cert-manager | builds |
| `release-own-certificate.yaml` | `helm/envoy-ai-gateway-operator`, from the standard library | the Secret `ai-gateway-webhook-tls` | builds, byte-identical from one build to the next |
| `release-negative-without-omits.yaml` | `helm/envoy-ai-gateway-operator-without-omits`, from this workspace | the Secret `ai-gateway-webhook-tls` | halts with `E0058` when built with `--verify-determinism` |
| `release-negative-stale-omits.yaml` | `helm/envoy-ai-gateway-operator-stale-omits`, from this workspace | the Secret `ai-gateway-webhook-tls` | halts with `E0334` |

The two Recipes in this workspace's `catalog/` are teaching variants of the
standard-library one. Each sources the same chart at the same release and
chooses the certificate mode by the same mapping: one has no `omits:` entry, and
the other has an entry naming a Secret the chart does not render. They carry
names of their own, so they sit beside the standard-library Recipe rather than
shadowing it, and the Manifest a Release names decides which one it builds with.

## Two ways to give the webhook a certificate

The controller runs a mutating webhook that the cluster's API server calls over
TLS, so the webhook serves a certificate. The Component offers two ways to
supply it, chosen by one `infra` key, `webhook_tls_secret`:

- **Unset, the default.** The chart renders a cert-manager `Certificate` for the
  controller's Service name and the self-signed `Issuer` that signs it, so
  cert-manager must already run in the cluster.
- **Set.** The webhook serves the certificate in the Secret the key names, which
  whoever deploys creates beforehand in the controller's namespace, holding
  `tls.crt`, `tls.key` and `ca.crt`. No `Certificate` and no `Issuer` are
  rendered, and cert-manager is not needed: when the controller starts, it
  writes the Secret's `ca.crt` into the webhook configuration as the CA bundle
  the API server checks the webhook against.

`release-own-certificate.yaml` sets it:

```yaml
  components:
    ai-controller:
      annotations:
        aggrega.ai/namespace: envoy-ai-gateway-system
      infra:
        webhook_tls_secret: ai-gateway-webhook-tls
```

## What the chart renders in the own-certificate mode

With the key set, the project's chart mounts the Secret of that name into the
controller's pod at `/certs` — and it also renders a Secret of its own under the
same name, holding a CA certificate, a certificate and a private key it
generates while it renders. Two builds generate two different keys, so the
output stops being byte-identical from one build to the next; and applying it
would replace the Secret the operator created with the one the chart generated.

The chart is fetched from the project's registry and used as it stands; a Recipe
does not edit a fetched chart. The standard-library Recipe leaves the Secret out
instead:

```yaml
# helm/envoy-ai-gateway-operator:1.0.0, its omits: field
  omits:
    - kind: Secret
      name: "{{ .infra.webhook_tls_secret }}"
      when: '{{ ne (optional .infra "webhook_tls_secret" "") "" }}'
```

- **`kind` and `name` name the document as the chart renders it**: a `Secret`
  whose `metadata.name` is the name the Release set. The `name` template reads
  the same `infra` key the chart is given, so the entry names the generated
  Secret whatever the Release calls it.
- **`when` makes the entry apply in this mode only.** In the cert-manager mode
  the chart renders no such Secret; the condition is false there, and an entry
  whose `when:` is false is dropped before anything is checked. One Recipe
  serves both modes.

The rest of the chart still renders in full, and only the matching document is
dropped from what the build writes. Leaving it out is right here because the
Secret the controller's pod mounts is the operator's own, created separately.
The field leaves a document out; it does not check that whatever the rest of
the output relies on exists somewhere else.

## Building

```bash
aggrega build --release release-cert-manager.yaml --auto-pull
aggrega build --release release-own-certificate.yaml --auto-pull
aggrega build --release release-negative-without-omits.yaml --auto-pull --verify-determinism   # halts; exits 1
aggrega build --release release-negative-stale-omits.yaml --auto-pull                          # halts; exits 1
```

`.aggrega-config.yaml` lists the workspace's own `catalog/`, which holds the
two teaching Recipes; the Component and the standard-library Recipe resolve
from `hub.aggrega.ai`, the default registry it names. With a checkout of the
standard-library catalog ([where to get one](../../../authoring/import/README.md#how-an-import-runs)), name its
`aggrega-catalog` directory with `--catalog` and every entity resolves from
those two directories.

`--auto-pull` fills each Release's lockfile during the build; lockfiles and the
rendered output are generated, not shipped. Resolving a lockfile fetches the
controller's chart from Docker Hub, so the first build of each Release needs the
network.

## The two certificate modes, as rendered

`release-cert-manager.yaml`, built with `--auto-pull`, prints, with
`<workspace>` standing for this example's folder:

```text
Pull complete: release-cert-manager.lock (entities=5, source_artifacts=1, external_inputs=0)
[… omitted: the total build time, which differs per run]
Build completed: 16 files written to <workspace>/dist
```

and `ls dist/helm` then lists:

```text
ai-controller
ai-controller-certificate-envoy-ai-gateway-system-self-signed-cert-for-mutating-webhook.yaml
ai-controller-clusterrole-ai-controller-envoy-ai-gateway-system.yaml
ai-controller-clusterrole-envoy-ai-gateway-inference-pool-reader-envoy-ai-gateway-system.yaml
ai-controller-clusterrolebinding-ai-controller-envoy-ai-gateway-system.yaml
ai-controller-clusterrolebinding-envoy-ai-gateway-inference-pool-reader-binding-envoy-ai-gateway-system.yaml
ai-controller-deployment-envoy-ai-gateway-system-ai-controller.yaml
ai-controller-issuer-envoy-ai-gateway-system-self-signed-issuer-for-mutating-webhook.yaml
ai-controller-mutatingwebhookconfiguration-envoy-ai-gateway-gateway-pod-mutator-envoy-ai-gateway-system.yaml
ai-controller-service-envoy-ai-gateway-system-ai-controller.yaml
ai-controller-serviceaccount-envoy-ai-gateway-system-ai-controller.yaml
```

The `ai-controller` directory holds the six AI Gateway resource definitions the
Recipe emits beside the chart. `release-own-certificate.yaml`, built the same
way, prints:

```text
Pull complete: release-own-certificate.lock (entities=5, source_artifacts=1, external_inputs=0)
[… omitted: the total build time, which differs per run]
Build completed: 14 files written to <workspace>/dist
```

and `ls dist/helm` lists:

```text
ai-controller
ai-controller-clusterrole-ai-controller-envoy-ai-gateway-system.yaml
ai-controller-clusterrole-envoy-ai-gateway-inference-pool-reader-envoy-ai-gateway-system.yaml
ai-controller-clusterrolebinding-ai-controller-envoy-ai-gateway-system.yaml
ai-controller-clusterrolebinding-envoy-ai-gateway-inference-pool-reader-binding-envoy-ai-gateway-system.yaml
ai-controller-deployment-envoy-ai-gateway-system-ai-controller.yaml
ai-controller-mutatingwebhookconfiguration-envoy-ai-gateway-gateway-pod-mutator-envoy-ai-gateway-system.yaml
ai-controller-service-envoy-ai-gateway-system-ai-controller.yaml
ai-controller-serviceaccount-envoy-ai-gateway-system-ai-controller.yaml
```

The cert-manager mode's tree holds a `Certificate` and an `Issuer` and no
`Secret`. The own-certificate mode's holds none of the three: no `Certificate`
and no `Issuer`, because the chart renders neither in that mode, and no `Secret`,
because the Recipe's entry left out the one the chart did render. What the
controller mounts instead is the Secret the Release named:

```yaml
# dist/helm/ai-controller-deployment-envoy-ai-gateway-system-ai-controller.yaml
[… omitted: the chart's licence header, four comment lines]
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-controller
  namespace: envoy-ai-gateway-system
  [… omitted: the labels and annotations every rendered document carries]
spec:
  [… omitted: the replica count, the selector, and the pod template's labels, service account, host-network setting and security settings]
      containers:
        - name: ai-gateway-helm
          [… omitted: the container's security settings, its image and pull policy, and its ports]
          args:
            [… omitted: the controller's logging, external-processor, gateway-namespace and endpoint arguments]
            - --tlsCertDir=/certs
            - --tlsCertName=tls.crt
            - --tlsKeyName=tls.key
            [… omitted: the controller's webhook-port, leader-election, prefix, cache, namespace, quota and session-encryption arguments]
          [… omitted: the probes, the environment and the resources]
          volumeMounts:
            - mountPath: /certs
              name: certs
              readOnly: true
      volumes:
        - name: certs
          secret:
            secretName: ai-gateway-webhook-tls
```

The controller reads its certificate from `/certs`, the `certs` volume, which is
the Secret `ai-gateway-webhook-tls` — a name the build passes through as written
and the cluster resolves when the pod starts.

## The same bytes from one build to the next

Built a second time with `--verify-determinism`, `release-own-certificate.yaml`
prints:

```text
[… omitted: the total build time, which differs per run]
Build completed: 14 files written to <workspace>/dist
```

`--verify-determinism` renders every component twice from the same input and
halts if the two renders differ. It passes here, and the tree it writes is byte
for byte the tree the first build wrote. Both hold because the one document the
chart generates afresh never reaches the output.

## Without the entry: the build that checks determinism halts

`release-negative-without-omits.yaml` is the own-certificate Release deployed
through `manifest-without-omits.yaml`, which binds the teaching Recipe with no
`omits:` entry. Built with `--verify-determinism`:

```text
[… omitted: the pull's lines]
[TRANSLATION_ERROR E0058] instance ai-controller
  rendering node "ai-controller"
  caused by: wasmengine: node "ai-controller" (provider "helm"): two renders of identical input produced different output: provider render is not deterministic
```

The build exits `1`. The two renders of the controller differ, because the chart
generated a different key and certificate each time. The pull also renders the
Release, to find any external inputs it needs pinned, and meets the same halt
there; that is why the omitted pull lines carry the sentence a second time. The
lockfile is still written.

Built without the flag, the same Release completes. Its tree holds the chart's
documents the own-certificate Release's holds — less the resource definitions,
which the teaching Recipe does not emit — and one more, the Secret the chart
generated:

```yaml
# dist/helm/ai-controller-secret-envoy-ai-gateway-system-ai-gateway-webhook-tls.yaml
apiVersion: v1
kind: Secret
metadata:
  name: ai-gateway-webhook-tls
  namespace: envoy-ai-gateway-system
  [… omitted: the labels and annotations every rendered document carries]
data:
  [… omitted: the three base64-encoded entries ca.crt, tls.crt and tls.key]
```

Build it twice and the two trees differ in exactly those three values. An
ordinary build renders each component once, so it writes whichever key it
generated and does not notice; the check is what makes the difference visible.
Applied, this file would replace the Secret the operator created.

The halt is described under
[A provider rendered the same input twice and produced different output](../../errors/fatal-halts.md#a-provider-rendered-the-same-input-twice-and-produced-different-output),
whose fix names the two ways out when the difference is a value a chart you
source generates: supply the value through a setting the chart offers, or, where
the generated document is one the Release must not ship, leave it out with an
`omits:` entry — the answer the standard-library Recipe takes.

## An entry that matches nothing

`release-negative-stale-omits.yaml` is the own-certificate Release deployed
through `manifest-stale-omits.yaml`, which binds the teaching Recipe whose entry
names the Secret after the controller's rendered name rather than after the key:

```yaml
# catalog/recipe/helm/envoy-ai-gateway-operator-stale-omits/1.0.0/recipe.yaml, its omits: field
  omits:
    - kind: Secret
      name: "{{ .context.rendered_name }}-webhook-tls"
      when: '{{ ne (optional .infra "webhook_tls_secret" "") "" }}'
```

Built:

```text
[… omitted: the pull's lines]
[TRANSLATION_ERROR E0334] instance ai-controller
  rendering node "ai-controller"
  caused by: [CATALOG_ERROR] instance ai-controller
    an omits entry left out nothing the source rendered (node "ai-controller", provider "provider/helm:0.8.8-75-g9e6ef4e0", "envoy-ai-gateway-operator-stale-omits" omits[0], kind "Secret", name "ai-controller-webhook-tls"). correct the entry so it names something the source renders, or remove it; a source upgrade that renamed or removed it is the usual cause
```

The provider is named with the version of the binary that ran the build, so your
own run shows your binary's version there.

The build exits `1`, and the pull's lines carry the same sentence for the same
reason as above. The message reads left to right as where to look: the
component, the provider that rendered it, the Recipe declaring the entry and the
entry's position in its `omits:` list, counting from `0`, and then the kind and
the name the entry resolved to. The `when:` condition is true in this mode, so
the entry applies; its name renders to `ai-controller-webhook-tls`, the chart
named its Secret `ai-gateway-webhook-tls`, and the entry left nothing out.

Every entry that applies must leave something out, and the build stops on one
that does not, because an entry matching nothing is a statement about the source
that is no longer true. The usual cause is a source upgrade that renamed the
document. The renamed document is then in the output under its new name — the
very document the entry was written to keep out — and the halt is what stops it
from shipping unnoticed. In this build, the Secret the chart generated is such a
document: the entry was written to keep it out, and names something else. To
correct an entry, compare it with what the source renders now: build
with the entry removed, as `release-negative-without-omits.yaml` does without
the check, and read the name off the file the chart wrote.

`E0334` is listed in [the diagnostic reference](../../errors/sentinels.md) as
`omit-matched-nothing`, and described under
[An omits entry left out nothing the source rendered](../../errors/fatal-halts.md#an-omits-entry-left-out-nothing-the-source-rendered).
The field itself — every entry field, the template context, what a Release can
decide about an entry, and which providers honour it — is
[Recipe → The `omits:` field](../../entities/recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source).

## Checking every build

This self-check runs in a checkout of the documentation repository, which holds
the shared build helper it uses; a copy written by `aggrega scaffold --example`
does not carry that helper.

```bash
./check.sh
```

`check.sh` builds the four Releases through `./build-release.sh` and checks each
outcome against the one this page describes. It builds each passing Release
twice, the second time with `--verify-determinism`: both builds must exit 0 and
write the same files, byte for byte, and the tree must hold, counted by the kind
of every rendered document, a `Certificate` and an `Issuer` and no `Secret` in
the cert-manager mode, and none of the three in the own-certificate mode, with
the controller Deployment's `certs` volume naming `ai-gateway-webhook-tls`. A
guardrail Release must exit non-zero with exactly one halt carrying the short
code and the sentence this page shows for it, and the stale entry's halt must
name the entry. It prints one line per Release and exits 1 if any outcome
differs, printing that build's output:

```text
RELEASE                              EXIT   EXPECTED  VERDICT
------------------------------------------------------------------------------------------------
release-cert-manager.yaml            0/0    pass      OK: byte-identical twice; Certificate=1 Issuer=1 Secret=0
release-own-certificate.yaml         0/0    pass      OK: byte-identical twice; Certificate=0 Issuer=0 Secret=0; certs volume: ai-gateway-webhook-tls
release-negative-without-omits.yaml  1      halt      OK: E0058, the expected sentence
release-negative-stale-omits.yaml    1      halt      OK: E0334, the expected sentence, naming "envoy-ai-gateway-operator-stale-omits" omits[0]

check: every build ended as expected.
```

It needs what a single build needs: the standard-library catalog, and the
network for the chart. It uses the binary `./build-release.sh` resolves, so
`AGGREGA_BIN` chooses it; arguments after `--` reach every build. It refuses to
start while a `dist/` sits in this directory, because it compares the trees the
builds write, and it leaves none behind. Its exit status is the whole verdict,
so a pipeline can run it in place of building each Release on its own.

## Where the compiler does not interpret

The compiler does not know what a Secret is, what the controller does with one,
or why a chart would generate one. It evaluates the entry's templates as it
evaluates any Recipe template, hands the kind and name they resolve to to the
helm provider with the component's input, and the provider drops the rendered
documents that match and reports how many each entry dropped. It never looks for
`ai-gateway-webhook-tls` in a cluster, never creates it, and never checks that it
holds the three entries the controller reads: the name is a string the Release
supplies, piped into the chart's values and into the entry. That the Secret
exists before the controller starts is the deploying side's to arrange.

## Files

- `aggregate.yaml` — the AI gateway controller, the one component; the same for
  every Release.
- `manifest.yaml` — binds the controller to the standard-library Recipe; shared
  by the two passing Releases.
- `manifest-without-omits.yaml`, `manifest-stale-omits.yaml` — bind it to one of
  the two teaching Recipes.
- `release-cert-manager.yaml`, `release-own-certificate.yaml` — the two
  certificate modes.
- `release-negative-without-omits.yaml`, `release-negative-stale-omits.yaml` —
  the own-certificate mode through each teaching Recipe; both halt.
- `catalog/recipe/helm/envoy-ai-gateway-operator-without-omits/1.0.0/` — the
  teaching Recipe with no `omits:` entry, and the `entity.lock` pinning its
  chart.
- `catalog/recipe/helm/envoy-ai-gateway-operator-stale-omits/1.0.0/` — the
  teaching Recipe whose entry matches nothing, and its `entity.lock`.
- `.aggrega-config.yaml` — the catalog search stack and the registry.
- `build-release.sh` — builds one Release, echoing the equivalent `aggrega build`
  command.
- `check.sh` — builds all four and checks each outcome.
