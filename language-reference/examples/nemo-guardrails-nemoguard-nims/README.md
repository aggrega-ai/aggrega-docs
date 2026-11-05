---
example:
  level: start
  products: [core/ai-agent/langgraph, core/datastore/valkey, core/gateway/litellm, core/security/nemo-guardrails, core/security/trustyai-huggingface-detector, core/ai-model/nemoguard-content-safety, core/security/nemoguard-jailbreak-detect]
  shows: [connections, credentials, features]
---

# NeMo Guardrails checking an agent's requests with NVIDIA's NemoGuard models

An agent's model requests pass through NVIDIA NeMo Guardrails, which checks
each one with two of NVIDIA's NemoGuard models, licensed NVIDIA products that
need a licence from NVIDIA, an NGC API key and a GPU node to run.

## What it requires

The two NemoGuard models are NVIDIA products you run under NVIDIA's terms.
Deploying what this workspace builds needs:

- **A licence from NVIDIA.** NVIDIA's documentation for each NemoGuard
  microservice names its prerequisite as "an active subscription to an NVIDIA AI
  Enterprise product or be an NVIDIA Developer Program member", and states that
  access to the containers and models is restricted.
- **An NGC API key, referenced by the Release as a secret.** The NemoGuard
  containers are pulled from NVIDIA's registry, `nvcr.io`, and each fetches its
  model from NVIDIA with the key when it starts. The Release names two
  Kubernetes Secrets that hold it — one the pods read the key from, one the
  cluster pulls the images with — and no file in this workspace, and nothing
  the build writes, holds the key itself.
- **A GPU node.** Each NemoGuard container requests an NVIDIA GPU. NVIDIA states
  that the content-safety model needs 48 GB of GPU memory, on one GPU or two.

The build needs none of these: it compiles to Kubernetes manifests with no key
present, and contacts neither NVIDIA nor the cluster.

## What it builds

An agent asks for its model through an AI gateway. The gateway sends every
model request through a guard first, and the guard checks the latest user
message three ways before forwarding what it admits to the model: with a
prompt-injection classifier, with NVIDIA's content-safety model, and with
NVIDIA's jailbreak classifier. This workspace compiles that arrangement to
Kubernetes manifests.

It shows that a licensed commercial product is provisioned the way an
open-source one is: a catalog Component, a Recipe, a `uses` edge and a
credential attachment, with the licence stated where a reader chooses the
component. It authors **no catalog entity of its own**; the Aggregate, the
Manifest and the Release are the whole of what anyone writes.

| instance | catalog Component | what it is here |
|---|---|---|
| `agent` | `core/ai-agent/langgraph` | the agent, the Release's own application image, reaching its model through the gateway |
| `checkpointer` | `core/datastore/valkey` | where the agent keeps its run state |
| `router` | `core/gateway/litellm` | the AI gateway: one alias, `assistant`, sent to the model through the guard |
| `guard` | `core/security/nemo-guardrails` | NVIDIA NeMo Guardrails' server in the model's path |
| `detector` | `core/security/trustyai-huggingface-detector` | the prompt-injection classifier the guard's own rail asks |
| `safety` | `core/ai-model/nemoguard-content-safety` | NVIDIA's Llama 3.1 NemoGuard 8B ContentSafety, served by its NIM |
| `jailbreak` | `core/security/nemoguard-jailbreak-detect` | NVIDIA's NemoGuard JailbreakDetect, served by its NIM |

The `uses` edges: the agent's `model` socket to the gateway and its
`checkpointer_db` socket to the store; the gateway's `guard` socket to the
guard; and the guard's `detector`, `content_safety` and `jailbreak_detection`
sockets to the three checks. The attachments: `shield`, the
`core/prompt-injection-shield` Feature that puts the guard on the gateway's
path; `upstream_key`, the credential the guard presents to the model API; and
`ngc_api_key` on each NemoGuard component.

## Building

```bash
aggrega build --release release.yaml
```

A release needs a lockfile before it builds, and lockfiles are generated rather
than shipped, so a fresh clone has none. Resolve one first, or let the build
fill it:

```bash
aggrega pull --release release.yaml                 # resolve once, then build with no flag
aggrega build --release release.yaml --auto-pull    # or resolve during the build
```

This workspace resolves the catalog entities from the default registry
`.aggrega-config.yaml` names. The shield's realization runs one plugin that ships in
neither the compiler nor the catalog, the gateway configuration step
`pipeline-step/litellm-gateway-config`, which the resolution fetches from the
registry `default_registry` names, `hub.aggrega.ai`.

