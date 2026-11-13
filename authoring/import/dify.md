# Import a Dify application

This walkthrough imports an application exported from Dify — a chat assistant
on an OpenAI model — reviews what the import drafts, and builds the standard
library's Dify installation, carrying the application, for Kubernetes. Every
file and every block of output below comes from a real run; the application
and each stage of the walkthrough are in the
[import-dify](../../language-reference/examples/import-dify/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## Scaffold the example

Write the example into a new folder named after it:

```bash
aggrega scaffold --example import-dify
```

It then prints the commands to run next. The first changes into the new folder;
the one after it, below, changes into its `source` folder, which holds what this
page imports and is where the import runs:

```bash
cd import-dify
```

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
# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside support-assistant.yml.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The workspace names no catalog folder, so the import reads the standard-library
catalog from the registry it fetches its importer from: a signed snapshot of the
published catalog, fetched, verified and kept in the workspace's content cache
by the first import, and named by its digest in the record the import writes
beside its drafts. A workspace that names its own catalog folders — in
`AGGREGA_CATALOG_DIRS`, or under `workspace.catalog_dirs` — imports against
those instead. Change into `source`:

```bash
cd source
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
  Once Dify runs, you install its OpenAI provider and set the provider's key,
  as [Run it](#run-it) shows.
- **The `info` line** is about the Release: the Dify import drafts none, so
  you write it.

## What it wrote

The Aggregate and the Manifest are named `imported/support-assistant`, after
the application's name, `Support assistant` under `app`, reduced to
`support-assistant` — an application with no name is named after its file —
under the namespace the importer's `target_namespace` setting sets, `imported`
unless you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — the standard library's Dify installation, `core/dify`, an
Aggregate the draft composes under `aggregates`, with the application carried
as written in its `app_definition` parameter, most of it left out here, and
the installation's `secret_key` passed down from a parameter the draft
declares:

<!-- quotes: draft/aggregate.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support-assistant
  version: 0.1.0
  description: Draft Aggregate imported from a source in the dify format.
spec:
  parameters:
    secret_key:
      type: string
      required: true
      minLength: 1
      description: "Passed down to core/dify's secret_key parameter, which has no default; that parameter's description in core/dify says what the value is."
  aggregates:
    # An import sees the Components of the workspace's catalog and none of its Aggregates, so it does not check that the catalog holds core/dify.
    # Left for the Release, since the source cannot supply it:
    #   - the secret_key parameter declared above, which this entry passes down to core/dify
    #   - infra.owner_email on the api component of core/dify, the email of the installation's owner account the application is imported under, set under components.api in the Release's routing entry for this entry
    #   - the owner_password slot on that api component, the owner account's password, attached in the same routing entry with type core/referenced-secret
    dify:
      type: core/dify
      parameters:
        secret_key: "{{ .parameters.secret_key }}"
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
renders. Its application secret, the key Dify signs sessions with and encrypts
the model-provider keys it stores under, has no default in `core/dify`, so the
draft declares `secret_key` as a parameter of its own, with no default, and
passes it down for the Release to fulfill. The comments above the entry name
what the application cannot supply: that parameter, the owner account the
application is imported under, and its password.

`manifest.yaml` — empty:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/support-assistant
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
  [DEVELOPER_ERROR E0165] .spec.parameters.secret_key
    required parameter not supplied (Aggregate, at .spec.parameters.secret_key, parameter "secret_key" is required but not supplied by Release)
release dependency validation failed: 1 diagnostic(s)
```

The review changes:

- **Fulfill the application secret.** The Release supplies `secret_key` under
  its `parameters`; what the value is follows the Manifest, as the last change
  below says. With it supplied, validation names the next thing to settle:

  ```text
    [OPS_ERROR E0076] .spec.aggregates.dify
      sub-module placed in no boundary: route it into a boundary under `aggregates`, or name its components there under `components` (Release imported/support-assistant, at .spec.aggregates.dify, "dify")
  release dependency validation failed: 1 diagnostic(s)
  ```

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
      no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: feature "password" (type "core/referenced-secret"); feature recipes implementing it: [helm/k8s-existing-secret:1.0.0 helm/k8s-external-secret:1.0.0 helm/k8s-secret-from-parameter:1.0.0]; pin one in the Manifest
    [… omitted: one such line for each of the other credential attachments, and the LINT notice the validation below prints as well]
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
  and three keys its components present to each other. The application secret
  has no default: the draft passes it down from its own `secret_key`
  parameter, and the Release fulfills that. The other four each default to a
  development value every reader of the catalog holds. With
  `helm/k8s-existing-secret`, each is the name of a Secret, so the review
  passes the same Secret, `dify-credentials`, for those four, and the Release
  names it for `secret_key`; it holds each under its own data key,
  `db-password`, `secret-key`, `code-execution-key`, `plugin-daemon-key` and
  `inner-api-key`.

The reviewed `aggregate.yaml`, the application left out here as above:

<!-- quotes: reviewed/aggregate.yaml -->
```yaml
# The draft aggregate.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support-assistant
  version: 0.1.0
  description: Draft Aggregate imported from a source in the dify format.
spec:
  parameters:
    secret_key:
      type: string
      required: true
      minLength: 1
      [… omitted: its description, as drafted]
  aggregates:
    # An import sees the Components of the workspace's catalog and none of its Aggregates, so it does not check that the catalog holds core/dify.
    # Left for the Release, since the source cannot supply it:
    #   - the secret_key parameter declared above, which this entry passes down to core/dify
    #   - infra.owner_email on the api component of core/dify, the email of the installation's owner account the application is imported under, set under components.api in the Release's routing entry for this entry
    #   - the owner_password slot on that api component, the owner account's password, attached in the same routing entry with type core/referenced-secret
    dify:
      type: core/dify
      parameters:
        secret_key: "{{ .parameters.secret_key }}"
        # Reviewed: the installation's other four credentials, each the name of
        # the Secret holding it, under the data key the module names, in place
        # of the evaluation defaults every reader of the catalog knows.
        db_password: dify-credentials
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
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support-assistant
  environment: development
  version: 0.1.0
spec:
  aggregate: imported/support-assistant
  manifest: imported/support-assistant
  # The installation's application secret, which the Aggregate passes down to
  # core/dify: with the Manifest binding the credential to an existing Secret,
  # the name of the Secret holding it under the data key secret-key.
  parameters:
    secret_key: dify-credentials
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
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/support-assistant
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
Pull complete: release.lock (entities=25, source_artifacts=0, external_inputs=0)
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
  podFailurePolicy:
    rules:
      - action: FailJob
        onExitCodes:
          containerName: import
          operator: In
          values: [2]
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

The application itself is in the ConfigMap beside it. When Dify refuses what
the step sends it, with a client-error reply other than a request timeout or a
rate limit, or by reporting the import failed, the step prints the message
Dify's reply carries and exits with status 2, as it does when the definition
names no application under `app.name`; the Job's `podFailurePolicy` fails the Job at
that attempt, since a retry would be refused the same way; any other failure,
such as the server not answering within about ten minutes, is retried.

## Run it

Before applying the manifests, create the two Secrets they read: `dify-owner`,
holding the owner's password under `value`, and `dify-credentials`, holding
the five credentials under their data keys. A workload naming a Secret that
does not exist does not start. Set the owner's password in your shell, as
`DIFY_OWNER_PASSWORD`, since you sign in with it below. Dify takes an owner password of at least eight characters holding a
letter and a digit: given any other, the import Job fails as soon as Dify refuses the setup,
and its log reads
`first-time setup was refused with HTTP 422: Validation error for parameter 'payload'`,
the reply Dify gives an owner account it refuses. The wait below waits for the
Job to complete, and a failed Job never completes, so it then runs to its
timeout; run
`kubectl wait --for=condition=failed job/dify-zdapi-app-import --timeout=15m`
in a second terminal beside it, and that wait returns as soon as the Job
fails. Delete the Job and the `dify-owner` Secret, create the Secret again with
a password Dify takes, and apply again. Write `dify-credentials.env`, one line for each data key:
`db-password=`, `secret-key=`, `code-execution-key=`, `plugin-daemon-key=` and
`inner-api-key=`, each followed by a value of your own. Then create the two
Secrets. The cluster holds the values then, so delete the two files:

```bash
printf 'value=%s\n' "$DIFY_OWNER_PASSWORD" > dify-owner.env
kubectl create secret generic dify-owner --from-env-file=dify-owner.env
kubectl create secret generic dify-credentials --from-env-file=dify-credentials.env
rm dify-owner.env dify-credentials.env
```

```text
secret/dify-owner created
secret/dify-credentials created
```

Apply the manifests, as the run step of
[How an import runs](README.md#how-an-import-runs) explains — `-R` reaches the
Job and the two ConfigMaps in `dify.api/` and `dify.proxy/` — then wait for the
import Job and read its log, and wait for the plugin runtime:

```bash
kubectl apply -R -f dist/boundaries/platform/helm/
kubectl wait --for=condition=complete job/dify-zdapi-app-import --timeout=15m
kubectl logs job/dify-zdapi-app-import
kubectl rollout status statefulset/dify-zdplugins
```

```text
service/dify-zdapi-default created
deployment.apps/dify-zdapi created
[… omitted: a line for each of the other Services, Deployments and StatefulSets]
job.batch/dify-zdapi-app-import created
configmap/dify-zdapi-app created
configmap/dify-zdproxy-config created
job.batch/dify-zdapi-app-import condition met
first-time setup done: owner account owner@example.com
imported 'Support assistant' as application 7e03e85c-b13f-4ddc-b539-040470a61d4c
partitioned roll out complete: 1 new pods have been updated...
```

The log names the application's identifier, which you need below. The steps
that follow call Dify's console API on its API server, so in a second terminal
forward a local port to the server's Service, and leave the command running
there:

```bash
kubectl port-forward svc/dify-zdapi-default 5001:5001
```

Back in the first terminal, where `DIFY_OWNER_PASSWORD` is set, sign in as the
owner. The console API takes the password Base64-encoded, and signing in
leaves the session in `cookies.txt`. Every later console request sends the
session back, with the CSRF token from the same file in an `X-CSRF-Token`
header; a request without it is refused with
`CSRF token is missing or invalid.`

```bash
printf '{"email": "owner@example.com", "password": "%s"}' "$(printf %s "$DIFY_OWNER_PASSWORD" | base64 | tr -d '\n')" |
  curl -sS -c cookies.txt http://127.0.0.1:5001/console/api/login -H 'Content-Type: application/json' -d @-
CSRF=$(awk '$6 == "csrf_token" {print $7}' cookies.txt)
```

```text
{"result":"success"}
```

Dify's model providers are plugins, and a new installation holds none. Install
Dify's OpenAI provider, at version 1.1.0, the one the run installed; the plugin
runtime fetches it from Dify's marketplace, so the cluster must reach the
internet:

```bash
curl -sS -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  http://127.0.0.1:5001/console/api/workspaces/current/plugin/install/marketplace \
  -d '{"plugin_unique_identifiers": ["langgenius/openai:1.1.0@1ded02acee56efd5788c86fd447d792e4923e959554a4942f440c7859d164340"]}'
```

```text
{"all_installed":false,"task_id":"01a1b9ef-8220-73d0-b9be-251a1fbd53d0","task":null}
```

The installation runs in the background. Ask for its task, with the
`task_id` the reply names, until its `status` is `success`:

```bash
curl -sS -b cookies.txt -H "X-CSRF-Token: $CSRF" \
  http://127.0.0.1:5001/console/api/workspaces/current/plugin/tasks/<task id>
```

```text
{"task":{"id":"01a1b9ef-8220-73d0-b9be-251a1fbd53d0",[… omitted: when it was created and last updated],"status":"success","total_plugins":1,"completed_plugins":1,"plugins":[{"plugin_unique_identifier":"langgenius\/openai:1.1.0@1ded02acee56efd5788c86fd447d792e4923e959554a4942f440c7859d164340","plugin_id":"langgenius\/openai","status":"success","message":"installed",[… omitted: the plugin's icon and its names in four languages],"source":"marketplace"}]}}
```

Write the provider's key into `openai.json`, as
`{"credentials": {"openai_api_key": "your OpenAI key"}}`, set it, and delete
the file:

```bash
curl -sS -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  http://127.0.0.1:5001/console/api/workspaces/current/model-providers/langgenius/openai/openai/credentials \
  -d @openai.json
rm openai.json
```

```text
{"result":"success"}
```

Dify checks the key with one request to the provider before it keeps it. The
run had no OpenAI key: it used a small local model in place of OpenAI, as the
run step of [How an import runs](README.md#how-an-import-runs) describes, here
built for `helm/ollama` from a workspace of its own and served in the cluster
behind the Service `local-model-default`. The run copied the model under the
name the application asks for, with
`kubectl exec statefulset/local-model -- ollama cp qwen2.5:0.5b gpt-4o-mini`,
and its `openai.json` carried, beside a key the local server does not check,
three more settings: `"openai_api_base": "http://local-model-default:11434"`,
that server's address, with no `/v1`, which the provider adds; `"api_protocol": "chat"`, which has the provider call
the server's Chat Completions route rather than the Responses API it calls by default; and
`"validate_model": "gpt-4o-mini"`, the model Dify checks the key with. With an
OpenAI key, you set only `openai_api_key`, as above.

An application answers requests made with an API key of its own. Create one,
with the application's identifier from the import Job's log:

```bash
curl -sS -X POST -b cookies.txt -H "X-CSRF-Token: $CSRF" \
  http://127.0.0.1:5001/console/api/apps/<application id>/api-keys
```

```text
{"id":"bddd5811-8733-495e-835d-21b26d1fc01b","type":"app","token":"[… omitted: the key]","last_used_at":null,"created_at":1794120860}
```

and send the application a message with the key, the reply's `token`:

```bash
curl -sS http://127.0.0.1:5001/v1/chat-messages \
  -H 'Authorization: Bearer <app key>' -H 'Content-Type: application/json' \
  -d '{"inputs": {}, "query": "In one short sentence: what does a support plan cover?", "response_mode": "blocking", "user": "run-it"}'
```

```text
{"event": "message", [… omitted: the task's, the message's and the conversation's identifiers], "mode": "chat", "answer": "Support plans cover technical assistance, troubleshooting, maintenance, and other services related to software usage.", "metadata": {[… omitted: the token usage, Dify's list price for it and the latency, and three empty fields]}, "created_at": 1794120860}
```

The answer is at `answer`. It came from the small local model above, under the
name `gpt-4o-mini`.

Stop the port forward, then remove what you applied, the Secrets and the
session file:

```bash
kubectl delete -R -f dist/boundaries/platform/helm/
kubectl delete secret dify-owner dify-credentials
kubectl delete pvc data-dify-zddb-0 storage-dify-zdplugins-0 data-dify-zdvector-0
rm cookies.txt
```

Kubernetes keeps the volume claims a StatefulSet made when the StatefulSet is
deleted, so the third command removes them, and with them the database, the
installed plugin and the vector store.
