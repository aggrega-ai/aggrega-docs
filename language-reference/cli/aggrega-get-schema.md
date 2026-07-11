# aggrega get-schema

Print the JSON Schema for an entity or contract kind

<!-- BEGIN GENERATED: cli-get-schema -->
**Synopsis**

```
aggrega get-schema [kind] [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--list` | `false` | List every schema kind, one per line. |
<!-- END GENERATED: cli-get-schema -->

## What it does

`aggrega get-schema <kind>` prints the canonical JSON Schema for one entity or contract kind to standard output. The schema is the authoritative structural contract: the required fields, the allowed values, and the nesting the compiler accepts for that kind. It is served from the schemas built into the binary, so the output always matches the version of `aggrega` you are running.

`aggrega get-schema --list` prints the name of every kind you can ask for, one per line — the entity kinds an author writes (`aggregate`, `component`, `feature`, `recipe`, `featurerecipe`, `manifest`, `release`, `plugin`, `schemalibrary`, `mappinglibrary`, `workload`) alongside the internal contract schemas the compiler uses. Run it first when you are unsure of the exact token to pass.

## When to use it

Reach for `get-schema` when you need the exact shape of a kind while authoring — which fields are required, what a value may be, how a block nests. It is the ground truth to check a hand-written file against, and the starting point when learning an unfamiliar kind. Because it prints machine-readable JSON Schema, you can also feed it to a schema-aware editor or a validation tool.

An AI assistant connected through [`aggrega mcp`](aggrega-mcp.md) reads the same bytes from the `schema://<kind>` resource, so the schema an assistant authors against and the schema you fetch on the command line are identical. This page documents the command; it does not reproduce any schema's contents — run the command, or open the corresponding [entity reference](../entities/) page for the field-by-field explanation of what each field means.

## Examples

Print the schema for a Component:

```bash
aggrega get-schema component
```

List every kind you can request:

```bash
aggrega get-schema --list
```

Fetch a schema and inspect a single field with a JSON tool:

```bash
aggrega get-schema recipe | jq '.properties.spec'
```

For the authoring loop that this command feeds — learn the shape, scaffold, fill, validate — see [Getting Started with Authoring](../../authoring/getting-started.md).
