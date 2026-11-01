# Roadmap

The directions Aggrega is working in, in plain words. This page gives no dates. What works today, surface by surface, is on [Status of the Language](language-reference/10-status.md).

## A visual view of your architecture

Aggrega Studio is the visual frontend in the works: it draws the graph the compiler resolves from your files and lets you author an Aggregate on a canvas. It reads the same graph `--ir-graph` writes today, described by a published schema, so what it shows is what the compiler builds. A streaming mode, in which the command line sends the graph as it changes, belongs to the same work. See [Editors, assistants and other frontends](architecture/15-editors-assistants-and-frontends.md).

## Taking over what already runs

Most teams already have infrastructure running. A planned `core/resource-adoption` Feature makes a build write the target's own adoption syntax, such as Terraform `import` blocks, so an existing resource such as a database is brought under management instead of being created again. See [the import lifecycle](architecture/12-day-two-lifecycles.md#6-the-brownfield-import-lifecycle).

## More platforms, through plugins

Each target is written by a provider plugin, a WebAssembly module, and the standard library's own providers are plugins too. A new target, sidecar or security integration arrives as a plugin built against the stable plugin interface, with no new compiler release, and the same holds for one your own team writes. See [Extensibility](architecture/14-extensibility.md).

## More projects to import

`aggrega import` turns a project you already have into draft Aggrega files to review. Each format is read by an importer plugin, so adding a format means adding an importer, never changing the compiler, and a catalog can carry importers of its own. See [the importers](language-reference/plugins/core-importers.md).

## A growing standard library

The standard-library catalog keeps growing. Its categories are a fixed list, and a category with no component yet is kept as the place where one will land, so the catalog grows without moving what is already there. Every component it gains is one more match `aggrega import` can propose. See [Catalog and registry](architecture/13-catalog-and-registry.md).

## Policies as plugins

Rules for security, compliance or cost are policy plugins attached to the governance socket: they check every build of a workspace and stop one that breaks them, saying what to fix. A policy your team writes can, for example, estimate what a Release costs and stop a build over budget. The compiler stays content-neutral, and every policy lives in a plugin. See [Governance and compliance](architecture/11-governance-and-compliance.md).

## The same tools at the terminal, in the editor and in your assistant

The command line, the Visual Studio Code extension and an AI assistant connected through `aggrega mcp` are each built on the `aggrega` binary rather than beside it: drafting a document or editing one gives the same bytes whichever of them asks. See [`aggrega scaffold`](language-reference/cli/aggrega-scaffold.md) and [`aggrega edit-document`](language-reference/cli/aggrega-edit-document.md).
