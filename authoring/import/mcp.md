# Import an MCP client configuration

This walkthrough imports the Model Context Protocol servers a coding assistant
is configured with — two it starts from a command line and one someone else
runs — reviews what the import drafts, and builds the servers for Kubernetes,
so an agent running in a cluster can reach the same tools. Every file and every
block of output below comes from a real run; the configuration and each stage
of the walkthrough are in the
[import-mcp](../../language-reference/examples/import-mcp/README.md) example,
where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## The configuration

Claude Code's `.mcp.json`, in the root of a project:

<!-- quotes: source/.mcp.json -->
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    "docs-search": {
      "type": "http",
      "url": "https://mcp.example.com/docs/mcp",
      "headers": {
        "Authorization": "Bearer ${DOCS_API_KEY}"
      }
    }
  }
}
```

The import reads Claude Desktop's `claude_desktop_config.json`, Cursor's
`.cursor/mcp.json`, Visual Studio Code's `.vscode/mcp.json` and an MCP registry
`server.json` the same way. Beside the configuration, an `.aggrega-config.yaml`
makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside .mcp.json.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

`--target` drafts a Manifest from the catalog's Recipes, so name a checkout of
the standard-library catalog ([where to get one](README.md#how-an-import-runs)), by its absolute
path:

```bash
export AGGREGA_CATALOG_DIRS=/path/to/aggrega-catalog
```

## Run the import

<!-- quotes: import-command -->
```bash
aggrega import .mcp.json --target helm
```

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
wrote aggregate.yaml
wrote release.yaml
wrote manifest.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

<!-- quotes: draft/import.txt -->
```text
[… omitted: a warning that the importer runs unverified, printed where its module is read from beside its Plugin entity in a catalog folder rather than fetched]
read as the mcp format, with drafted paths relative to <workspace>
warn: the value of infra.stdio_command.0 of node github is carried as written in the Release the draft writes: the field belongs to an MCP server's configuration, which can carry a key, and setting empty_credentials to marked or all writes it empty
warn: the value of infra.stdio_command.1 of node github is carried as written in the Release the draft writes: the field belongs to an MCP server's configuration, which can carry a key, and setting empty_credentials to marked or all writes it empty
warn: the value of infra.stdio_command.2 of node github is carried as written in the Release the draft writes: the field belongs to an MCP server's configuration, which can carry a key, and setting empty_credentials to marked or all writes it empty
warn: the value of infra.stdio_command.0 of node fetch is carried as written in the Release the draft writes: the field belongs to an MCP server's configuration, which can carry a key, and setting empty_credentials to marked or all writes it empty
warn: the value of infra.stdio_command.1 of node fetch is carried as written in the Release the draft writes: the field belongs to an MCP server's configuration, which can carry a key, and setting empty_credentials to marked or all writes it empty
warn: the value of headers.Authorization of node docs-search is carried as written in the Release the draft writes: the field belongs to an MCP server's configuration, which can carry a key, and setting empty_credentials to marked or all writes it empty
warn: the value of infra.endpoint of node docs-search is carried as written in the Release the draft writes: the field belongs to an MCP server's configuration, which can carry a key, and setting empty_credentials to marked or all writes it empty
warn: the drafted Manifest leaves the component type "core/ai-tool/mcp" unmapped: the workspace's catalog holds more than one Recipe binding to the target "helm" that implements it ("helm/mcp-remote", "helm/mcp-stdio-bridge", "helm/mcp"), and the import does not choose between them, so a build of the drafts halts naming each instance of it until the one wanted is mapped
```

Every server is an instance of the standard library's MCP tool,
`core/ai-tool/mcp`, so the import weighs no candidate and prints no `mapped`
line. Two kinds of warning remain:

- **The values a server's configuration holds.** No MCP client marks any of
  them as a credential, and any of them can carry one — a key in a command-line
  argument, a token in an address — so the import names each item of a command
  line, each header and each address it carried, by its server and its place,
  never by its value. Read them before you share the draft. The `env` value
  `${GITHUB_TOKEN}` is a variable reference and nothing else, so it holds no
  value of its own and no warning names it.
- **The Manifest.** Three Kubernetes Recipes realize `core/ai-tool/mcp` — one
  for a server published as an image, one for a package run behind a bridge,
  one for a server someone else runs — and which one fits is a property of each
  server, so the import leaves the choice to you.

## What it wrote

`aggregate.yaml` — one instance per server, and nothing that uses them yet:

<!-- quotes: draft/aggregate.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the mcp format.
spec:
  components:
    github:
      type: core/ai-tool/mcp
    fetch:
      type: core/ai-tool/mcp
    docs-search:
      type: core/ai-tool/mcp
```

