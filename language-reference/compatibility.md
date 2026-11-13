# Compatibility: what a release promises

An upgrade of Aggrega can change several surfaces you build on: the schemas your documents are written against, the commands and flags your scripts call, the tools an AI assistant calls, the error codes you record, and the plugin kits a plugin is built with. This page states, for each of them, what a release may change and what it does not. A surface this page does not name carries no promise beyond what its own reference page states. The last section says where a release tells you that one of them changed. The promises on this page start at 0.9.0. Releases before 0.9.0 are unsupported: the hub registry, `hub.aggrega.ai`, serves no Plugin version made for them, and their compilers cannot read its catalog, whose documents declare `aggrega.ai/v1beta1`.

Aggrega is released as `0.x.y` versions: a patch release raises the last number, a minor release the middle one. A catalog entity's own `metadata.version` is a separate matter — its author chooses it, under the version-bump rubric [`aggrega lint --pre-publish`](cli/aggrega-lint.md) checks, and [Version resolution](version-resolution.md) describes how a reference selects one.

## Schemas

Every schema Aggrega publishes belongs to one API version, `aggrega.ai/v1beta1` — the value an entity document declares in its `apiVersion`. The rule below covers each of them: the entity kinds, the plugin payloads, and the workspace and other schemas — the IR, the workspace configuration, the lockfiles and the rest — all listed in the [Schema Reference](schema/README.md). The API version is separate from the release number: many releases read the same API version.

### What may change within `v1beta1`

Within one API version a schema changes only additively, as Kubernetes changes its own API versions. A release may:

- change a description;
- add a field, when the field is optional.

Every document that was valid before such a change is still valid after it, and means the same thing. A program that reads a document the compiler writes, such as the IR or a lockfile, needs to accept a field it does not know, because an added optional field can appear in that output within `v1beta1`.

### What needs `v1beta2`

Each of these changes needs a new API version, `aggrega.ai/v1beta2`:

- removing or renaming a field;
- making a field required;
- narrowing a type, or the set of values a field accepts;
- changing what a value means.

A new API version is a breaking change, scheduled and announced as one in the release that brings it.

### A new optional field reaches a catalog with the compiler that knows it

The compiler refuses a field its schema does not declare. That strictness is what catches a misspelt key, and it has one consequence a reader would not guess: **a catalog entity may begin to use a newly added optional field only in a release that ships a compiler knowing that field.**

For example, suppose a release adds an optional field to the Component schema — call it `spec.newField`:

1. Every Component written before that release is still valid; none of them sets the field.
2. A catalog author publishes a new version of a Component that sets `spec.newField`.
3. A compiler from that release, or a later one, validates and builds the Component.
4. A compiler from an earlier release refuses it, because its own schema does not declare the field: validation reports `spec.newField: unexpected property` and names the line.

So whoever builds against that catalog version upgrades to the release that added the field first, and a catalog publishes an entity using the field only once that release is out. How a locked Release keeps the versions it resolved is in [Version resolution](version-resolution.md#determinism).

## The command line and the assistant tools

Scripts, CI pipelines and assistant configurations call `aggrega` commands, flags and assistant tools by name. In the `0.x` releases:

- **A patch release never removes or renames a command, a flag or an assistant tool.**
- **A minor release may remove or rename one**, and its changelog says so under **Removed** or **Changed**.
- **Additions** — a new command, flag or tool — may come in any release.

The assistant tools are the tools [`aggrega mcp`](cli/aggrega-mcp.md#what-it-does) offers a connected assistant. The server's own answer is their full list, and [What your assistant can do with Aggrega](../ai-assistants/what-it-can-do.md) says how to ask for it. A tool that runs a command takes its name from the command's invocation path, so renaming a command renames its tool. The [CLI Overview](07-cli.md) lists every command.

## Error codes

Every halting condition carries a short code — the letter `E` and four digits, as in `[DEVELOPER_ERROR E0007]` — printed at the head of its diagnostic. **The short codes are a public contract: a code is handed out once, never renumbered, and never given to a different condition.** A retired condition's code stays retired, so a code recorded in a runbook, a CI rule or an issue names the same condition after every upgrade.

[Error sentinels](errors/sentinels.md) teaches the identifiers a condition carries — the short code a person quotes, the descriptive code a program records, and the Go accessor a program matches — what each one promises, and how a retired number is kept from being handed out again. Its [table of every condition](errors/sentinels.md#every-condition-by-short-code) resolves every short code, retired ones included, and [`aggrega explain`](cli/aggrega-explain.md) resolves one at the terminal.

## Plugin kits

The plugin development kits — `github.com/aggrega-ai/aggrega-pdk/go`, `aggrega-pdk-rust` and `@aggrega-ai/aggrega-pdk-typescript` — and the `aggrega-abi` codecs they re-export follow semantic versioning from `0.9.0`. The three languages of the kits share one version number, and the three languages of the codecs share another.

- **A plugin built against a version keeps building against every later release of the same line.** Within `0.9.x` a release may add exported functions, types and constants, and never removes or changes one.
- **A breaking change to an exported API ships only in a new minor version** (`0.9.x` to `0.10.0`), and a patch release never breaks. The kits and codecs move to `1.0.0` together with Aggrega's own `1.0.0`, after which a breaking change raises the major number.
- **A breaking change in the codecs is a breaking change in the kits**, which raise their own minor version with it, because they re-export the codec types.
- Whether a field or member added to an existing type counts as an addition depends on the language. Each kit's README, published with the package, states its language's case under "Compatibility".

This promise covers the API a plugin's source names. What crosses between the compiler and a running plugin is held by the plugin ABI version instead: within one ABI version a socket gains only descriptions and optional fields, so a plugin built against it keeps loading. The [plugin contract](plugins/plugin-contract.md) describes the sockets, and the [plugin developer guide](plugins/plugin-developer-guide.md) the workflow around them.

## What a release's changelog says

Each release's notes, on the [releases page](https://github.com/aggrega-ai/aggrega-cli/releases), carry its changelog, grouped under headings such as **Added**, **Changed**, **Removed** and **Fixed**. For the surfaces on this page:

- **A command, flag or assistant tool removed or renamed** is listed under **Removed** or **Changed**, in the minor release that makes the change.
- **A new schema API version** is announced as a breaking change in the release that brings it.
- **A breaking change to the plugin kits or codecs** shows in their version number: it is a new minor version below `1.0.0`.
- **An error code** never changes meaning, so no release has one to announce.