The build prints, with `<workspace>` standing for this example's folder:

```text
[… omitted: a line reporting on the gateway configuration step's plugin, the resolution's summary, a notice that core/referenced-secret declares origin in both of its pillars, and a total build time, which differs per run]
Build completed: 18 files written to <workspace>/dist
```

**The Release names every image the catalog does not.** The agent's is your
own application. The guard's and the detector's are copies of the builds you
run, mirrored into a registry you control. The two NemoGuard images are
NVIDIA's, which you are entitled to pull under your licence; the catalog names
none of them, and `release.yaml` writes each with the tag `change-me`. The build
pipes whatever string is there; replace them before deploying.

## The rendered tree

```text
dist/helm/
├── agent-deployment.yaml
├── checkpointer-default-service.yaml
├── checkpointer-deployment.yaml
├── detector-default-service.yaml
├── detector-deployment.yaml
├── guard-default-service.yaml
├── guard-deployment.yaml
├── guard/
│   └── nemo-guardrails-config.configmap.yaml
├── jailbreak-default-service.yaml
├── jailbreak-headless-service.yaml
├── jailbreak-statefulset.yaml
├── router-default-service.yaml
├── router-deployment.yaml
├── router/
│   ├── litellm-gateway-config/
│   │   └── configmap.yaml
│   └── request-guard/
│       └── request-guard.yaml
├── safety-default-service.yaml
├── safety-headless-service.yaml
└── safety-statefulset.yaml
```

There is no Secret among them. Every credential is attached as
`core/referenced-secret`, and the Manifest binds it to
`helm/k8s-existing-secret`, which points a workload at a Secret that already
exists in the namespace and renders nothing of its own.

## The key, as a reference

The Aggregate writes only where inside a Secret the key sits, the data key
`NGC_API_KEY`; the Release names the Secret, `ngc-api-key`, and the Secret the
images are pulled with, `ngc-registry`. In
`dist/helm/safety-statefulset.yaml`, and likewise in the jailbreak classifier's:

```yaml
          env:
            - name: NGC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: ngc-api-key
                  key: NGC_API_KEY
```

```yaml
      imagePullSecrets:
        - name: ngc-registry
```

Before deploying, create both Secrets in the target namespace: `ngc-api-key`
holding the key under `NGC_API_KEY`, and `ngc-registry`, an image-pull Secret
for `nvcr.io` that logs in with the key. The guard's upstream credential is
named the same way, as the Secret `upstream-provider-key` holding the model
API's key under `upstream-key`.

A Release cannot write the key in its place. A `values:` block on an attachment
in the Release is refused when the document loads, because what a Release
writes there is the operator's, and values are the developer's. Replace the
`infra:` block of the `safety` component's `ngc_api_key` with `values:` holding
an `origin`, and the build prints, before anything else:

```text
[OPS_ERROR E0215] release.yaml
  document envelope validation failed (Release, at release.yaml); 66:11: spec.components.safety.features.ngc_api_key.values: against /$defs/boundary_component: unexpected property: "values". correct the document to match its kind's schema
```

The one string the Release does write, a Secret's name, is published exactly as
written: the build cannot tell a name from a key, so a key typed where a name
goes would appear in the manifest as that name. The graph
`aggrega build --ir-graph` prints withholds it either way, because `origin` is
declared sensitive.

## What the guard does

The guard's configuration, the `config.yaml` key of
`dist/helm/guard/nemo-guardrails-config.configmap.yaml`, up to its prompts:

```yaml
models:
  - type: main
    engine: openai
    model: named-by-each-request
    api_key_env_var: UPSTREAM_API_KEY
  - type: content_safety
    engine: openai
    model: "llama-3.1-nemoguard-8b-content-safety"
    parameters:
      base_url: "http://safety-default:8000/v1"
      api_key: EMPTY
passthrough: true
rails:
  config:
    hf_classifier:
      prompt_injection:
        engine: fms
        model: "protectai/deberta-v3-base-prompt-injection-v2"
        base_url: "http://detector-default:8000"
        threshold: 0.5
        blocked_labels: ["INJECTION"]
    jailbreak_detection:
      nim_base_url: "http://jailbreak-default:8000/v1/"
      nim_server_endpoint: classify
  input:
    flows:
      - hf classifier check input $classifier=prompt_injection
      - jailbreak detection model
      - content safety check input $model=content_safety
```

For each chat request the guard runs the three input rails on the latest user
message, in that order, and refuses the request when any of them does:

- **The prompt-injection classifier** refuses when the detector reports
  `INJECTION` at or above `0.5`.