`release.yaml` — how each server is run or reached, as the configuration states
it:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the mcp format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    # Left for the Release, since the draft does not write it:
    #   - the value of server_env.GITHUB_PERSONAL_ACCESS_TOKEN, which the source reads from ${GITHUB_TOKEN}
    github:
      infra:
        stdio_command:
          - "npx"
          - "-y"
          - "@modelcontextprotocol/server-github"
        stdio_runtime: npm
      features:
        server_env:
          type: core/referenced-secret-set
          infra:
            entries:
              - key: "GITHUB_PERSONAL_ACCESS_TOKEN"
    fetch:
      infra:
        stdio_command:
          - "uvx"
          - "mcp-server-fetch"
        stdio_runtime: pypi
    # The headers the source sends this server, which no infrastructure key of core/ai-tool/mcp takes, since a remote server's credential is held by each consumer, on its connection to the tool:
    #   - Authorization: "Bearer ${DOCS_API_KEY}"
    docs-search:
      infra:
        endpoint: "https://mcp.example.com/docs/mcp"
```

`stdio_runtime` is read off each command: `npx` runs an npm package, `uvx` a
PyPI one. The GitHub server's environment becomes its `server_env` slot, with
the variable's name and no value.

`manifest.yaml` — with the one type left unmapped, nothing to map:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      type: {}
```

`.aggrega-import.json` is the record of what the import wrote, which a later
`aggrega import --sync` reads.

## Review

Validate the draft as it stands:

```bash
aggrega validate --release release.yaml
```

```text
[OPS_ERROR E0215] release.yaml
  document envelope validation failed (Release, at release.yaml); 3:1: metadata.environment: missing required property: environment. correct the document to match its kind's schema
```

With the environment set, the next refusal is the token the draft left without
a value:

```text
  [OPS_ERROR E0168] .spec.components.github.features.server_env.infra.entries[0].value
    authored pillar does not conform to its declared schema (Release imported/flow, at .spec.components.github.features.server_env.infra.entries[0].value, infra pillar does not conform to the Feature schema: missing required property: value (required))
  notice: LINT: Feature "core/referenced-secret-set" at core/referenced-secret-set:1.0.0 declares property "entries" in both values: and infra: pillars (path: entries)
release dependency validation failed: 1 diagnostic(s)
```

The review changes:

- **The environment.** The Release names it: `development`.
- **Where the GitHub token comes from.** `core/referenced-secret-set` writes the
  values it is given into a Secret the build renders, which puts the token in a
  file. The review attaches `core/referenced-secret` to `server_env` instead,
  naming `github-mcp-token`, a Secret the cluster already holds with the data
  key `GITHUB_PERSONAL_ACCESS_TOKEN`. The bridge imports every data key of that
  Secret as a variable of the same name, so the server reads its token as it
  did on your machine, and no rendered file carries it.
- **Which Recipe realizes each server.** The Manifest maps each instance by its
  name: `github` and `fetch`, started from a command line, run behind the stdio
  bridge, `helm/mcp-stdio-bridge`; `docs-search`, which someone else runs, maps
  to `helm/mcp-remote`, which runs nothing and publishes the address. The token's
  Secret maps to `helm/k8s-existing-secret`, which references a Secret rather
  than writing one.
