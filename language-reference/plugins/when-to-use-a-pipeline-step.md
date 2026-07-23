# When to reach for a pipeline step

A FeatureRecipe gives you two ways to shape the output a Feature contributes: a **templated FeatureRecipe** that generates its own documents, and a **pipeline step** (`pipeline:`) that runs a Wasm plugin over the rendered output. They solve different problems. This page is the decision guide: reach for a pipeline step on exactly two triggers, and use a templated FeatureRecipe for everything else.

## The two tools

**A templated FeatureRecipe is local and generative.** It produces its *own* documents from its *own* values through a Go template — a sidecar's ConfigMap, a policy CRD, an autoscaler object. Everything it emits is a function of the Feature's `values:` and `infra:` and the render context handed to its templates. It never reaches into another entity's output; it adds documents of its own. If the thing you need to produce can be written from what the Feature already knows, a templated FeatureRecipe is the right and simpler tool — no plugin, no pipeline.

**A pipeline step is global and transformative.** It runs *after* render, over the real document set the build has already emitted. The host hands the step that keyed document set whole; the step reads the actual *content*, selects the documents it targets, and returns surgical RFC 6902 patches to their structure — or emits new documents as side effects. A step reasons about what was rendered, not only about what the Feature declared. That reach is its whole reason to exist, and it is also why you use it sparingly.

## The two triggers for a pipeline step

Reach for a pipeline step only when one of these holds. If neither does, generate the document with a templated FeatureRecipe instead.

1. **Host-scope patch — you need to reach into another already-rendered entity's structure.** The classic case is injecting an env var, a volume mount, or a sidecar container into the *consuming component's* workload — a document the Feature itself did not author. A templated FeatureRecipe cannot do this: it produces its own documents, it does not edit someone else's. A pipeline step can, because it operates on the rendered set and can address the host component's documents by key.

2. **Content-dependent emit or patch — the output depends on *what the rendered set contains*.** When the resource you emit, or the patch you apply, is a function of the content the build produced — the actual ports a Deployment declared, the container names that ended up in the manifest, the resources a chart expanded to — the decision needs the rendered content in hand. A templated FeatureRecipe renders from the Feature's own values and never sees the finished set, so it cannot make a content-dependent choice; a pipeline step reads the content first, then acts.

Both triggers share a shape: they need information that exists only *after* render — another entity's structure, or the emitted content itself. Local generation never needs that, so local generation never needs a pipeline step.

## A step transforms; a policy validates

A pipeline step is a *transformer*: it changes the rendered set. It is not the place to check whether a result is acceptable. To *validate* a build — to assert that a patched workload has the sidecar, that no plaintext secret reached the output, that a required label is present — attach a **render-stage policy**: a governance plugin at the `render-verdict` role, which runs after render over the emitted artifacts and returns a verdict. A `deny` halts the build; a `warn` or `audit` advises without blocking.

Keep the two roles separate. Do not build validation logic into a pipeline step, and do not use a policy to mutate output — a policy returns verdicts, never patches. A step shapes the output; a render-verdict policy judges it. The [governance socket page](policy-socket.md) covers the verdict roles and severities.

## Steps compose

A pipeline step can declare a typed input and output contract, so its `with:` input and its returned outputs are validated shapes rather than free-form blobs. A step also returns named `outputs`, and a step declared later in the same pipeline reads a preceding step's outputs from its own `with:` template as `.steps.<id>.outputs.<key>`. That is how a two-part pattern composes without coupling: a Fetcher step emits a credential resource and publishes the resulting Secret's name as an output; an Injector step reads that name and patches the consuming workload to mount it. Each step carries one concern, and the pipeline threads their outputs in declared order.

## Cross-references

- [`entities/featurerecipe.md`](../entities/featurerecipe.md) — the FeatureRecipe authoring surface, including `pipeline:`.
- [`plugins/plugin-contract.md`](plugin-contract.md) — the pipeline step's wire shape: the keyed document set in, RFC 6902 patches, side effects, diagnostics, and step outputs out.
- [`plugins/policy-socket.md`](policy-socket.md) — the render-stage policy that validates a build's output.
- [`templates/template-context-contract.md`](../templates/template-context-contract.md) — the `.steps.<id>.outputs` field a later step reads.
- [`examples/04-secrets.md`](../examples/04-secrets.md) — a worked Fetcher + Injector pipeline.
