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

  The tools an assistant sees by default are shaped for the authoring loop: `scaffold` a schema-correct skeleton for a kind, `get-schema` for an entity's JSON Schema, `validate` a draft, `describe` a catalog entity, `build` a Release into its rendered artifacts entirely in memory (a preview that writes nothing to disk), `gen-catalog` to generate Plugin entities from Wasm guests, and `explain-error` to expand a compiler diagnostic into actionable guidance.

  Behind those sits the rest of the command line, one tool per command, surfaced on demand rather than up front — `lint`, and a tool for each command you could otherwise type, named after its invocation path. An assistant asks for them with `describe-capabilities`, which returns each tool's name, description and argument schema, and can narrow the set to a single entity kind. Keeping them out of the default list holds down the definitions a client loads before it has done anything; each is then called by name like any other tool. Arguments are named after the command's own flags, so `--output-dir` is sent as `output_dir`, and an unrecognised name is refused with the accepted spellings listed rather than being quietly dropped.

  A few commands are deliberately absent, each for a stated reason: the daemon and this server itself would never return a result; a command that reads a password from the terminal has nothing to read it from; one that writes a shell completion script has no shell to install it into; and acquiring an identity token interactively has no non-interactive form to offer. Commands that sign or publish are present and work from a token supplied in the environment — where the command line would open a browser, the tool refuses and names what to supply instead, rather than waiting on a person who is not there.

Everything the server reads is served offline — the JSON Schemas are built into the binary and the documentation is read from the local documentation-bundle cache. Authoring never reaches the network: scaffolding, validating, describing, building and linting all run against your workspace and the local caches.

The one exception is acquiring the documentation bundle itself, and it happens away from every read. The server pulls the bundle once per session, while the client is connecting, through the same egress settings the rest of the CLI uses — so the pages are already cached by the time anything asks for one. Serving a page is then a local read that cannot reach the network at all. If the bundle cannot be acquired the server still starts and every other surface works; documentation requests answer not-found, and the server's log stream says why.

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