- **The `Authorization` header stays a comment.** A remote server's credential
  is held by whoever calls it, on that caller's own connection to the tool, and
  this workspace has no caller yet. When you wire an agent to `docs-search`,
  the header goes on that connection.

The review leaves `aggregate.yaml` as the import wrote it. The reviewed
`release.yaml`:

<!-- quotes: reviewed/release.yaml -->
```yaml
# The draft release.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # Reviewed: the environment this Release deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the mcp format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    github:
      infra:
        stdio_command:
          - "npx"
          - "-y"
          - "@modelcontextprotocol/server-github"
        stdio_runtime: npm
      # Reviewed: the token is read from a Secret the cluster already holds,
      # github-mcp-token, whose data key GITHUB_PERSONAL_ACCESS_TOKEN becomes
      # the server's variable of that name, so no rendered file carries it.
      features:
        server_env:
          type: core/referenced-secret
          infra:
            origin: github-mcp-token
    fetch:
      infra:
        stdio_command:
          - "uvx"
          - "mcp-server-fetch"
        stdio_runtime: pypi
    # Reviewed: the header stays with whoever calls this server. An agent wired
    # to docs-search presents it on its own connection to the tool.
    # The headers the source sends this server, which no infrastructure key of core/ai-tool/mcp takes, since a remote server's credential is held by each consumer, on its connection to the tool:
    #   - Authorization: "Bearer ${DOCS_API_KEY}"
    docs-search:
      infra:
        endpoint: "https://mcp.example.com/docs/mcp"
```

The reviewed `manifest.yaml`:

<!-- quotes: reviewed/manifest.yaml -->
```yaml
# The draft manifest.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      type: {}
      # Reviewed: one realization per server, by its name. The two started from
      # a command line run behind the stdio bridge; the one someone else runs
      # is published at its address, and nothing runs for it.
      name:
        github: helm/mcp-stdio-bridge
        fetch: helm/mcp-stdio-bridge
        docs-search: helm/mcp-remote
    # Reviewed: the token's Secret is one the cluster already holds.
    features:
      type:
        core/referenced-secret: helm/k8s-existing-secret
```

## Validate and build

```bash
aggrega validate --release release.yaml
aggrega build --release release.yaml --auto-pull
```

The validation prints:

