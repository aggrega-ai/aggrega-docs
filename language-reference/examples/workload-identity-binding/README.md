---
example:
  level: authoring
  products: []
  shows: [catalog-authoring, features]
---

# Binding a workload to what an attachment publishes

A single stateless app rendered on Kubernetes by the helm provider's Workload
synthesis — no external chart. The app runs under a **cloud identity its
Component declares a slot for and the Release fills**: the attachment filling
the slot emits one Kubernetes ServiceAccount and publishes its name, and the
app's Recipe binds the pod to that published name.

The teaching point is the direction of the flow. The producer states the name
once; the consumer reads it. Nothing on the consuming side restates a value the
producer already owns, so the two cannot drift apart.

## Building

```bash
aggrega build --release release.yaml --auto-pull
```

The catalog resolves from two sources named in `.aggrega-config.yaml`: the
example's own `./catalog` (the `local/compute/identity-app` Component and its
`helm/identity-app` synth Recipe) and the hub registry (the
`core/gcp-workload-identity` Feature and its FeatureRecipe). `--auto-pull` writes
the lockfile a fresh clone lacks during the build.
Three manifests land under `dist/helm/helm/`.

## The Component declares the need; the Release fills it

The app needs an identity to run under, so its Component declares one, as a
required `identity` slot:

```yaml
# catalog/component/local/compute/identity-app/1.0.0/component.yaml
featuresSchema:
  identity:
    required: true
    selector: "feature.aggrega.ai/kind!=secret"
    inject: []
```

The Aggregate writes nothing for it. Which identity the app runs under, on which
cloud, is the Operator's choice for each target, so the Release fills the slot
with the identity Feature and every field that Feature needs:

```yaml
# release.yaml
features:
  identity:
    type: core/gcp-workload-identity
    infra:
      service_account_name: app-workload-identity
      gcp_service_account: app-dev@example-project.iam.gserviceaccount.com
```

A Release that leaves the slot unfilled halts, naming the slot. A Release for an
EKS cluster fills the same slot with `core/aws-irsa` and its `role_arn` instead,
and its Manifest maps that Feature to its FeatureRecipe. The selector keeps a
credential out of the slot: a secret-kind Feature filling it halts.

## The attachment publishes

The Feature declares in its `schema.provides` that it publishes a `name`, and its
FeatureRecipe publishes it — from the same local the emitted chart names the
ServiceAccount with, which is the operator-set `service_account_name` when the
Release writes one:

```yaml
# FeatureRecipe gcp-workload-identity
locals:
  sa_name: '{{ default (printf "%s-%s" .context.rendered_name (.attachment_name | replace "_" "-")) .infra.service_account_name }}'
provides:
  name: "{{ .locals.sa_name }}"
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
[… omitted: the Deployment's metadata, selector and pod template up to the containers]
      containers:
        - name: main
          [… omitted: the image and the port]
          env:
            [… omitted: the GREETING variable]
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
image tag comes from `infra.image_tag` (`myapp:1.2`), and the identity — its
Feature and that Feature's fields — comes from the slot's fill. The Developer's
Aggregate carries neither.
