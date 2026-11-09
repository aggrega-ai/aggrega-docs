# Credential Features

The credential pillar uses `featuresSchema` validation (see [entities/component.md](../entities/component.md#attachment-slots-featuresschema)), the standard library's credential Feature family, and provider-specific FeatureRecipes to form a complete black-box secret pipeline. This chapter walks through the flow end-to-end using shipped standard-library entities.

## The Credential Feature Family

A credential Feature carries the `feature.aggrega.ai/kind: secret` label. The label is catalog metadata describing what the attachment produces; no compiler branch reads it, and a credential Feature is attached under `features:` like any other Feature. An author references a credential Feature by type in a `features:` attachment — the developer in the Aggregate, or the operator in the Release; the Manifest maps it to a provider-specific FeatureRecipe per target environment.

The standard library splits credential Features by *result* — what the FeatureRecipe ultimately does with the secret:

- **`core/secret-value`** delivers a value into the inject pipe. The FeatureRecipe writes the secret into the consuming component's environment (a chart value, an env var); one Helm realization also writes it into a Kubernetes Secret and publishes that Secret's locator, for a consumer that reads its credential by reference.
- **`core/secret-provided`** also results in a delivered value, but exposes it as a `provides` key instead of injecting it directly, so the attachment dictates delivery with its own `inject:` block on a transparent slot.
- **`core/referenced-secret`** names a referenceable secret *resource* — a Kubernetes Secret, an AWS Secrets Manager secret, a Vault entry — that its FeatureRecipe's output creates or that already exists, and publishes that resource's identity through a `schema.provides` output contract so a consumer can point at it.
- **`core/referenced-secret-set`** materializes one such resource carrying a caller-supplied *set* of data keys, and publishes the resource's locator alone. It suits a consumer whose target already fixes the key names it reads — a chart expecting a Secret with several named keys — so there is no per-key locator to publish. See [`mariadb-bitnami-credential-set/`](mariadb-bitnami-credential-set/README.md) and [`multikey-secret-synth/`](multikey-secret-synth/README.md).
- **`core/generated-secret`** produces nothing at all, because the target engine generates and manages the credential itself. The operator attaches it, in the Release, to say that a slot is delegated to the engine.
- **`core/random-password`** renders a *request* for the target to generate a password into a secret resource, and publishes that resource's locator exactly as `core/referenced-secret` does. No one writes the credential and the rendered output carries none.

Two things separate the members: who supplies the material — an author writes it or names where to fetch it, the target generates it on a request the build renders as with `core/random-password`, or the target engine owns it outright as with `core/generated-secret`, which the operator binds, in the Release — and what the attachment yields, which is the *result* the list above groups by. They are peers — same label, same attachment surface, same slot — so a credential slot is always bound, and what varies between Releases is *what* binds it.

**`core/secret-value` — injected value.**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/secret-value
  version: 1.0.0
  labels:
    feature.aggrega.ai/kind: secret
spec:
  schema:
    values:
      origin: { type: string, sensitive: true }   # the developer's form
      key:    { type: string, default: "value" }
    infra:
      origin: { type: string, sensitive: true }   # the operator's form
  # Exactly one of values.origin and infra.origin — see "Who names the
  # credential" below.
```

**`core/referenced-secret` — referenceable resource.** It declares the same inputs plus a `provides` output contract: `name` (the resource's provider-neutral locator — a Kubernetes Secret name, an AWS Secrets Manager ARN, a Vault path) and `key` (the data field within it). A consumer reads these as `.features.<slot>.provides.name` and `.features.<slot>.provides.key`.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/referenced-secret
  version: 1.0.0
  labels:
    feature.aggrega.ai/kind: secret
spec:
  schema:
    values:
      origin: { type: string, sensitive: true }
      key:    { type: string, default: "value" }
    infra:
      origin: { type: string, sensitive: true }
    provides:
      name: { type: string }
      key:  { type: string }
```

A credential Feature that declares a `provides` contract obliges every FeatureRecipe implementing it to publish those keys — the build halts if a FeatureRecipe omits one. This is the producer-side guarantee that makes the consumer's `.features.<slot>.provides.<key>` read safe.

**`core/generated-secret` — engine-managed.** It declares neither `values` nor `provides`: an author supplies no material, and the attachment publishes nothing for a consumer to read. Whether the target owns the credential follows from the Recipe the Manifest picks, so the operator attaches it, in the Release, on the entry for the component whose slot it binds. Attaching it states that the credential's whole lifecycle belongs to the target — a managed cloud database that generates and rotates its own administrator password, for example, or a database controller in the cluster that generates the password into a Secret it creates and owns.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/generated-secret
  version: 1.0.0
  labels:
    feature.aggrega.ai/kind: secret
spec: {}
```

The directive that turns engine management on is the component's Recipe's, not the Feature's: a Terraform RDS Recipe sets `manage_master_user_password`, a CloudFormation one sets `ManageMasterUserPassword`, and the controller-driven `helm/mariadb-cluster` Recipe, with `infra.credentials: generated`, names no root-password Secret in the `MariaDB` custom resource it emits, so the mariadb-operator controller generates one. So the FeatureRecipes implementing `core/generated-secret` are pure wiring — `capability` and `implements` and nothing else — and render no bytes. The standard library ships them for the `terraform`, `cloudformation` and `helm` capabilities, matching the Recipes that hand the credential to the engine. The [`terraform-rds`](terraform-rds/README.md) example's Release binds a required slot this way, and the attachment adds nothing to its rendered HCL: the slot is bound, and nothing is emitted for it.

**`core/random-password` — generated by the target.** Reach for it wherever a credential would otherwise be a default every reader of the catalog knows — an inline development value, a module parameter's default — and no one should have to write it down. The build cannot draw the password, because its output is identical for identical input and never carries a secret's value, so the FeatureRecipe renders a generator resource naming the secret resource it fills, and the target draws the value at deploy time. It publishes the `name` and `key` contract `core/referenced-secret` publishes, so a consumer reads it unchanged; its values are the data key, an optional pin for the resource's name, and the two generator settings every realization honours:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/random-password
  version: 1.0.0
  labels:
    feature.aggrega.ai/kind: secret
spec:
  schema:
    values:
      key:     { type: string, default: "value" }
      name:    { type: string }                    # pins the secret resource's name
      length:  { type: integer, default: 32 }
      symbols: { type: boolean, default: false }   # punctuation in the password
    infra:
      control_plane_present: { type: boolean, default: false }
    provides:
      name: { type: string }
      key:  { type: string }
```

What the target needs running, and where it cannot be used:

- **`helm`** — a controller fills the request: `random-password-external-secrets` renders an External Secrets Operator `Password` generator and an `ExternalSecret` that creates the Secret once and never refreshes it, and `random-password-kubernetes-secret-generator` renders a `StringSecret` the kubernetes-secret-generator controller reconciles into a Secret. Reach for the first where the External Secrets Operator runs and for the second where that controller runs. Either halts the build unless the Release affirms the controller with `infra.control_plane_present: true` on the attachment, because the compiler cannot see the cluster.
- **`terraform`** — `terraform/random-password` gives the attachment a module of its own, holding a `random_password` resource and an output named by `key`, and publishes the module call and that output; a consumer references them as `${module.<call>.<output>}` from a `source:` Recipe, whose arguments sit in the root configuration where that reference resolves. Nothing needs to run beforehand. Terraform keeps the value in its plan and state.
- **`cloudformation`** — `cloudformation/random-password` renders an `AWS::SecretsManager::Secret` that generates its own string under `key`, and publishes a `Ref` to it and the key; a consumer resolves the password through a Secrets Manager dynamic reference built from the two. Nothing needs to run beforehand.
- **`compose`** — no generator runs there, so no FeatureRecipe ships, and a build binding `core/random-password` on compose halts naming the missing realization. Supply the credential with `core/secret-value` instead.

**Sharing one generated password takes one request.** Every request draws its own value, so the Feature attached on two components — or once at a scope that reaches both — gives them two different passwords. For a database and the server that connects to it, attach `core/random-password` on the database with `name` pinned, and `core/referenced-secret` on the server's connection to it, bound to `k8s-existing-secret` with `origin` set to the same name, both from one parameter:

```yaml
spec:
  parameters:
    db_secret: { type: string, default: "identity-db-credential" }
  components:
    backend:
      type: core/datastore/postgres
      features:
        password:
          type: core/random-password
          values:
            name: "{{ .parameters.db_secret }}"
            key: db-password
    server:
      type: core/security/keycloak
      uses:
        backend:
          db:
            target: backend
            inject:
              env:
                - { in: KC_DB_URL_DATABASE, from: database }
                - { in: KC_DB_URL_HOST, from: host }
                - { in: KC_DB_URL_PORT, from: port }
                - { in: KC_DB_USERNAME, from: user }
            features:
              credential:                # the password the server presents to it
                type: core/referenced-secret
                values:
                  origin: "{{ .parameters.db_secret }}"
                  key: db-password
```

With the Manifest binding `core/random-password` to a helm realization and `core/referenced-secret` to `k8s-existing-secret`, and the Release affirming `control_plane_present` on the backend's attachment, the render carries one generator request for `identity-db-credential`, and both workloads' `secretKeyRef` name that Secret and the `db-password` key. `core/referenced-secret`'s existing-Secret realization is a helm one, so this shape is a helm shape.

## Who names the credential: `values` or `infra`, exactly one

The four members that carry a caller's locator — `core/secret-value`, `core/secret-provided`, `core/referenced-secret` and `core/referenced-secret-set` — accept it from either author. The developer writes it in the attachment's `values` in the Aggregate; the operator writes it in the attachment's `infra` in the Release. The leaf is the same in both pillars — `origin`, or `entries` for the set — with the same shape and the same `sensitive: true` declaration, and every FeatureRecipe implementing these Features reads whichever pillar carries it. `core/random-password` and `core/generated-secret` take no locator, so the question does not arise for them.

The operator's form is what makes a credential usable where the developer cannot write one: on a connection the Release wires, which has no Aggregate entry, and on an attachment the Release alone makes, since a Release writes `values` nowhere. It also serves an attachment the Aggregate declares — its slot, its data key, its `inject:` block — while leaving the secret's name to each environment.

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

**Exactly one of the two.** Neither pillar's schema can require the locator, because each pillar is validated on its own and neither sees the other. Each Feature's own `assertions` block holds the rule instead: an attachment whose locator is in both pillars, or in neither, halts the build (`E0033`), naming the Feature, the attachment and the component it sits on, and saying which of the two it was. Presence decides, not content: a locator written as an empty string is written. This is the catalog entities' contract — the compiler evaluates their assertion as it evaluates any Feature's, and holds no rule of its own about credentials.

**Everything else keeps its pillar.** `key` stays a `values` leaf, so an attachment only the Release makes reads the default data key, `value`. On compose, a Compose variable reference written in `infra.origin` — `${DB_PASSWORD}` — reaches the emitted file exactly as written, as it does from `values`. And `infra.origin` is withheld as `values.origin` is: the graph `build`, `validate` and `inspect` write with `--ir-graph` carries the placeholder in place of either, and names the leaf it withheld — `infra.origin` or `values.origin`.

**`core/secret-provided` and connections.** It publishes its value for the attachment's own `inject:` block to deliver, and only an attachment the Aggregate declares carries one: a connection's attachment carries none in either document, and neither does an attachment the Release alone makes. On those, no `inject:` block delivers the value; use `core/referenced-secret` or `core/secret-value` there. The operator's `infra.origin` serves `core/secret-provided` where the Aggregate wrote the attachment and its `inject:` block and left the value to the Release.

**One advisory, by design.** Declaring the same leaf in both pillars is what the pillar-overlap advisory looks for, so every load of these four Features reports it — `LINT: Feature "core/referenced-secret" ... declares property "origin" in both values: and infra: pillars` — on a whole-catalog validation, and on a build or validation whose Manifest or Aggregate reaches one. Here the overlap is the contract rather than a slip; the advisory changes no verdict and no rendered byte. See [vocabulary/data-pillars.md](../vocabulary/data-pillars.md#the-same-property-name-in-both-pillars) "The same property name in both pillars".

## Provider-Specific FeatureRecipes

**`k8s-secret-from-parameter`** (for dev and local workflows) implements `core/referenced-secret`. It generates a Kubernetes Secret from a literal value an author supplies, and publishes the generated Secret's identity as `provides`. The emitted Secret derives its name and data key from that same `provides`, so the name is authored exactly once. The Secret comes from a small co-located Helm chart named by `source:`, whose values the `valuesMapping` feeds from the published `provides`:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: FeatureRecipe
metadata:
  name: k8s-secret-from-parameter
  version: 1.0.0
spec:
  capability: helm
  implements: core/referenced-secret:1.0.0
  provides:
    # The host part is the host's rendered name, which the helm provider spells
    # in the characters a Kubernetes name allows, and underscores in the slot
    # name are normalized to hyphens, so a host named my_db with a slot named
    # app_user_password publishes my-zudb-app-user-password, a valid Kubernetes
    # object name.
    name: '{{ .context.rendered_name }}-{{ .attachment_name | replace "_" "-" }}'
    key: "{{ .values.key }}"
  # A co-located chart renders the Secret. Its values come from the published
  # provides, so the rendered Secret and the consumer's
  # .features.<slot>.provides are one authored source.
  source: ./chart
  # origin from whichever pillar carries it: values, else infra.
  valuesMapping: |
    secretName: "{{ .provides.name }}"
    dataKey: "{{ .provides.key }}"
    origin: {{ optional .values "origin" (optional .infra "origin" "") | toJson }}
```

The chart is one template. Both of its names come from the values above, so nothing re-derives the Secret's identity inside the chart:

```yaml
# chart/templates/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ .Values.secretName }}
stringData:
  {{ .Values.dataKey }}: {{ .Values.origin | quote }}
```

Both excerpts omit one thing the shipped recipe carries: it also passes the scope's namespace through to the chart, when the scope declares one, so the emitted Secret lands beside the workload that references it.

**Several FeatureRecipes can implement one Feature at the same capability**, and the choice between them is then the Manifest's. `core/referenced-secret` has three for `helm`, and what decides between them is where the credential lives:

- **`k8s-secret-from-parameter`**, above, writes an authored value into a Secret it emits, so the material sits in the rendered output. Reach for it for evaluation and local work, where no Secret exists yet and no secret store runs.
- **`k8s-external-secret`** renders an `ExternalSecret` naming an entry in a secret store, which the External Secrets Operator running in the cluster reconciles into a Secret. Reach for it where that operator runs and the credential should be fetched from its store.
- **`k8s-existing-secret`** emits nothing. It reads `origin` as the name of a Secret that already exists in the namespace and `key` as the entry inside it, and publishes both exactly as written. Reach for it where the Secret is created outside the Release — by hand, by a pipeline, or by another tool.

The first two derive the Secret's name the same way, so the consuming Recipe reads the same locator from either and its rendered reference is unchanged — which is what makes those two substitutable. [`credential-shape-per-target/`](credential-shape-per-target/README.md) builds one Aggregate against both bindings and compares the output. `k8s-existing-secret` publishes the existing Secret's own name instead, so binding it changes the consumer's reference on purpose: the reference then points at the Secret already in place.

**`dotenv-secret`** (Compose, local dev) implements `core/secret-value`. It delivers `origin` on the inject pipe exactly as authored, and the compose Recipe writes it into the service's environment in the emitted file — an injected value, no standalone resource and no `provides`. A literal origin therefore lands in the file as the credential itself; an origin written as a Compose variable reference, such as `${DB_PASSWORD}`, lands as that reference, which Docker Compose substitutes from the shell environment or a `.env` file when the stack starts. The compiler writes no `.env` file. The value is written through `toJson`, as a JSON string the mapping's YAML reads back exactly, so a quote or a backslash in it reaches the inject pipe as authored:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: FeatureRecipe
metadata:
  name: dotenv-secret
  version: 1.0.0
spec:
  capability: compose
  implements: core/secret-value:1.0.0
  injectMapping: |
    env:
      {{ .values.key }}: {{ optional .values "origin" (optional .infra "origin" "") | toJson }}
```

`env-secret` follows the same injected-value shape for the Helm provider, writing the value into the component's inject pipe rather than producing a resource. Unlike `dotenv-secret`, it refuses an `origin` written as a Compose variable reference, as the next paragraph describes.

`core/secret-value` has a second Helm realization, **`k8s-secret-from-value`**, for a consumer that reads its credential by reference rather than off the inject pipe: the synthesized `helm/postgres`, for one, renders its `password` slot as a `secretKeyRef`, which a fill publishing no locator cannot satisfy. It writes the value into a Kubernetes Secret it emits from a co-located chart, the `k8s-secret-from-parameter` shape above, publishes that Secret's `name` and `key` as `provides`, and also delivers the value into the inject pipe exactly as `env-secret` does, so a Recipe reading the pipe receives it as a variable. One Manifest mapping therefore serves consumers of both kinds, and the same `core/secret-value` attachments build for Compose and for Helm — except an `origin` written as a Compose variable reference such as `${DB_PASSWORD}`, which nothing on the Helm path substitutes: `env-secret` and `k8s-secret-from-value` both refuse it at build time, so set the real value through the Release, as a parameter the Aggregate hoists into the origin or as `infra.origin` in place of the origin the Aggregate writes. The value sits in the rendered output either way — in the Secret, and in the manifest of a consumer reading the pipe. Reach for `env-secret` where every consumer reads the pipe and no Secret is wanted, for `k8s-secret-from-value` where one reads by reference, and for `core/referenced-secret` bound to `k8s-existing-secret` or `k8s-external-secret` where the credential must stay out of the rendered output.

An injected value reaches only the component it is attached to, and only where that component's Recipe defines a service to carry it. A Compose Recipe that realizes an external service by reference defines none, so a standard-library one refuses a credential filling one of its Component's slots, and the build halts naming the slot and the component rather than succeeding with the credential absent. The Compose provider itself refuses any attachment declared sensitive on a node it realizes by reference, whatever catalog the Recipe comes from and whether or not a slot declares the name it is attached under, halting the build naming the node and the attachment. On Compose, the credential for an external service is attached to the component that calls it, under the variable that component reads; see the [Compose provider page](../providers/compose.md#controller-form). Those Components declare their credential slots optional, so leaving them empty on Compose halts nothing, while the `helm` Recipes of `twilio`, `vonage`, `telnyx`, `bland`, `letta`, `retell` and `vapi` require each slot and halt naming an empty one.

**Reading the locator from either pillar.** Every realization of the four locator-carrying Features reads the locator with the one expression shown in both excerpts: `optional .values "origin" (optional .infra "origin" "")` — `entries` in place of `origin` for the set. `optional` checks whether a key is present rather than whether its value is empty, so it reads the pillar that carries the locator and nothing else. A template that reads the locator this way reads it only this way: one that also wrote `.values.origin` as a path would find the key present and empty, because a value template supplies an empty value at a path it reads, and would never fall through to `infra`.

**`provided-secret`** implements `core/secret-provided`, for `helm` and for `compose` under the one name. It publishes `origin` as the `value` provides key and delivers nothing itself, so the attachment's own `inject:` block on a transparent slot decides where the value goes; an attachment without one delivers it nowhere.

**A FeatureRecipe name carried by more than one capability is referenced provider-qualified.** `provided-secret` is such a name, and so is `generated-secret`, which the standard library ships for `terraform`, `cloudformation` and `helm`, and `random-password`, which it ships for `terraform` and `cloudformation`. A bare `provided-secret:1.0.0` matches both and resolves to neither, and the pull halts on it; the Manifest names the one it means:

```yaml
spec:
  mappings:
    features:
      type:
        core/secret-provided:1.0.0: compose/provided-secret:1.0.0
```

## End-to-End Flow

The six steps from developer authoring to compiled output, using the referenceable path (`k8s-secret-from-parameter`):

1. **Developer writes the Aggregate** with a `features:` attachment referencing `core/referenced-secret`:

    ```yaml
    features:
      root_password:
        type: core/referenced-secret:1.0.0
        values:
          origin: "{{ .parameters.db_root_pass }}"
          key: mariadb-root-password
    ```

    The `root_password` slot has no `inject:` block here. The Component's `featuresSchema` declares `inject: []` for this slot (blackbox), so the slot's auto-generated schema rule rejects any developer-authored `inject:` — delivery is the Recipe's concern.

2. **Ops writes the Release** supplying the parameter value:

    ```yaml
    spec:
      parameters:
        db_root_pass: "mypassword"
      boundaries:
        production:
          # ... boundary infra ...
    ```

3. **Ops writes the Manifest** mapping `core/referenced-secret` to the provider-specific FeatureRecipe:

    ```yaml
    spec:
      mappings:
        features:
          type:
            "core/referenced-secret": "helm/k8s-secret-from-parameter:1.0.0"
    ```

4. **Base Recipe** (e.g., `mariadb-bitnami`) references the produced Secret by reading the slot's published locator — no name re-derivation on the consuming side:

    ```yaml
    valuesMapping: |
      auth:
        existingSecret: "{{ .features.root_password.provides.name }}"
    ```

5. **Compilation runs:**
    - Resolution validates the attachment against the auto-generated schema rules derived from the Component's `featuresSchema`.
    - The credential FeatureRecipe's `provides` is evaluated once, producing the slot's `name` and `key`. Because the FeatureRecipe feeds its chart's `secretName` from that published `provides.name` and the consumer reads `.features.root_password.provides.name`, both sides resolve from that single evaluation — the rendered Secret name and the consumer's reference are the same string by construction.
    - Base rendering evaluates the base Recipe's `valuesMapping` (Helm renders the MariaDB chart referencing the published Secret name) and the `k8s-secret-from-parameter` FeatureRecipe's own chart (emitting the Kubernetes Secret manifest with the matching name).

6. **Output:** `dist/boundaries/production/` contains the MariaDB StatefulSet and Services (from the base Recipe) plus a Kubernetes Secret (from the credential FeatureRecipe). The chart's `auth.existingSecret` carries the name the Secret carries, so the StatefulSet mounts that Secret.

## Secret Naming Across Base Recipe and FeatureRecipe

A base Recipe's `valuesMapping` needs to reference the Kubernetes Secret the credential FeatureRecipe emits. For a `core/referenced-secret` slot, the FeatureRecipe publishes the resource's locator through its `provides` contract, and the consumer reads it as `.features.<slot>.provides.name`:

```gotemplate
existingSecret: "{{ .features.root_password.provides.name }}"
```

The name is authored once — on the producing FeatureRecipe's `provides` — and every reader resolves from that single published value. There is no naming convention for both sides to agree on and no shared `locals` entry to keep aligned: changing the naming scheme is an edit on the FeatureRecipe's `provides` alone, and the contract guarantees the key is present for the consumer to read.

A runnable end-to-end version of this flow — referenceable-secret + `secretKeyRef` on helm, inject-value on compose, and the non-referenceable rejection — is in [`credential-secretkeyref/`](credential-secretkeyref/README.md).

Because the name is published rather than agreed, changing which FeatureRecipe is bound does not move it. [`credential-shape-per-target/`](credential-shape-per-target/README.md) builds one Aggregate twice — once bound to `k8s-secret-from-parameter`, once to `k8s-external-secret` — and the consuming StatefulSet's `secretKeyRef` comes out byte-identical from both, while the resource it points at is a Secret in one and an `ExternalSecret` in the other.

Whether each consumer holds its own credential or several share one is a choice made where the credential is attached, not a property of the catalog entity. [`model-api-key-sharing/`](model-api-key-sharing/README.md) builds both shapes with two consumers each — the multiplicity at which they differ — on the credential each agent's connection carries, and shows what each renders, including a shared default that one connection overrides with an attachment of its own.

*Vault-backed delivery takes the chart-rendered route: `k8s-external-secret` renders an External Secrets `ExternalSecret`. A FeatureRecipe's `pipeline:` array chains Wasm plugins, and its `provides` contract publishes what it materializes.*
