# Binding a workload to what an attachment publishes

A single stateless app rendered on Kubernetes by the helm provider's Workload
synthesis — no external chart. The app runs under a **cloud identity supplied by
an attached Feature**: the attachment emits one Kubernetes ServiceAccount and
publishes its name, and the app's Recipe binds the pod to that published name.

The teaching point is the direction of the flow. The producer states the name
once; the consumer reads it. Nothing on the consuming side restates a value the
producer already owns, so the two cannot drift apart.

## Building

```bash
./build-release.sh
# equivalent to: aggrega build --release release.yaml
```

The catalog resolves from two sources named in `.aggrega-config.yaml`: the
example's own `./catalog` (the `local/compute/identity-app` Component and its
`helm/identity-app` synth Recipe) and the sibling hub catalog (the
`core/gcp-workload-identity` Feature, its FeatureRecipe, and the helm Provider).
Three manifests land under `dist/helm/helm/`.

## The attachment publishes

The Developer attaches the identity and states nothing about it beyond the need:

```yaml
# aggregate.yaml
features:
  identity:
    type: core/gcp-workload-identity
```

Cloud identity is operational configuration, so every field it needs is fulfilled
by the Operator per environment:

```yaml
# release.yaml
features:
  identity:
    infra:
      service_account_name: app-workload-identity
      gcp_service_account: app-dev@example-project.iam.gserviceaccount.com
```

The Feature declares in its `schema.provides` that it publishes a `name`, and its
FeatureRecipe publishes it — from the same operator-set field the emitted chart
names the ServiceAccount with:

```yaml
# FeatureRecipe gcp-workload-identity
provides:
  name: "{{ .infra.service_account_name }}"
```

## The Recipe consumes

The consuming Recipe reads the published name at
`.features.<instance-name>.provides.<key>`:

```yaml
# helm/identity-app recipe workload
serviceAccount: "{{ .features.identity.provides.name }}"
containers:
  main:
    variables:
      IDENTITY_SERVICE_ACCOUNT: {{ .features.identity.provides.name }}
```

Both reads resolve to the ServiceAccount the attachment actually emitted:

```yaml
# app--identity--app-serviceaccount-app-workload-identity.yaml
[… omitted: the apiVersion]
kind: ServiceAccount
metadata:
  name: app-workload-identity
  annotations:
    iam.gke.io/gcp-service-account: "app-dev@example-project.iam.gserviceaccount.com"
    [… omitted: the boundary and recipe annotations, and the labels, that every rendered document carries]
```

```yaml
# app-deployment.yaml
      containers:
        - name: main
          env:
            - name: IDENTITY_SERVICE_ACCOUNT
              value: app-workload-identity
      serviceAccountName: app-workload-identity
```

## Why read it rather than repeat it

The alternative is to write `app-workload-identity` a second time on the
consuming side. That works until someone changes the Operator's
`service_account_name` and updates only one of the two places — at which point
the pod requests a ServiceAccount that does not exist, and nothing in the
compilation notices, because both spellings are valid strings.

Reading `.features.identity.provides.name` removes the second spelling. The same
shape applies to every attachment: a credential publishes its Secret's locator at
`.features.<slot>.provides.name`, a sidecar publishes its port, an identity
publishes its name. The full field-by-field attachment shape is at
[templates/template-context-contract.md](../../templates/template-context-contract.md#the-attachment-shape).

## Operator sizing

`release.yaml` fulfills the operator-sizing pillar per environment: the container
image tag comes from `infra.image_tag` (`myapp:1.2`), and the identity fields come
from the attachment's own `infra`. The Developer's Aggregate carries neither.
