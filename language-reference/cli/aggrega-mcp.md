# aggrega mcp

Run a Model Context Protocol server over stdio for AI-assistant integration

<!-- BEGIN GENERATED: cli-mcp -->
**Synopsis**

```
aggrega mcp
```
<!-- END GENERATED: cli-mcp -->

## What it does

`aggrega mcp` runs a Model Context Protocol server over the process's standard input and output. It is not a command you run interactively — an MCP-capable client (Claude Desktop, Cursor, Windsurf, Cline, or any other) launches it as a subprocess and speaks the protocol over stdio. Running it turns the CLI into an Aggrega-aware authoring assistant inside your editor or chat client.

The server exposes three surfaces to the connected assistant:

- **Prompts** — one authoring persona per role (developer, architect, operations) plus a focused per-entity template. Each prompt frames the role and points the assistant at the right schema, reference page, and authoring guide, so its suggestions stay inside the pillars that role owns.
- **Resources** — read-only reference material served inline: `schema://<kind>` for an entity's JSON Schema, `langref://<path>` for any language-reference page, and `authoring://<topic>` for the authoring guide.
- **Tools** — actions against your workspace, in two tiers.

  The tools an assistant sees by default are shaped for the authoring loop: `list-entities` and `list-releases` to find out what the workspace holds, `scaffold` a schema-correct skeleton for a kind, `get-schema` for an entity's JSON Schema, `validate` a draft, `describe` a catalog entity, `build` a Release into its rendered artifacts entirely in memory (a preview that writes nothing to disk), `gen-catalog` to generate Plugin entities from Wasm guests, and `explain-error` to expand a compiler diagnostic into actionable guidance.

  Behind those sits the rest of the command line, one tool per command, surfaced on demand rather than up front — `lint`, the two candidacy tools below, and a tool for each command you could otherwise type, named after its invocation path. An assistant asks for them with `describe-capabilities`, which returns each tool's name, description and argument schema, and can narrow the set to a single entity kind. Keeping them out of the default list holds down the definitions a client loads before it has done anything; each is then called by name like any other tool. Arguments are named after the command's own flags, so `--output-dir` is sent as `output_dir`, and an unrecognised name is refused with the accepted spellings listed rather than being quietly dropped.

  Some capabilities sit in both tiers: a tool shaped for the authoring loop runs the operation inside the server, and the tool named after the command that carries the same capability runs that command. The two do not behave alike, so each names the other and states the difference. The one that runs inside the server is the one to reach for — it answers with a machine-readable result alongside the readable text, so an assistant gets a verdict, a file list or a diagnostic as fields rather than as a transcript to parse. The command tool starts the real command in a separate process, so it does whatever that command does on the machine it runs on, including writing to disk where the command writes, and hands back only the command line it ran and the text that command printed. Reach for it when you need a flag the command declares that the other tool does not accept.

  A few commands are deliberately absent, each for a stated reason: the daemon and this server itself would never return a result; a command that reads a password from the terminal has nothing to read it from; one that writes a shell completion script has no shell to install it into; and acquiring an identity token interactively has no non-interactive form to offer. Commands that sign or publish are present and work from a token supplied in the environment — where the command line would open a browser, the tool refuses and names what to supply instead, rather than waiting on a person who is not there.

## What an assistant can do without asking you first

**An assistant connected to this server can call every tool the server exposes, without asking you, unless your client is configured to deny it.** The server offers the tools; it does not decide which of them any particular call is allowed to use. That decision is your client's, and it is yours to make there.

This matters because the tool surface is the command line. Anything you can type, an assistant can call — including the operations that change your machine.

**Some of those operations reach further than the workspace you are working in, and cannot be undone by running something else.** Two are worth knowing by name:

- `aggrega cache evict` trims the compiled-module store, and `aggrega cache clear` wipes it. That store is shared by **every** Aggrega project on the machine. Modules removed from it are recompiled on demand, so nothing is lost permanently — but the next build of any project pays that cost.
- `aggrega cache prune` reclaims artifact-cache entries no lockfile references. Where a project's lockfile is not present to be read, its pinned artifacts are not protected by it, and reclaiming them means fetching them again.
- `aggrega registry add` and `aggrega registry remove` write to the configuration shared across every workspace by default, so they change what resolves everywhere on the machine, not only here.

