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

- **Prompts** — two families, and the difference is what each one answers. *Authoring* prompts answer "what am I writing": one persona per role (developer, architect, operations), plus a focused per-entity template. Each frames the role and points the assistant at the right schema, reference page, and authoring guide, so its suggestions stay inside the pillars that role owns. *Workflow* prompts answer "which calls, in what order": each lays out the ordered sequence of tool calls that reaches a goal spanning several operations, with the decision points between them — starting a deployment, bringing an existing one into Aggrega, working out why one fails or renders the wrong artifacts. `prompts/list` enumerates both families and `prompts/get` renders one, so the set is read from the server rather than from this page.

  A workflow prompt names the calls and you make them, one at a time, reading each result before the next. There is no call that performs a whole goal: each tool wraps one operation you can check, so the sequence is the thing that gets you there. The authoring personas take an optional `kind` to focus on, the per-entity template requires one, and a `kind` no schema answers to is refused with the accepted set listed rather than quietly ignored.
- **Resources** — read-only reference material served inline: `schema://<kind>` for an entity's JSON Schema, `langref://<path>` for any language-reference page, `authoring://<topic>` for the authoring guide, `catalog://<kind>/<name>` for a catalog entity's authored YAML, and `cli://<command>` for a command's own help, with `cli://` alone as its entry point. `resources/list` enumerates the ones addressable without a parameter and `resources/templates/list` advertises every family's URI shape.
- **Tools** — actions against your workspace, in two tiers.

  The tools an assistant sees by default are shaped for the authoring loop: `list-entities` and `list-releases` to find out what the workspace holds, `scaffold` a schema-correct skeleton for a kind, `get-schema` for an entity's JSON Schema, `validate` a draft, `describe` a catalog entity, `build` a Release into its rendered artifacts entirely in memory (a preview that writes nothing to disk), `gen-catalog` to generate Plugin entities from Wasm guests, and `explain-error` to expand a compiler diagnostic into actionable guidance.

  Behind those sits everything else, surfaced on demand rather than up front: further tools that run inside the server — `lint`, the two candidacy tools, the attachment-container and insertion-point tools and the four publication tools described below, plus inventories of the caches and the configured registries — and a tool for each command you could otherwise type, named after its invocation path. An assistant asks for them with `describe-capabilities`, which returns each tool's name, description and argument schema, and can narrow the set to a single entity kind. Keeping them out of the default list holds down the definitions a client loads before it has done anything; each is then called by name like any other tool. Arguments are named after the command's own flags, so `--output-dir` is sent as `output_dir`, and an unrecognised name is refused with the accepted spellings listed rather than being quietly dropped.

  Some capabilities sit in both tiers: a tool shaped for the authoring loop runs the operation inside the server, and the tool named after the command that carries the same capability runs that command. The two do not behave alike, so each names the other and states the difference. The one that runs inside the server is the one to reach for — it answers with a machine-readable result alongside the readable text, so an assistant gets a verdict, a file list or a diagnostic as fields rather than as a transcript to parse. The command tool starts the real command in a separate process, so it does whatever that command does on the machine it runs on, including writing to disk where the command writes, and hands back only the command line it ran and the text that command printed. Reach for it when you need a flag the command declares that the other tool does not accept.

  A few commands are deliberately absent, each for a stated reason: the daemon and this server itself would never return a result; a command that reads a password from the terminal has nothing to read it from; one that writes a shell completion script has no shell to install it into; removing a stored credential acts on the machine-wide store rather than on any workspace you named; and acquiring an identity token interactively has no non-interactive form to offer. Absent on that same machine-wide ground is `aggrega plugin run-local`, which loads a `.wasm` guest from a path you give it: what the command is *for* is reading a file wherever you put it, so there is no workspace it could be confined to, and the read happens in the process itself before the guest exists. The guest is granted nothing when it does run — no directories, no sockets, no environment — but that is a limit on the module rather than on the read, so it is not what decides this. Run it at your terminal, where you are the one naming the path. **Signing and publishing are a different case entirely, and the difference is what keeps them off that list.** Each of them resolves an identity from a supplied or ambient input and refuses out loud when none is available, so each has a form that completes with nobody watching — whereas acquiring a token interactively is a verb no input can satisfy even in principle. So they are present, in both tiers: as the commands, and as the four in-process tools described under [Publishing, signing and withdrawing](#publishing-signing-and-withdrawing). Where the command line would open a browser, they refuse and name what to supply instead, rather than waiting on a person who is not there.

## What the server tells the model when it connects

The handshake that opens a session carries a block of guidance for the model, which your client may surface to it before the first call. It is the same text for every client: nothing in it is negotiated, and nothing is derived from what the client sent, so what a model is told on connect does not vary between sessions or between clients.

It teaches the mental model a tool's argument schema cannot convey on its own:

- **What the compiler does, and what it deliberately does not do** — that it routes text and evaluates label matches rather than interpreting what a value means, that it is unopinionated about the content you put in your documents, and that while compiling it never authenticates with a provider, never reads a cluster's state, and never turns a secret into plaintext. A value that exists only once infrastructure is running travels through as a pointer string the target environment fills in later.
- **The authoring vocabulary, and how the kinds relate** — what each kind is for and which one a build is actually run against, so an assistant does not have to infer the shape of a deployment from the tool list.
- **The order the authoring loop runs in** — read the contract, scaffold from it, inspect what you are wiring to, then check before rendering.
- **When to reach for a prompt rather than a tool** — a tool to act, a prompt to frame a task.
- **That the default tool list is not the whole surface**, and the call that loads the rest.

**It names the surfaces rather than restating them.** Each tool already carries its own description and argument schema in `tools/list`, and each kind's contract already lives in its schema and its reference page, so the guidance points at those and stops — one home per statement. A tool it names is a tool the server serves, and it points at every resource family the read surface resolves, so nothing it sends an assistant after is a dead end.

It also states what it does not enumerate, and why: the render targets available and the library kinds installed are properties of your plugins and your schema set, so the resource surfaces report them directly rather than the guidance carrying a copy that could disagree.

## What an assistant can do without asking you first

**An assistant connected to this server can call every tool the server exposes, without asking you, unless your client is configured to deny it.** The server offers the tools; it does not decide which of them any particular call is allowed to use. That decision is your client's, and it is yours to make there.

This matters because the tool surface is the command line. Anything you can type, an assistant can call — including the operations that change your machine.

**Some of those operations reach further than the workspace you are working in, and cannot be undone by running something else.** These are the ones worth knowing by name, widest reach first:

- **`publish-entity`, `publish-artifact`, `sign-artifacts` and `deprecate-artifact` reach past the machine entirely.** They put bytes, a signature or a withdrawal marker in a registry, so what they change is what **every** consumer of that registry resolves — not only what this machine does. Re-publishing different content over a tag is refused rather than offered, so nothing here takes a publication back; the answer is to publish a new version. A signature and a withdrawal marker leave the artifact's bytes untouched, but anyone who fetches that artifact afterwards fetches them too, and **neither can be recalled from anyone who already has it**. The same four capabilities are also reachable as `cli-push`, `cli-push-artifact`, `cli-sign` and `cli-deprecate`, which run the commands.
- **Signing uses credentials.** Keyless signing takes an identity token from the call's `identity_token` argument, from `AGGREGA_IDENTITY_TOKEN` or `SIGSTORE_ID_TOKEN` in the server's environment, or from the ambient GitHub Actions OIDC endpoint where one is reachable; `key_path` selects an offline held key instead. An assistant that can call these tools can therefore sign as you, with whatever identity the machine running the server already carries — and a signature is a statement about who vouches for an artifact, which is why this is the operation to think hardest about before allowing it.
- `aggrega cache evict` trims the compiled-module store, and `aggrega cache clear` wipes it. That store is shared by **every** Aggrega project on the machine. Modules removed from it are recompiled on demand, so nothing is lost permanently — but the next build of any project pays that cost.
- `aggrega cache prune` reclaims artifact-cache entries no lockfile references. Where a project's lockfile is not present to be read, its pinned artifacts are not protected by it, and reclaiming them means fetching them again.
- `aggrega registry add` and `aggrega registry remove` write to the configuration shared across every workspace by default, so they change what resolves everywhere on the machine, not only here.

The inventory tools say so in their own answers. `cache-status` marks each cache class with its reach — `workspace` for the artifact cache under this project's own cache directory, `machine` for the stores every project shares — and names the machine-wide ones outright, so an assistant reading the inventory before proposing a reclamation is told which parts of it are not yours alone. The maintenance operations report the same reach for each element they removed. Each of the four publication results carries a `reach` of its own, holding `registry` — the host it addressed — and `beyond_this_machine`, which is read off what the call actually did rather than what it asked for, so it is false for a dry run and true once anything has landed.

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

Everything the server reads for reference is served offline — the JSON Schemas are built into the binary and the documentation is read from the local documentation-bundle cache. Authoring never reaches the network: scaffolding, validating, describing, building and linting all run against your workspace and the local caches. Publishing and signing are the deliberate other side of that, and they are covered above; nothing in the authoring loop reaches a registry on their behalf.

The one exception among those reference reads is acquiring the documentation bundle itself, and it happens away from every read. The server pulls the bundle once per session, while the client is connecting, through the same egress settings the rest of the CLI uses — so the pages are already cached by the time anything asks for one. Serving a page is then a local read that cannot reach the network at all. If the bundle cannot be acquired the server still starts and every other surface works; documentation requests answer not-found, and the server's log stream says why.

## Building against the content a Release already pins

`build` renders a Release into its artifacts in memory, and a render can ask for content from a remote URL — a chart's values schema with a remote reference, for example. **External inputs are frozen for the call.** A reference the Release's lockfile already pins is served from the content-addressed store, which is a read of content already on disk rather than a fetch, so the files come back as the bytes a real build emits. A reference the lockfile does not pin is **declined and named** rather than fetched: what you asked for is a preview that writes nothing, and acquiring a reference would both reach the network and write a blob into the store as a side effect of it.

Declining is reported rather than absorbed, because a render that carries on around a refusal still emits files — they simply stop short of what a build would emit, and nothing about the files themselves says so. So a completed render names every reference it had to decline, and its summary points at the command that pins them: `aggrega acquire --release <path>`. A fully-pinned render says nothing about any of this. See [`aggrega acquire`](aggrega-acquire.md) for what pinning fetches and records, and [`aggrega build`](aggrega-build.md), where the same freeze applies to a dry run and an unpinned reference halts it instead of being reported alongside the files.

## What a build tells you besides its files

**A build carries every advisory it raised, on the answer itself.** These are the findings `aggrega build` prints while it works — a name one edit from a declared one, a parameter nothing reads, a target that cannot honor an authored field, a non-halting governance verdict. None of them changes the outcome: a build that carries advisories still succeeded, and the files it returns are the files it produced. They arrive in the order the build raised them, which is the order a terminal prints them, so a reader comparing the two finds one sequence rather than two.

They are on the answer rather than only in the summary text because an assistant driving this surface reads no terminal, and a finding nobody is told about is a finding that was not made. Each carries a `severity` — `warn` for something wanting attention, `info` for an observation recorded — and a `message`; a `code` where its class assigns one, so you can react to a specific condition without matching text; and a `key_path` naming the key in the authored document the finding is about, where it is about one. A finding about the shape of the deployed topology names no key, because its coordinates are the deployment's rather than a document's, and says what it concerns in its message instead.

A Release raising nothing says nothing: the key is absent rather than present and empty, so its presence alone tells you there is something to read.

## Asking which container an attachment belongs in

`attachment-container` answers the question between a candidacy answer and an insertion point. You have settled *what* to attach to a node; before you can ask where in a file to write it, you need to know which file and which container inside it. Pass `graph_node` — a node id on a compiled graph, as the graph keys it — and the `release` whose graph it is. Both are required: a node id is a key of one Release's graph and means nothing without it. Like the candidacy and insertion-point tools it is not in the default list — ask `describe-capabilities` for it.

**Do not assemble that path yourself.** A node's id and the subsystem path enclosing it are both written with dots between their parts, and a dot is a legal character in a name an author types — so from outside the document there is no way to tell a structural dot from one inside a name. A path you composed would read correctly and address a key nobody wrote, and the edit that followed would create that key rather than being refused. Worse, a node id carries no trace of its enclosing subsystem at all: a component authored inside `subsystems.billing.subsystems.payments` is keyed as `ledger`, exactly as a top-level component would be. Ask for the container.

The answer carries `node`, the node it is about; `file`, the document that node was authored in; and `container`, the structural path from that document's root as a **list of segments** — `["spec", "subsystems", "billing", "subsystems", "payments", "components", "ledger", "features"]`. It is a list rather than a joined string on purpose: a joined path would have to be split again by whoever received it, which is the ambiguity above reintroduced one call later. Pass `file` and `container` to `insertion-point` unchanged.

`file` is part of the answer rather than something you already know. A node an imported module contributed was authored in that module's own document under the name the module gave it, so both the file and the last segment of the container differ from anything you sent.

**It answers and stops.** It creates no attachment, writes nothing to any file and composes no text. It does not rule on *what* may attach either — that is `attach-candidates`. A node the graph does not carry, or one it records no document for, comes back as a failed result naming what to change rather than as an answer with an empty field.

## Locating where an entry belongs in a document

`insertion-point` answers the question that follows a candidacy answer. You have settled *what* to attach or connect; now you need to know where in the file to write it. It hands back a position and the columns to indent at, so you can apply the edit without parsing the document yourself. Like the candidacy tools it is not in the default list — ask `describe-capabilities` for it. Because what it reads is a document's own structure rather than any one kind's shape, it is offered whatever entity kind you narrow that request to.

Pass `file` — the document, relative to the workspace root or absolute, and inside the workspace — and `container`, the structural path from the document root to the container the entry goes inside, each element a mapping key or a sequence position written in decimal.

**The container path is yours to supply.** The tool reads the document's structure and never works out where something belongs from what it is called, what type it carries, or what it appears to mean. You say which key; it says where that key's entries go in *this* document — which segments of the path the file already carries, the columns its entries sit at, and the last line its innermost block reaches. For a Feature attachment on a node of a compiled graph you do not have to know that key yourself: `attachment-container` above reports the document and the container, and both go here unchanged.

The answer is a zero-width `position`, whose `line` and `character` both count from zero; `entryIndent` and `indentStep`, the columns to write at; and `missingContainerKeys`, the container keys this document does not carry yet, outermost first, which you write before the entry. `entryShape` reports whether the container holds a `mapping` or a `sequence`, and reports `unknown` where the container is not there yet or holds nothing, because the document has not said — the shape is then yours to choose. `indentStepMeasured` says whether the step was measured from this document's own nesting or is a fallback for a document that exhibits none. Where `precededByLineBreak` is set, begin your text with a line break: the position sits at the end of the line the entry follows, which is in range whether or not the file ends in a newline and disturbs no byte already written. Read `missingContainerKeys` even where you expect the container to be there — a position applied without the keys that have to precede it produces a document that no longer parses.

`position_encoding` names the units the reported character offset is measured in: `utf-8`, `utf-16` or `utf-32`. It is an argument here because this protocol runs no handshake to negotiate one, and it defaults to `utf-16`, which is what an editor session takes when a client negotiates nothing — so a caller that names nothing is answered identically on both surfaces. A value that is none of the three is refused rather than quietly defaulted, because offsets measured one way and applied into a buffer measured another corrupt the document at the first character outside ASCII.

**It answers and stops.** It writes nothing to any file, composes no entry text and applies no edit; composing the text and deciding whether to apply it are yours. A request that does not address a place an entry can go comes back as a failed result naming what to change — a document that is not in the workspace, cannot be read, or is not well-formed YAML; a container path carrying no segments or an empty one; a path running through a scalar, which nothing can be appended inside; a path reaching a collection written in flow style, where appending would rewrite bytes the author already wrote rather than add a line; or a path addressing a block sequence with something that is not one of its indices.

## Publishing, signing and withdrawing

Four tools put something where other people will resolve it. `publish-entity` bundles a catalog entity and publishes it; `publish-artifact` publishes a standalone file, such as a documentation bundle, with its bytes opaque and no entity envelope parsed; `sign-artifacts` signs already-published references and attaches each signature; `deprecate-artifact` attaches a signed withdrawal marker to one. Like the candidacy and insertion-point tools they are not in the default list — ask `describe-capabilities` for them. **Read [What an assistant can do without asking you first](#what-an-assistant-can-do-without-asking-you-first) before you allow any of them**: these are the tools whose effects leave the machine.

`publish-entity` takes `entity`, the document to publish, and a Plugin also needs `plugin`, the executable published inside its manifest. `publish-artifact` takes `file` with the `name` and `tag` it is published under. Every path argument here is absolute or relative to the workspace root, the same contract every other tool on this surface uses, and `workspace_root` names the workspace the call means. `registry` is the destination and defaults to the workspace's configured one; sending neither, with no default configured, is refused naming what to send. `sign-artifacts` takes `references`, one or more registry addresses rather than paths. `deprecate-artifact` takes either `reference` with `severity` and `reason`, or `from` naming a batch file — and refuses content arguments sent alongside a batch file rather than dropping them, because a batch file supplies its own and a silently ignored argument reads as one that was honoured.

**The two publishing tools take `dry_run`, which shows what a publication would send without contacting anything.** It computes the bundle, reports what it would have published, and answers with `beyond_this_machine` false. It is the way to show someone a proposed publication before it becomes one. Signing and withdrawing have no such form: both act on something already published, so there is nothing to preview.

Signing is where the credential is spent, and three of the four tools do it — a data-artifact publication signs nothing, and is signed afterwards by reference. `identity_token` supplies a keyless identity for the call; leaving it out falls through to the environment, and `key_path` selects an offline held key instead. `fulcio_url`, `rekor_url` and `timestamp_url` override the keyless endpoints the workspace configures. When no identity resolves at all the call **refuses and names what to send** — nothing here opens a browser or waits on a person, because there is nobody watching a protocol stream, and a call that hung would be the silent failure that refusal exists to prevent. On `publish-entity`, whether a signature is attached at all follows the destination registry's policy unless `sign` says otherwise, and a registry that requires signatures refuses an unsigned publication whatever you send: there is no argument that bypasses that refusal. See [`aggrega sign`](aggrega-sign.md) for the two signing modes and what each contacts.

Each result carries the facts rather than a transcript: where the artifact landed, its tag, the published digest, whether the tag already pointed at byte-identical content, whether a publication was signed, and its `reach`. A signing batch reports every reference signed with the digest its signature commits to, and a batch in which any reference failed comes back as a failure naming each one rather than as a result with a short list — a partial batch reported as a success is how a refusal comes to be read as a pass. A deprecation reports each marker with its own digest, since a marker is attached as an untagged referrer of the artifact it withdraws and nothing else addresses it. Signing or withdrawing a reference nothing published is refused rather than attached to nothing.

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
