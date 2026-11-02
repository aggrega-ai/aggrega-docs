---
example:
  level: authoring
  products: []
  shows: [credentials, catalog-authoring]
---

# Multi-key credentials on a synthesized helm Deployment

A single stateless app rendered on Kubernetes by the helm provider's Workload
synthesis — no external chart. The app reads **two data keys from one secret**:
a username and a password. One credential slot backs both, filled by a
multi-key referenceable credential.

## Building

```bash
aggrega build --release release.yaml --auto-pull
```

The catalog resolves from two sources named in `.aggrega-config.yaml`: the
example's own `./catalog` (the `local/compute/app` Component and its
`helm/app` synth Recipe) and the hub registry (the multi-key credential
Feature, its FeatureRecipe, and the helm Provider). `--auto-pull` writes the
lockfile a fresh clone lacks during the build. Three manifests land under
`dist/helm/helm/`.

## One slot, two keys

The Component declares one transparent credential slot, `app_credentials`
(`inject: [env]`). The Aggregate fills it with `core/referenced-secret-set` —
a multi-key referenceable credential that materializes **one** Kubernetes
Secret carrying a caller-supplied set of data keys and publishes only the
Secret's locator (`provides.name`). Here the caller supplies two keys:

```yaml
# aggregate.yaml
features:
  app_credentials:
    type: core/referenced-secret-set
    values:
      entries:
        - key: db_username
          value: appuser
        - key: db_password
          value: dev-pw-change-me
```

The Manifest maps `core/referenced-secret-set` to the `k8s-secret-set`
FeatureRecipe, which renders one Secret carrying both keys:

```yaml
# app--app-zucredentials--app-secret-app-app-credentials.yaml
[… omitted: the apiVersion and the Secret kind]
metadata:
  name: app-app-credentials
  [… omitted: the labels and annotations every rendered document carries]
stringData:
  db_username: "appuser"
  db_password: "dev-pw-change-me"
```

## Referencing one slot by each key

The synth Recipe references the **same** slot twice — once per data key. Each
entry names the data key it reads through the `key` field; the entry's map key
is the env-var name:

```yaml
# helm/app recipe workload
attachments:
  APP_DB_USER:
    from: app_credentials
    as: env
    key: db_username
  APP_DB_PASSWORD:
    from: app_credentials
    as: env
    key: db_password
```

The synthesizer renders one env `secretKeyRef` per entry. Both reference the
same Secret (`provides.name`), each with its own data key:

```yaml
# app-deployment.yaml (container env)
- name: APP_DB_USER
  valueFrom:
    secretKeyRef:
      name: app-app-credentials   # == the Secret's metadata.name
      key: db_username
- name: APP_DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: app-app-credentials   # same Secret
      key: db_password            # different data key
[… omitted: the GREETING variable, set from the Aggregate's greeting value]
```

The `key` field is what makes a multi-key secret consumable from a synthesized
Workload. When an entry omits `key`, it reads the slot's single published data
key instead — the shape a single-key credential (`core/referenced-secret`)
uses, which publishes both a locator and a key.

## Operator sizing

`release.yaml` fulfills the operator-sizing pillar per environment: the
container image tag comes from `infra.image_tag` (`myapp:1.2`). The developer's
Aggregate never carries this field.