The inventory tools say so in their own answers. `cache-status` marks each cache class with its reach — `workspace` for the artifact cache under this project's own cache directory, `machine` for the stores every project shares — and names the machine-wide ones outright, so an assistant reading the inventory before proposing a reclamation is told which parts of it are not yours alone. The maintenance operations report the same reach for each element they removed.

**Where you set the boundary.** The protocol itself defines no per-tool permission — its authentication is about whether a client may connect at all, not about which tools it may then call. The permission decision lives in your MCP client. Every widely used client can allow and deny individual tools by name from a single server, and can disable a server entirely for a given project; the setting's name and location differ per client, so consult your client's own documentation for tool permissions. If you want the reads and not the writes, allow the tools you want and deny the rest there. A permissive configuration, or a client with no such setting, leaves every exposed tool callable.

## Finding out what a workspace holds

Almost every tool takes a subject: an entity name, or the path of a Release. Two do not, and they are how an assistant that has just arrived gets one.

`list-entities` reports every entity in the workspace — each one's kind, name, `apiVersion`, description, labels and source file, read straight from the document that declares it. It also reports the Features your configured catalog directories declare, so that a Feature offered to you as attachable is one you can also look up; those carry no source file, because the only path they have is one on the machine the server runs on, and each says where it came from so an empty file reads as "resolved from the catalog" rather than as a missing value. `list-releases` answers the narrower question the rest of the surface keeps asking: which Releases are there. Neither takes a subject, because what a workspace contains is a property of the workspace rather than of anything the caller has to know first.

That matters because the tools that do take a name **refuse** one they cannot resolve rather than answering with an empty result. The refusal is deliberate — an empty answer would report a mistyped name as a subject with nothing to offer — but it means a caller holding no name cannot get one by guessing. Enumerating is the way to get one.

The two compose, and with the rest of the surface:

- Enumerate with `list-entities`, take a name out of the result, and hand it to `describe` to see that entity's fully-resolved definition.
- Enumerate with `list-releases`, take a path out of the result, and hand it to `describe` or `build` as the Release to work on.
- The path `list-releases` returns is relative to the workspace root, which is the same coordinate `list-entities` reports a file under, so the two answers line up on the file and can be read together.

Both decide what counts by reading each document's own `kind`, never its filename. A Release named without a conventional prefix is listed; a file merely *named* like one is not, and appears under whatever kind it actually declares. YAML that declares no `kind` at all — a chart's values file, a configuration file that happens to sit in the tree — is not an entity and is not reported. A document counts as an entity when it declares both a `kind` and a name, because those two together are what makes it addressable afterwards.

## Asking what may attach, and what may connect to what

Two tools answer the questions an assistant would otherwise have to guess at: which Features may attach to a node, and what a node may connect to. Both run the same label match the compiler runs, so what the assistant offers you is the set a build would match rather than a set inferred from the schema. Neither is in the default list; ask `describe-capabilities` for them, or for the entity kind you are working on.

`attach-candidates` reports the Features whose declared applicability a node's labels satisfy. Address the node in exactly one of three ways:

- `node` — a workspace entity's `metadata.name`, as `list-entities` reports it. The match runs over the labels that document declares.
- `graph_node` with `release` — a node on a compiled graph, keyed as the graph keys it, including the qualified form a node contributed by a sub-aggregate carries. The match runs over that node's finalised labels, which are the ones a build evaluates.
- `labels` — a label set on its own, naming no node. It needs no coordinate at all, so if you already hold a node's labels this is the form to use; it looks nothing up and rebuilds no graph.

The answer carries the labels the match ran over and which of those three sets they came from, so you can explain any candidate — or the absence of one — from the answer itself rather than working it out again. Reading them back a second way is how your idea of a node's labels and the compiler's come apart.

