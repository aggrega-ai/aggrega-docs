# aggrega scaffold

Draft a starter document for an entity kind from its schema

<!-- BEGIN GENERATED: cli-scaffold -->
**Synopsis**

```
aggrega scaffold <kind> [name]
```

**Description**

```
Draft a starter document for an entity kind from its schema.

The kind is the lowercase-hyphenated schema token — for example component, aggregate, release, recipe, manifest, or feature. Run aggrega get-schema --list to print the whole set; a token no schema answers to is refused with that set in the message, so a typo is corrected without a second lookup.

The document is derived from that kind's own contract and from nothing else. It carries exactly the fields that kind's schema requires, with the fixed apiVersion and kind filled in and a placeholder everywhere a value is needed. It is not a worked example: there is no namespace, no category, no label set and no commented suggestion of what people usually write, because a catalog decides those for itself and a starter document that guessed at them would teach a requirement that does not exist.

The optional name seeds metadata.name for a kind whose schema requires one. Every other required value is left as a placeholder to fill in.

Nothing is written to disk. The document goes to standard output, so a redirect decides where it lands:

  aggrega scaffold component my-service > my-service.yaml

The same starter document is served to an assistant by the scaffold tool that aggrega mcp exposes, which returns these bytes alongside a machine-readable payload; this command is the terminal route to the same drafting.
```
<!-- END GENERATED: cli-scaffold -->

## What it does

`aggrega scaffold <kind>` prints a starter document for one entity kind to standard output. The document carries exactly the fields that kind's schema requires: `apiVersion` and `kind` are filled in, because the schema fixes them, and every other required value is left as a placeholder for you to replace.

The optional `[name]` seeds `metadata.name` for a kind whose schema requires one:

```bash
aggrega scaffold component my-service
```

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: my-service
  version: ""
  labels:
    component.aggrega.ai/type: ""
spec: {}
```

The kind is the lowercase-hyphenated schema token — `component`, `aggregate`, `release`, `recipe`, `manifest`, `feature`, and the rest. [`aggrega get-schema --list`](aggrega-get-schema.md) prints the whole set, and a token no schema answers to is refused with that set in the message, so a typo is corrected without a second lookup.

## What it hands back, and what it does not

**The document comes from the kind's own contract and from nothing else.** It is not a worked example. There is no namespace, no category, no label values filled in for you, and no commented suggestion of what people usually write — because none of those is something the compiler requires. A catalog chooses its own naming, its own categories and its own directory layout; the schema decides the fields, and the schema is all this command reads. A starter document that guessed at the rest would teach you a rule that does not exist.

**It writes no file.** The document goes to standard output, so a redirect decides where it lands and nothing on disk is replaced without you asking for it:

```bash
aggrega scaffold component my-service > my-service.yaml
```

**It is not a finished entity, and that is what a placeholder means.** An empty required value is not a value, so running [`aggrega validate`](aggrega-validate.md) over the document exactly as it came out refuses it and names every placeholder still owed at once, each with what it takes — above, the version and the component type:

```
Entity: my-service.yaml
Kind:   Component
[E0215]
  document envelope validation failed: 2 placeholders still owed in my-service.yaml; an empty required value is not a value, so each of these needs one before the document validates:
    5:3: metadata.version takes a semantic version, such as 1.0.0
    7:5: metadata.labels.component.aggrega.ai/type takes one of: server, worker, task, function, stateful-server, resource
```

What each value takes is read from the kind's own schema: the values it accepts where the schema lists them, a semantic version where it asks for one, and otherwise the schema's own description of the field. Supply those values and the same command accepts the document. Nothing about its shape has to change, because the shape came from the schema.

**A value is owed even where the schema would take it empty.** A drafted Recipe or FeatureRecipe carries an empty `capability` and `implements`. Their schema admits an empty string, but an empty one names no provider and no type, so `aggrega validate` names both as still owed until you fill them in. That reading belongs to validating one entity file: a whole-catalog run, `aggrega validate --release` and [`aggrega build`](aggrega-build.md) do not apply it. See [placeholders still owed](aggrega-validate.md#placeholders-still-owed) for what it covers.

## The same document from an assistant or an editor

The starter document is the same bytes whichever surface asks for it. An AI assistant connected through [`aggrega mcp`](aggrega-mcp.md) reaches it as the `scaffold` tool, which returns the document as text alongside a machine-readable payload. An editor driving [`aggrega serve`](aggrega-serve.md) reaches it at `aggrega/scaffoldEntity`. The document is derived from the schema once, so the one you draft at a terminal and the one an assistant drafts for you are byte for byte identical.

## Examples

Draft an unnamed Release and read it on the terminal:

```bash
aggrega scaffold release
```

Draft a Recipe straight into a file:

```bash
aggrega scaffold recipe postgres-helm > postgres-helm.yaml
```

Check what you still owe before filling anything in:

```bash
aggrega scaffold component my-service > my-service.yaml
aggrega validate my-service.yaml
```

For the authoring loop this command starts — draft the shape, fill the placeholders, validate — see [Getting Started with Authoring](../../authoring/getting-started.md).
