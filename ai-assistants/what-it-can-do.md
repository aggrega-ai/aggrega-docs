# What your assistant can do with Aggrega

Once your assistant is connected to the Aggrega MCP server, it works with the same `aggrega` binary you would run at a terminal: it reads the schemas and the documentation, drafts and checks your files, builds a Release, and, when you let it, publishes. This page says what that covers, in groups. The server's own answer is the full list, and it is the one to trust: call `describe-capabilities` with no arguments, or ask your assistant to, and it lists every tool the server offers you, each with a one-line purpose, the entity kinds it serves and whether it writes. [Compatibility](../language-reference/compatibility.md#the-command-line-and-the-assistant-tools) states what a release may change in the tools.

## Read the schemas and the documentation

The server serves reference material an assistant reads before it writes YAML: an entity's JSON Schema (`schema://<kind>`), any language-reference page (`langref://<path>`), the authoring guide (`authoring://<topic>`), a catalog entity's authored YAML (`catalog://<kind>/<name>`), and any command's help (`cli://<command>`). The schemas are built into the binary, and the pages come from a copy of the documentation the server keeps in your machine's cache. [What it does](../language-reference/cli/aggrega-mcp.md#what-it-does) lists every family.

## Take a role, or follow a workflow

Authoring prompts frame the assistant as a developer, an architect or an operations author, or focus it on one entity kind, so its suggestions stay inside what that role writes. Workflow prompts lay out the order of calls for a goal that takes several: composing a new Aggregate and its Release, bringing an existing chart, infrastructure module or Compose file into Aggrega, or working out why a build fails. Your client lists them as the server's prompts.

## Find out what a workspace holds

`list-entities` and `list-releases` say what your workspace holds and how much of it, then hand over records a page at a time; `describe` shows one entity or everything a Release reaches; `config-show` reports the configuration in force and where each setting came from. The server also reports the caches, the configured registries and the plugins it resolves. See [Finding out what a workspace holds](../language-reference/cli/aggrega-mcp.md#finding-out-what-a-workspace-holds).

## Draft and check your files

`scaffold` drafts a starter document for an entity kind, carrying the fields the kind requires, or writes one of the documentation's runnable examples into a new directory. `get-schema` returns a kind's JSON Schema, `validate` checks a draft and names every placeholder still in it, `lint` checks catalog publishing conventions, and `explain-error` expands a diagnostic into the fix it calls for. Further tools answer the questions that come up while editing: which Features may attach to a component and what it may connect to, where a new entry belongs in a file, and one bounded edit applied to a document, every byte it does not touch kept as it was. See [Asking what may attach, and what may connect to what](../language-reference/cli/aggrega-mcp.md#asking-what-may-attach-and-what-may-connect-to-what) and [Applying one bounded edit to a document](../language-reference/cli/aggrega-mcp.md#applying-one-bounded-edit-to-a-document).

## Resolve and build a Release

`pull` resolves a Release's dependencies into the cache and writes its lockfile, and `build` renders the Release into its artifacts, in memory by default or into `dist/` at the workspace root when the assistant asks it to write them. A refused build hands back the diagnostics that say what to fix. See [Resolving what a Release depends on](../language-reference/cli/aggrega-mcp.md#resolving-what-a-release-depends-on) and [Building against the content a Release already pins](../language-reference/cli/aggrega-mcp.md#building-against-the-content-a-release-already-pins).

## Bring in a project from another tool

`import` reads a description another tool produced and writes draft Aggrega files into the workspace for you to review. See [Turning a foreign description into draft entities](../language-reference/cli/aggrega-mcp.md#turning-a-foreign-description-into-draft-entities) and [`aggrega import`](../language-reference/cli/aggrega-import.md) for the formats it reads.

## Publish, sign and withdraw

Four tools put an entity or an artifact in a registry, sign what is published there, or withdraw it with a signed marker. What they change reaches everyone who resolves from that registry, and none of it can be taken back from someone who already has it, so these are the tools to think about before you allow them. See [Publishing, signing and withdrawing](../language-reference/cli/aggrega-mcp.md#publishing-signing-and-withdrawing).

## Run any command

For a client that started the server on your own machine, over standard input and output, the server also offers a tool for each command you could type, named after it: `cli-build` runs `aggrega build`, `cli-validate` runs `aggrega validate`, and so on. A server reached over HTTPS offers none of them.

## What it may do without asking you

An assistant connected over standard input and output can call every tool the server offers without asking you, unless your client is set to deny it. Your client is where you allow and deny tools by name. [What an assistant can do without asking you first](../language-reference/cli/aggrega-mcp.md#what-an-assistant-can-do-without-asking-you-first) names the operations that reach beyond your workspace, and [Narrowing what the server announces](../language-reference/cli/aggrega-mcp.md#narrowing-what-the-server-announces) shortens the tool list where your client will not take all of it.