`connection-candidates` reports the dependency sockets an entity declares and, per socket, the workspace Components whose declared labels satisfy the constraint that socket declares over its targets. It takes the entity's `metadata.name` in `node`. Unlike `attach-candidates` it has no coordinate-free form: there is no label-set shape here, because the sockets are read from the named entity's own declaration.

**Its two halves are not equally complete, and the answer says which is which — do not present them as one list.** The targets are complete: those are the components the same constraint admits during a build. The sockets are not, and cannot be. A consumer may invent a connection but may only consume what a producer declares, so an author may legitimately write a socket the catalog entity never declared, and the declared sockets are a helpful start rather than the set of legal names. Each socket therefore says whether it is `declared` or `ad-hoc`, and the answer says whether an undeclared socket is accepted on that entity at all — a Component's own dependency surface accepts one, because an author owns their application's topology; a Feature's attachment surface does not, because an attachment participates in the topology the attached Feature declares rather than authoring one. That openness is a consequence of your authoring freedom, not a gap: pass `socket` with a name the entity does not declare to ask about it.

Both **answer and stop**. Neither creates an attachment, creates an edge, writes to any file, or proposes the text of one; composing and applying whatever edit follows is yours.

Both return the same minimal identity every other answer here uses — kind, name and source file — and nothing more. Everything else you would want to display about an entity is already in `list-entities` for the same three fields, so you join the two answers rather than reading two copies that could disagree. Both refuse a name they cannot resolve rather than answering with an empty list, for the reason the rest of the surface does: an empty answer would report a typo as a subject with nothing to offer. A `labels` call has no name to mistype, so an empty result there means what it says.

Everything the server reads is served offline — the JSON Schemas are built into the binary and the documentation is read from the local documentation-bundle cache. Authoring never reaches the network: scaffolding, validating, describing, building and linting all run against your workspace and the local caches.

The one exception is acquiring the documentation bundle itself, and it happens away from every read. The server pulls the bundle once per session, while the client is connecting, through the same egress settings the rest of the CLI uses — so the pages are already cached by the time anything asks for one. Serving a page is then a local read that cannot reach the network at all. If the bundle cannot be acquired the server still starts and every other surface works; documentation requests answer not-found, and the server's log stream says why.

## When a call does not succeed

Where the answer arrives depends on one thing: whether the caller can fix it by changing the arguments of a tool that exists.

Everything that can be fixed that way comes back as the tool's own result, flagged as a failure and carrying the correction as its text — a combination of selectors the tool does not accept, a required argument left out, an argument sent as the wrong JSON type, a path that does not resolve, a diagnostic from the compiler. That is the channel an assistant is shown, so it reads what went wrong and calls again with the argument corrected.

The protocol's error channel is kept for what has no tool result to live in: a tool name the server does not serve, a request whose parameters it cannot read, a method it does not implement, and a message that is not valid JSON at all. Reading a resource and rendering a prompt answer there too, because neither of those results carries a failure flag of its own.

A tool's advertised schema also declares the rules its arguments must satisfy — which selectors are mutually exclusive, which argument is meaningful only alongside another, and which are required — so a client composing calls against the declared schema does not have to make the call to learn them.

## When to use it

Use `aggrega mcp` when you want an AI assistant to help author Aggrega entities against the real schemas and reference — so its suggestions are grounded in the exact structure the compiler accepts rather than guessed. It fits the authoring loop directly: the assistant reads a kind's schema and reference, scaffolds a skeleton, fills the fields your role owns, and validates before handing the draft back. See [Getting Started with Authoring](../../authoring/getting-started.md) for that loop.

You typically never type `aggrega mcp` yourself. Instead you name it once in your client's MCP configuration, and the client starts and stops it for you.

## Example: client configuration

Point an MCP client at the command with a stdio server entry:

```json
{
  "mcpServers": {
    "aggrega": {
      "command": "aggrega",
      "args": ["mcp"]
    }
  }
}
```

The only prerequisite is the installed `aggrega` binary on the client's `PATH`. For per-client configuration paths and troubleshooting, see [Setup](../../authoring/setup.md). To fetch a schema directly from the command line without a client, see [`aggrega get-schema`](aggrega-get-schema.md).
