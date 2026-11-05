# Import a Dify application

This walkthrough imports an application exported from Dify — a chat assistant
on an OpenAI model — reviews what the import drafts, and builds the standard
library's Dify installation, carrying the application, for Kubernetes. Every
file and every block of output below comes from a real run; the application
and each stage of the walkthrough are in the
[import-dify](../../language-reference/examples/import-dify/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## The application

`support-assistant.yml`, written for this walkthrough, is a chat application in
Dify's DSL, the YAML Dify exports for an application, at DSL version `0.7.0`:
an opening statement, a short prompt, and the model it answers with, named by
its provider:

<!-- quotes: source/support-assistant.yml -->
```yaml
  model:
    completion_params:
      stop: []
      temperature: 0.4
    mode: chat
    name: gpt-4o-mini
    provider: langgenius/openai/openai
```

Beside it, an `.aggrega-config.yaml` makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside support-assistant.yml.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

Name a checkout of the standard-library catalog, by its absolute path, for the
import and the build to read:

```bash
export AGGREGA_CATALOG_DIRS=/path/to/aggrega-catalog
```

## Run the import

The standard library's Dify installation is realized on Kubernetes only: its
Dify components have Helm Recipes and no Compose Recipe. So the import names
the `helm` target:

<!-- quotes: import-command -->
```bash
aggrega import support-assistant.yml --target helm
```

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
wrote aggregate.yaml
wrote manifest.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

<!-- quotes: draft/import.txt -->
```text
[… omitted: a warning that the importer runs unverified, printed where its module is read from beside its Plugin entity in a catalog folder rather than fetched]
read as the dify format, with drafted paths relative to <workspace>
warn: node model_config.model (model) names the model "gpt-4o-mini" of the model provider "langgenius/openai/openai", whose credentials are set inside Dify, and core/ai-agent/dify configures that for itself rather than reaching it through a socket, so the draft wires no part for it
info: the importer drafted no Release, so nothing references the drafted Manifest "manifest.yaml"; name it as a Release's spec.manifest to build against it
made no choice for model_config.model (model)
```

- **The `warn` line** says that the model stays inside Dify: Dify configures
  its model providers, and their keys, for itself, so the draft wires no model.
  Once Dify runs, you set the OpenAI provider's key in Dify's settings.
- **The `info` line** is about the Release: the Dify import drafts none, so
  you write it.

## What it wrote

`aggregate.yaml` — the standard library's Dify installation, `core/dify`, an
Aggregate the draft composes under `aggregates`, with the application carried
as written in its `app_definition` parameter, most of it left out here:

<!-- quotes: draft/aggregate.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the dify format.
spec:
  aggregates:
    # An import sees the Components of the workspace's catalog and none of its Aggregates, so it does not check that the catalog holds core/dify.
    # Left for the Release, since the source cannot supply it:
    #   - infra.owner_email on the api component of core/dify, the email of the installation's owner account the application is imported under, set under components.api in the Release's routing entry for this entry
    #   - the owner_password slot on that api component, the owner account's password, attached in the same routing entry with type core/referenced-secret
    dify:
      type: core/dify
      parameters:
        app_definition: |
          app:
            description: Answers questions about the support plans of a small software company.
          [… omitted: the rest of the application, as exported]
          version: 0.7.0
```

The installation is ten components — Dify's API server, its worker, its
scheduler, its web front end, its code sandbox, its plugin runtime, an egress
proxy, PostgreSQL, a Redis-compatible cache and Weaviate — wired to each
other, and the import of the application is a step its API server's Recipe
renders. The comments above the entry name what the application cannot supply:
the owner account the application is imported under, and its password.

`manifest.yaml` — empty:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      type: {}
```

`--target` maps each component type the drafted Aggregate declares, and this
one declares none of its own: every component is the installation's. The
review maps them.

`.aggrega-import.json` is the record of what the import wrote, which a later
`aggrega import --sync` reads.

## Review

The review starts by writing the Release the import did not, with an
environment, and validating:

```bash
aggrega validate --release release.yaml
```

```text
  [OPS_ERROR E0076] .spec.aggregates.dify
    sub-module placed in no boundary: route it into a boundary under `aggregates`, or name its components there under `components` (Release imported/flow, at .spec.aggregates.dify, "dify")
release dependency validation failed: 1 diagnostic(s)
```

The review changes:

- **Place the installation in a boundary, and name its owner there.** The
  Release routes `dify` into a boundary, `platform`, and in that routing entry
  sets the owner on the installation's `api` component: `infra.owner_email`,
  and `owner_password` attached as a `core/referenced-secret` naming the
  Kubernetes Secret that holds the password, `dify-owner`, under the data key
  `value`. With no email, validation stops with an assertion of the API
  server's Recipe that says so: "the Dify server "dify-zdapi" is given
  values.app_definition to import but no infra.owner_email".
- **Map every component of the installation.** With the boundary in place,
  validation names each component no Recipe resolves for, and each credential
  attachment no realization resolves for:

  ```text
    [OPS_ERROR E0099] .spec.components.db
      no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type (Manifest, at .spec.components.db, "dify.db", of type "core/datastore/postgres", recipes implementing it "cloudformation/postgres-rds:1.0.0, compose/postgres:1.0.0, helm/postgres-cloudnative-pg:1.0.0, helm/postgres-external:1.0.0, helm/postgres:1.0.0, terraform/postgres-cloud-sql:1.0.0, terraform/postgres-flexible-server:1.0.0, terraform/postgres-rds-terraform-aws-modules:1.0.0, terraform/postgres-rds:1.0.0"). pin one of them in the Manifest
    [… omitted: one such line for each of the other nine components]
    [E0099]
      no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: feature "password" (type "core/referenced-secret"); no feature recipe implements this type
    [… omitted: one such line for each of the other credential attachments]
  release dependency validation failed: 27 diagnostic(s)
  ```

  The Manifest maps each component to its Helm Recipe — PostgreSQL to
  `helm/postgres`, since the installation fills the database's credential slot
  and `helm/postgres-cloudnative-pg` halts on a filled one — and
  `core/referenced-secret` to `helm/k8s-existing-secret`, so every credential
  is read from a Secret already in the namespace and none is written into a
  rendered file.
- **Pass the installation's own credentials.** The installation takes five
  credentials as parameters — its database password, its application secret
  and three keys its components present to each other — and each defaults to a
  development value every reader of the catalog holds. With
  `helm/k8s-existing-secret`, each is the name of a Secret, so the review
  passes the same Secret, `dify-credentials`, for all five; it holds each
  under its own data key, `db-password`, `secret-key`, `code-execution-key`,
  `plugin-daemon-key` and `inner-api-key`.

The reviewed `aggregate.yaml`, the application left out here as above:

<!-- quotes: reviewed/aggregate.yaml -->
```yaml
# The draft aggregate.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the dify format.
spec:
  aggregates:
    # An import sees the Components of the workspace's catalog and none of its Aggregates, so it does not check that the catalog holds core/dify.
    # Left for the Release, since the source cannot supply it:
    #   - infra.owner_email on the api component of core/dify, the email of the installation's owner account the application is imported under, set under components.api in the Release's routing entry for this entry
    #   - the owner_password slot on that api component, the owner account's password, attached in the same routing entry with type core/referenced-secret
    dify:
      type: core/dify
      parameters:
        # Reviewed: the installation's own credentials, each the name of the
        # Secret holding it, under the data key the module names, in place of
        # the evaluation defaults every reader of the catalog knows.
        db_password: dify-credentials
        secret_key: dify-credentials
        code_execution_key: dify-credentials
        plugin_daemon_key: dify-credentials
        inner_api_key: dify-credentials
        app_definition: |
          app:
          [… omitted: the application, as exported]
          version: 0.7.0
```

The Release:

<!-- quotes: reviewed/release.yaml -->
```yaml
# The Release the review wrote: the Dify import drafts none.
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  environment: development
  version: 0.1.0
spec:
  aggregate: imported/flow
  manifest: imported/flow
  boundaries:
    platform:
      aggregates:
        dify:
          components:
            # The owner account the application is imported under, and its
            # password, read from a Secret named dify-owner, under the data key
            # value.
            api:
              infra:
                owner_email: owner@example.com
              features:
                owner_password:
                  type: core/referenced-secret
                  infra:
                    origin: dify-owner
```

The reviewed `manifest.yaml`:

<!-- quotes: reviewed/manifest.yaml -->
```yaml
# The draft manifest.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      # Reviewed: a Helm Recipe for each component the Dify installation
      # composes. The draft mapped none, since the drafted Aggregate declares
      # no component of its own.
      type:
        core/ai-agent/dify: helm/dify
        core/ai-agent/dify-worker: helm/dify-worker
        core/ai-agent/dify-worker-beat: helm/dify-worker-beat
        core/ai-agent/dify-web: helm/dify-web
        core/ai-agent/dify-sandbox: helm/dify-sandbox
        core/ai-agent/dify-plugin-daemon: helm/dify-plugin-daemon
        core/ai-agent/dify-ssrf-proxy: helm/dify-ssrf-proxy
        core/datastore/postgres: helm/postgres
        core/datastore/redis: helm/redis
        core/datastore/weaviate: helm/weaviate
    # Reviewed: every credential is read from a Secret already in the
    # namespace, so none is written into a rendered file.
    features:
      type:
        core/referenced-secret: helm/k8s-existing-secret
```

## Validate and build

```bash
aggrega validate --release release.yaml
aggrega build --release release.yaml --auto-pull
```

The validation prints:

```text
  notice: LINT: Feature "core/referenced-secret" at core/referenced-secret:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

and the build, with `<workspace>` standing for the folder holding the reviewed
files:

```text
Pull complete: release.lock (entities=24, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/referenced-secret" at core/referenced-secret:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 24 files written to <workspace>/dist
```

The `notice` line is advisory: the secret Feature accepts its `origin` from the
Aggregate's `values` or the Release's `infra`, and the notice reports that one
leaf is declared in both. It changes no verdict.

The build writes the installation's Kubernetes manifests under
`dist/boundaries/platform/helm/`. Among them is the Job that imports the
application, `dify.api/dify-app-import.job.yaml`. It waits for Dify's API
server to answer, performs Dify's first-time setup as the owner account the
Release names where that setup has not run, and imports the application:

```yaml
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: import
          image: "langgenius/dify-api:1.17.0"
          command: ["python", "/seed/import.py"]
          env:
            - name: DIFY_API_URL
              value: "http://dify-zdapi-default:5001"
            - name: OWNER_EMAIL
              value: "owner@example.com"
            - name: OWNER_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: "dify-owner"
                  key: "value"
          volumeMounts:
            - name: seed
              mountPath: /seed
              readOnly: true
      volumes:
        - name: seed
          configMap:
            name: dify-zdapi-app
```

The application itself is in the ConfigMap beside it. Before applying the
manifests, create the two Secrets they read in the namespace you deploy to:
`dify-owner`, holding the owner's password under `value`, and
`dify-credentials`, holding the five credentials under their data keys. A
workload naming a Secret that does not exist does not start.
