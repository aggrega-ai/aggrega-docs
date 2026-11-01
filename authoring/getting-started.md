# Authoring Aggrega files

Authoring in Aggrega is a short, repeatable loop. Whichever entity you are writing — a developer's Aggregate, an architect's Component, an operations Recipe, or an operator's Release — the same five moves get you from a blank file to a validated one:

1. **Pick the entity your role owns.**
2. **Learn its shape** from the JSON Schema and the reference page.
3. **Start from a skeleton** rather than a blank file.
4. **Fill in the fields your role owns**, leaving the rest to their owners.
5. **Validate**, then compile.

This page walks the loop once, both for a person authoring by hand and for an AI assistant authoring through the Model Context Protocol server. The two paths are the same loop over the same reference surfaces. Both need the `aggrega` binary: [Install the binary](setup.md#install-the-binary) installs it with one command.

## 1. Pick the entity your role owns

Aggrega separates authoring into four collaborating roles — developer intent, the platform catalog, infrastructure recipes, and deployment wiring. Each role typically owns a specific set of entity kinds. If you already know your role, jump to the entity you need; if not, read [Personas](personas.md) for the four roles and [Entities by Role](entities-by-role.md) for the full kind-to-role map.

The separation is guidance, not a rule the compiler enforces. A solo author is free to wear every hat and write all the entities in one sitting; the compiler accepts any authoring pattern that passes schema validation. The roles exist to keep concerns clear, not to gate what you may write.

## 2. Learn its shape

Every entity kind has a canonical JSON Schema and a field-by-field reference page. Read both before you write:

- **The schema** is the exact structure: required fields, allowed values, and nesting. From the command line, `aggrega get-schema <kind>` prints it; `aggrega get-schema --list` names every kind you can ask for. An assistant reads the same bytes from the `schema://<kind>` resource. See the [`aggrega get-schema`](../language-reference/cli/aggrega-get-schema.md) reference.
- **The reference page** explains what each field *means* and how the fields relate. The entity pages live under [`language-reference/entities/`](../language-reference/03-entities.md) — for example [component](../language-reference/entities/component.md) or [aggregate](../language-reference/entities/aggregate.md). An assistant reads the same page from the `langref://entities/<kind>` resource.

The schema tells you what is structurally valid; the reference tells you what is *sensible*. Read the schema to avoid rejection at validation time and the reference to author something that does what you intend.

## 3. Start from a skeleton

Starting from a skeleton is faster and less error-prone than a blank file. An assistant connected to the MCP server calls the `scaffold` tool with a kind and a name to get a minimal starting point carrying every field the kind requires, with a placeholder wherever a value is still owed. Authoring by hand, `aggrega scaffold <kind> <name>` prints the same starting point to standard output, so redirect it into a file; or copy the closest [worked example](../language-reference/examples/README.md) and pare it down to what you need.

Either way, the skeleton already carries the required top-level fields (`apiVersion`, `kind`, `metadata.name`) in the right shape, so you spend your attention on the fields your role owns rather than on boilerplate.

## 4. Fill in the fields your role owns

Fill only the pillars your role is responsible for, and leave the others to their owners. A developer supplies application intent and values; an architect declares the contract — the values a developer may supply, the outputs a component provides, the sockets it exposes; operations map that contract onto a specific provider without changing the developer-facing surface; an operator wires the deployment. [Entities by Role](entities-by-role.md) spells out which pillars belong to which role for every kind.

Keeping each value in the pillar its owner controls is what lets the same developer intent target different infrastructure across environments without the developer's file changing. It is the reason the authoring surface is split at all.

**Keep the description to a few short paragraphs.** An entity's `metadata.description` is the prose a reader meets before choosing it: it is published with the entity as its searchable description, and `aggrega search` matches a query against it. Write it for that moment, as short paragraphs — in a folded `description: >` block, a blank line starts a new one — saying what the entity is, how a reader uses it, and where it is realized and what it does not do. A limit a reader must know before choosing the entity belongs there too, stated briefly. Everything else — why a default is what it is, how a setting behaves on one target, what a value means under each realization — goes in YAML comments beside the field or block it explains, where the person working with that field will read it. Nothing in the compiler limits a description's length or acts on what it says, so keeping it short is for the reader's sake.

## 5. Validate, then compile

Check the file before you rely on it:

- An assistant calls the `validate` tool, which reports schema and reference errors inline so it can correct the draft before handing it back.
- By hand, `aggrega validate <file>` checks one Component, Feature, Recipe, FeatureRecipe, Workload or Plugin file, and `aggrega validate --release <release>` checks everything a Release reaches, its Aggregate and Manifest included. `aggrega lint` runs the publishing-discipline rules over a catalog entity, and `aggrega inspect` resolves and shows what the compiler sees. When the whole topology is ready, `aggrega pull --release <release>` resolves its dependencies and writes its lockfile, and `aggrega build --release <release>` then compiles the Release into per-boundary artifacts — a failed build names exactly what to fix.

Validation early is cheaper than a failed build late. Author, validate, correct, and only then compile.

## Authoring with an AI assistant

The `aggrega mcp` command runs a Model Context Protocol server that turns any MCP-capable client into an Aggrega-aware authoring assistant. Once connected, the assistant can:

- **Adopt a role** through the built-in authoring prompts — one per persona (developer, architect, operations) plus a focused per-entity template. Each prompt frames the role and points the assistant at the schema, the reference page, and this guide, so its suggestions stay inside the pillars the role owns.
- **Read the reference** through resources: `schema://<kind>` for a kind's JSON Schema, `langref://<path>` for any reference page, and `authoring://<topic>` for this guide.
- **Act on your workspace** through tools: `scaffold` to start a correct skeleton, `validate` to check a draft, `describe` to inspect a catalog entity, and `get-schema` to fetch a schema by kind.

Everything the assistant reads is served from your machine: the schemas are built into the binary, and the guide and reference pages come from the documentation bundle kept in your machine's cache, which the server fetches from the registry when it starts and finds no copy there. Reading a page, scaffolding and validating do not reach the network; where the bundle cannot be fetched, the schemas are still served and the pages are not. To connect a client, follow [Connect the MCP server](mcp-server.md); [What your assistant can do with Aggrega](what-your-assistant-can-do.md) covers the rest of what it reaches. For the command itself, see the [`aggrega mcp`](../language-reference/cli/aggrega-mcp.md) reference.

## Where to go next

- [Personas](personas.md) — understand the four roles before you pick an entity.
- [Entities by Role](entities-by-role.md) — the full kind-to-role map.
- [Setup](setup.md) — install the binary; [Connect the MCP server](mcp-server.md) connects your assistant.
- [Set up Aggrega with your AI assistant](ai-assistant.md) — one prompt that has your assistant install and connect Aggrega itself.
- [CLI Overview](../language-reference/07-cli.md) — every `aggrega` subcommand.