```text
  notice: LINT: Feature "core/referenced-secret" at core/referenced-secret:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

and the build, with `<workspace>` standing for the folder holding the reviewed
files:

```text
Pull complete: release.lock (entities=7, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/referenced-secret" at core/referenced-secret:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 5 files written to <workspace>/dist
```

The `notice` line is advisory: the Feature accepts its `origin` from the
Aggregate's `values` or the Release's `infra`, and the notice reports that one
leaf is declared in both. It changes no verdict.

The build writes, under `dist/helm/`, a Deployment and a Service for each of the
two bridged servers, and one Service for `docs-search`. The GitHub server's
container, in `dist/helm/github-deployment.yaml`, runs the bridge with the
server's command line, and takes its environment from the Secret:

```yaml
      containers:
        - name: main
          image: ghcr.io/supercorp-ai/supergateway:4.1.0@sha256:1938c43538a5308bce07d58028e9de00b7acfecb40b39b059b2f3931800ad910
          args:
            - --stdio
            - '''npx'' ''-y'' ''@modelcontextprotocol/server-github'''
            - --outputTransport
            - streamableHttp
            - --stateful
            - --port
            - "8080"
            - --streamableHttpPath
            - /mcp
            - --healthEndpoint
            - /healthz
          ports:
            - name: http
              containerPort: 8080
          env:
            - name: MCP_TOOL_SIDE_EFFECTS
              value: mutating
            - name: MCP_TOOL_TIMEOUT_SECONDS
              value: "30"
            - name: MCP_TOOL_PORT
              value: "8080"
          envFrom:
            - secretRef:
                name: github-mcp-token
          [… omitted: the container's resources and its readiness probe]
```

`dist/helm/docs-search-service.yaml` runs nothing: it gives the server someone
else runs a name inside the cluster.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: docs-search
  [… omitted: the labels and annotations the build writes on every resource]
spec:
  type: ExternalName
  externalName: mcp.example.com
  ports:
    - port: 443
```

## Run it

Nothing in the build writes the `github-mcp-token` Secret, so create it before
you apply the files. Write your token into
`github-token.env`, as the one line
`GITHUB_PERSONAL_ACCESS_TOKEN=<your token>`, and create the Secret from it.
The cluster holds the token then, so delete the file:

```bash
kubectl create secret generic github-mcp-token --from-env-file=github-token.env
rm github-token.env
```

```text
secret/github-mcp-token created
```

Apply the build, as the run step of
[How an import runs](README.md#how-an-import-runs) explains, and wait for the
two servers:

```bash
kubectl apply -R -f dist/helm/
kubectl wait --for=condition=Available deployment.apps/fetch deployment.apps/github --timeout=5m
```

```text
service/docs-search created
service/fetch-default created
deployment.apps/fetch created
service/github-default created
deployment.apps/github created
deployment.apps/fetch condition met
deployment.apps/github condition met
```

The bridge serves each server over MCP's Streamable HTTP transport, at `/mcp`
on port 8080 of the server's Service: `fetch-default` for the fetch server.
Forward a local port to it, and leave the command running:

```bash
kubectl port-forward svc/fetch-default 8080:8080
```

From another terminal, open a session with the fetch server:

```bash
curl -sS -i http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "run-it", "version": "1.0.0"}}}'
```

```text
HTTP/1.1 200 OK
[… omitted: the x-powered-by, cache-control and connection headers]
content-type: text/event-stream
mcp-session-id: f93d7f93-3873-4574-a065-16c76c5ca345
[… omitted: the x-accel-buffering, date and transfer-encoding headers]

: keepalive

: keepalive

event: message
data: {"jsonrpc":"2.0","id":1,"result":{"capabilities":{"prompts":{"listChanged":false},"resources":{"listChanged":false,"subscribe":false},"tools":{"listChanged":false}},"protocolVersion":"2025-06-18","serverInfo":{"name":"mcp-fetch","version":"2026.11.4"}}}
```

The reply took about half a minute in the run. The bridge starts the server's
command line, `uvx mcp-server-fetch`, for the session: `uvx` downloaded and
installed the server's packages in under ten seconds, and the server answered
about twenty seconds after that. The `: keepalive` lines are comments the
stream sends meanwhile. The bridge runs `--stateful`, so the reply carries the
session's identifier in `mcp-session-id`. Send it with every later request:
first the notice that the client is ready, then the request for the server's
tools:

```bash
curl -sS -i http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Session-Id: <session id>' -H 'MCP-Protocol-Version: 2025-06-18' \
  -d '{"jsonrpc": "2.0", "method": "notifications/initialized"}'
curl -sS http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Session-Id: <session id>' -H 'MCP-Protocol-Version: 2025-06-18' \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}'
```

```text
HTTP/1.1 202 Accepted
[… omitted: the response's other headers]

event: message
data: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"annotations":{"destructiveHint":false,"idempotentHint":true,"openWorldHint":true,"readOnlyHint":true},"description":"Fetches a URL from the internet and optionally extracts its contents as markdown.[… omitted: the rest of the description, and the input schema, whose one required argument is url]","name":"fetch"}]}}
```

The notice is accepted with no reply of its own, and the second request lists
the server's one tool, `fetch`.

Stop the port forward, then remove what you applied and the Secret:

```bash
kubectl delete -R -f dist/helm/
kubectl delete secret github-mcp-token
```