- **The jailbreak classifier** refuses when NVIDIA's classifier answers that
  the message is a jailbreak attempt. The guard posts the message to its
  `classify` route; no key is configured, because the in-cluster service asks
  none.
- **The content-safety model** refuses when it rates the message unsafe. The
  guard declares it as a model reached through the OpenAI-compatible API the
  NIM serves, at the endpoint and under the model name the `safety` edge
  publishes, and its prompt — the rest of `config.yaml` — is the one NVIDIA's
  NeMo Guardrails documentation gives for this model, listing its harm
  categories, read with the parser NeMo Guardrails provides for its verdict.

A refused request is answered by the guard itself, with *I'm sorry, I can't
respond to that.*, and nothing of it reaches the model. The guard's
configuration also carries a flow, `rails.co`, that runs the input rails
whatever a request body asks.

`values.model` on `safety` is the name the content-safety NIM answers to, which
the NIM takes from its own model manifest; its model listing, `/v1/models`,
shows it on the running server. The guard sends it with every check, so the two
have to agree.

## What it does not do

- **It judges the latest user message only.** An attempt placed in a system
  message, an earlier turn or a tool result reaches the model unchecked, and
  neither the model's reply nor tool-call arguments nor images are judged.
- **Every verdict is a model's.** The three checks miss some harmful or
  manipulative requests and refuse some ordinary ones.
- **The jailbreak rail fails open.** NVIDIA documents that when the jailbreak
  classifier cannot be reached, times out or answers with an error, the rail
  lets the request through and reports nothing to the caller. The other two
  checks still run. The prompt-injection rail refuses the request when its
  detector cannot be reached.
- **It covers only traffic that crosses the gateway.** A workload calling the
  model's address directly goes around it. The guard and the three checks
  authenticate no caller, so their Services are addresses for the components
  that call them, not ones to publish.
- **It is not proved running here.** The configuration is the one NVIDIA's
  documentation describes, compiled ahead of time; nothing in this workspace
  has run the NemoGuard containers.

## What halts the build

The guard's Recipe checks what its NemoGuard sockets hold. Make `safety` a plain
`core/ai-model/nvidia-nim` — its type in the Aggregate and its line in the
Manifest — and the build halts, writing nothing:

```text
[… omitted: a line reporting on the gateway configuration step's plugin, what resolving the lockfile prints, the same halt among it, and a notice that core/referenced-secret declares origin in both of its pillars]
[CATALOG_ERROR E0364] instance guard
  rendering node "guard"
  caused by: [CATALOG_ERROR] nemo-guardrails-config.configmap.yaml
    artifact "nemo-guardrails-config.configmap.yaml" template eval
    caused by: [CATALOG_ERROR] artifacts[nemo-guardrails/nemo-guardrails-config.configmap.yaml]
      template "artifacts[nemo-guardrails/nemo-guardrails-config.configmap.yaml]" execute
      caused by (2):
        a value template failed while it ran
      ---
        [… omitted: the template position and the template's own source]: error calling fail: the guard's content_safety socket is wired to "safety", a core/ai-model/nvidia-nim, but the content-safety rail's prompt and verdict parser are NVIDIA's for core/ai-model/nemoguard-content-safety, which another model answers in a shape the parser does not read; wire a core/ai-model/nemoguard-content-safety to content_safety
```

The `jailbreak_detection` socket takes a `core/security/nemoguard-jailbreak-detect`
and nothing else, in the same way, and each socket takes one target. The
shield's own halts are those of
[ai-gateway-prompt-injection-shield](../ai-gateway-prompt-injection-shield/),
which builds the same gateway and guard without the NemoGuard checks.

## Where the compiler does not interpret

The compiler pipes the NIMs' Service names and ports into the guard's
configuration, and the Secrets' names into the pods, as strings. It does not
pull an image, does not fetch a model or read a key, and does not contact
NVIDIA, the guard or the model. Each halt above is declared by the catalog's
own entities.

## Adapting it

- **Without the content-safety model.** Remove the `safety` component and the
  guard's `content_safety` edge; the guard's configuration then carries no such
  model, rail or prompt. The jailbreak classifier is removed the same way.
- **A model you run yourself.** Point the guard's `upstream_endpoint` at the
  model server's endpoint — `core/ai-model/vllm` publishes one — and write the
  alias's target `openai/<the name that server serves>`.
- **Larger GPUs or two of them.** Each NemoGuard component takes
  `infra.gpu.count`, and `infra.gpu.runtime_class` where the cluster selects
  its GPU runtime by class.
