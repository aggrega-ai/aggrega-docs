---
example:
  level: authoring
  products: [core/ai-tool/mcp]
  shows: [multi-target, connections, credentials, catalog-authoring]
---

# A tool's address from a Secret — a Model Context Protocol server that reads its key from its address

Some Model Context Protocol servers that someone else runs read their key from
their own address — `https://mcp.example.com/mcp?api_key=<key>` — rather than
from a request header. Such an address cannot be written into the tool the way
an ordinary one is: the tool publishes its address as written, so the key would
reach every file the address reaches.

This workspace holds the address in two parts. The tool, `core/ai-tool/mcp`,
holds the address without the part that carries the key. The agent's connection
to the tool holds the whole address as a secret, and the Release names where it
lives. It builds for Kubernetes and for Docker Compose, and on both no rendered
file carries the key.

The agent is declared in this workspace's own catalog, so the socket that holds
the address is written out here in full. The standard-library agent runtimes
`core/ai-agent/openai-agents-sdk`, `claude-agent-sdk`, `agent-framework`,
`google-adk` and `mastra`, and the platforms `core/ai-agent/flowise` and `n8n`,
declare a `tools` socket with the same two slots. The tool, the two credential
Features and their realizations ship in the standard-library catalog.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `search` | `core/ai-tool/mcp` | a Model Context Protocol server someone else runs, mapped to `mcp-remote`, which runs nothing |
| `agent` | `local/ai-agent/mcp-client` | the agent, wired to `search` through its `tools` socket |

Two Releases share the one Aggregate, each with a Manifest of its own:

| Release | Manifest | target | where the whole address comes from |
|---|---|---|---|
| `release-helm.yaml` | `manifest-helm.yaml` | Kubernetes | a Secret the namespace already holds: `core/referenced-secret` bound to `helm/k8s-existing-secret` |
| `release-compose.yaml` | `manifest-compose.yaml` | Docker Compose | a Compose variable reference: `core/secret-value` bound to `compose/dotenv-secret` |

## Building

```bash
aggrega build --release release-helm.yaml --auto-pull       # → dist/kubernetes/
aggrega build --release release-compose.yaml --auto-pull    # → dist/local/
```

Each Release writes to its own directory, so the two rendered trees coexist and
can be compared side by side.

`.aggrega-config.yaml` lists this workspace's own `catalog/`, which holds the
agent and its two Recipes; everything else resolves from `hub.aggrega.ai`, the
default registry it names. With a checkout of the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs)) named with `--catalog`, every entity resolves from those two directories, so
the build also completes with `--offline`, which refuses every network reach.
`--auto-pull` writes each Release's lockfile during the build; lockfiles and
the rendered output are generated, not shipped.

The Kubernetes build prints, with `<workspace>` standing for this example's
folder:

```text
Pull complete: release-helm.lock (entities=11, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/referenced-secret" at core/referenced-secret:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 2 files written to <workspace>/dist
```

The compose build prints the same lines for `release-compose.yaml`, its notice
naming `core/secret-value`, and writes one file. The `notice:` line is about the
credential Feature the Release attaches: it accepts the secret's locator,
`origin`, from the developer's `values` or the operator's `infra`, and the
advisory reports that one leaf is declared in both pillars. It changes no verdict
and no rendered byte.

## The tool holds the address without its key

From `release-helm.yaml`:

```yaml
search:
  infra:
    endpoint: https://mcp.example.com/mcp
```

`helm/mcp-remote` reads the host, the port and the scheme it publishes from that
address, and emits one file for the tool: an `ExternalName` Service mapping an
in-cluster name onto the host. The whole `spec` of
`dist/kubernetes/helm/search-service.yaml`:

```yaml
spec:
  type: ExternalName
  externalName: mcp.example.com
  ports:
    - port: 443
```

So the address the tool holds needs at least a scheme and a host, and holds
nothing of the part that carries the key. `compose/mcp-remote` defines no service
for the tool at all.

## The agent's connection holds the whole address

The agent's Component declares two secret slots on its `tools` socket. From
`catalog/component/local/ai-agent/mcp-client/1.0.0/component.yaml`, descriptions
left out:

```yaml
tools:
  selector: "component.aggrega.ai/category=ai-tool, tool.aggrega.ai/transport=http"
  valueSchema:
    unauthenticated:
      type: boolean
      default: false
  featuresSchema:
    credential:
      selector: "feature.aggrega.ai/kind=secret"
      sensitive: true
      inject: [env]
    endpoint:
      selector: "feature.aggrega.ai/kind=secret"
      sensitive: true
      inject: [env]
```

`credential` holds a key the agent presents in a request header; `endpoint` holds
the whole address, for a server that reads its key from the address itself.
`unauthenticated` is the connection's own statement that its tool takes no
credential, and changes nothing the agent renders. All three sit on the
connection, so an agent reaching several servers holds each server's secret on
that server's connection.

The Release fills `endpoint` on the connection the Aggregate wired. From
`release-helm.yaml`:

```yaml
agent:
  uses:
    tools:
      search:
        features:
          endpoint:
            type: core/referenced-secret
            infra:
              origin: search-mcp-address
```

A Release writes no `values`, so `origin` is in `infra`, and the data key read
from the Secret is the Feature's default, `value`. The Manifest binds
`core/referenced-secret` to `helm/k8s-existing-secret`, which reads `origin` as
the name of a Secret the namespace already holds and renders nothing. The Secret
is created outside the Release, by whoever deploys it:

```bash
kubectl -n agents create secret generic search-mcp-address \
  --from-literal=value='https://mcp.example.com/mcp?api_key=<key>'
```

The agent's container reads the address from it. The `env` of
`dist/kubernetes/helm/agent-deployment.yaml`:

```yaml
env:
  - name: MCP_URL_SEARCH
    valueFrom:
      secretKeyRef:
        name: search-mcp-address
        key: value
  - name: MCP_HOST_SEARCH
    value: mcp.example.com
```

`MCP_URL_SEARCH` is the whole address, read from the Secret by name and data key;
`MCP_HOST_SEARCH` is the host the tool publishes. `dist/kubernetes/helm/` holds
the agent's Deployment and the tool's Service and nothing else: no Secret is
rendered, and no file carries the key.

### On Docker Compose

Compose has no secret reference, so the compose Release fills the same slot with
`core/secret-value`, its origin a Compose variable reference. From
`release-compose.yaml`:

```yaml
agent:
  uses:
    tools:
      search:
        features:
          endpoint:
            type: core/secret-value
            infra:
              origin: "${SEARCH_MCP_URL}"
```

`compose/dotenv-secret` delivers the reference as written, and the agent's
service carries it. The `environment` of the `agent` service in
`dist/local/compose/docker-compose.yaml`, which defines that service and no
other:

```yaml
environment:
  MCP_HOST_SEARCH: mcp.example.com
  MCP_URL_SEARCH: ${SEARCH_MCP_URL}
```

Docker Compose substitutes `SEARCH_MCP_URL` when the stack starts — from the
shell environment, a file named with `--env-file`, or the `.env` file in the
project directory — so the file carries the reference alone.

## How the agent's Recipes read the slot

Each connection on the `tools` socket becomes environment variables named for the
connection's alias in capitals: `MCP_HOST_<ALIAS>` from the host the tool
publishes, and `MCP_URL_<ALIAS>` from the address the tool publishes — unless the
connection carries an `endpoint` secret, in which case `MCP_URL_<ALIAS>` is that
secret and the published address is not delivered at all. A connection carrying a
`credential` adds `MCP_CREDENTIAL_<ALIAS>`, and `MCP_CREDENTIAL_HEADER_<ALIAS>`,
the request header the tool publishes for presenting it under.

- **On Kubernetes** the secret is an attachment entry naming the connection and
  the slot — `connection: search`, `from: endpoint`, `as: env` — which the
  provider turns into the `secretKeyRef` above, reading the Secret's name and
  data key from what `helm/k8s-existing-secret` publishes.
- **On Docker Compose** the secret arrives on the agent's inject pipe under the
  key its own attachment delivered it under, `values.key`, and the Recipe writes
  that value into the service's environment.

Written into the tool's `infra.endpoint` instead, the key goes wherever the
published address goes: the agent's `MCP_URL_SEARCH` carries it as a literal
value, in the Deployment on Kubernetes and in the service's environment in the
Compose file, because the reference realization publishes the address as
written.

## Limits

- **On Docker Compose, two secrets the Release alone attaches to one agent
  collide.** Each `core/secret-value` attachment a Release makes delivers under
  the Feature's default key, `value`, so a second one on the same agent —
  another server's address, or a credential beside this one — halts the build. A
  Release attaching both an `endpoint` and a `credential` to `search` prints:

  ```text
  [… omitted: what resolving the lockfile prints, the same halt among it, and the notice about core/secret-value]
  [OPS_ERROR E0318] release-compose.yaml at .spec.boundaries.main.components.agent.uses.tools.search.features.credential
    duplicate delivery key across two attachments: an attachment's FeatureRecipe writes a delivery key another attachment already delivered ("value", mechanism "env", attachment "search.credential", delivered first by attachment "search.endpoint"). Give one of the two attachments a key of its own, or attach one fewer: the key this attachment delivers under is chosen by its FeatureRecipe, which can read the attachment's own values and infra, and the other's is chosen the same way or by its own inject block where it delivered through one. A Release sets an attachment's infra and never its values, so where a key is chosen by a value, attach that attachment in the Aggregate with the value, and keep giving the rest from the Release.
  ```

  The key is a `values` leaf, which only the Aggregate writes, so an Aggregate
  that declares one of the two attachments and names its `values.key` avoids it:
  the agent's compose Recipe reads each secret under the key its own attachment
  names. Kubernetes has no such limit, because each secret there is a reference
  to a Secret by name and data key rather than a value delivered under a key.
- **A key in the address's path.** Where the server reads its key from the path
  rather than the query string, the tool's address is the address with that part
  of the path removed, and the Secret holds the whole of it.
- **The host is written twice**, plainly in the tool's address and inside the
  Secret, and nothing checks that the two agree, because the compiler never reads
  a Secret.

Assembling the address at run time from the key alone, with a `$(VAR)`
reference in a plain variable, works on Kubernetes only: Kubernetes expands
such a reference from the entries listed before it in the container, and the
helm provider lists the entries it reads from a Secret before the plain
variables, while Docker Compose expands no `$(VAR)` reference between a
service's environment entries.

## Adapting it

- **A server that also checks a header.** Attach `credential` on the same
  connection. The agent receives `MCP_CREDENTIAL_SEARCH` and the header to
  present it under, `MCP_CREDENTIAL_HEADER_SEARCH`: `Authorization`, unless the
  Release names the server's own header in the tool's `infra.credential_header`.
  On Docker Compose, name the key of one of the two in the Aggregate, as above.
- **Several servers.** Wire one connection per server on the `tools` socket.
  Each connection's variables carry its alias, and each connection holds its own
  secrets.
- **A server that reads its key from a header only.** Leave `endpoint` off, and
  `MCP_URL_<ALIAS>` is the address the tool publishes.

## Determinism

Both Releases build under `--verify-determinism`, which renders every node twice
and compares the emitted bytes:

```bash
aggrega build --release release-helm.yaml --verify-determinism
```

Rebuilding either from a clean tree reproduces its rendered output byte for byte.

## Files

- `aggregate.yaml` — the tool and the agent, wired through the `tools` socket,
  with no secret attached.
- `manifest-helm.yaml`, `manifest-compose.yaml` — the tool to `mcp-remote`, the
  agent to its own Recipe, and the credential Feature each target uses.
- `release-helm.yaml`, `release-compose.yaml` — the tool's address without its
  key, the agent's image, and the `endpoint` secret on the agent's connection.
- `catalog/component/local/ai-agent/mcp-client/1.0.0/component.yaml` — the
  agent: its `tools` socket with the `credential` and `endpoint` slots.
- `catalog/recipe/helm/mcp-client/1.0.0/recipe.yaml`,
  `catalog/recipe/compose/mcp-client/1.0.0/recipe.yaml` — the agent on each
  target.
- `.aggrega-config.yaml` — the catalog search stack and the registry.
- `build-release.sh` — builds one Release, echoing the equivalent `aggrega build`
  command.

For a key the agent presents in a header, held on the connection it is presented
on, see [connection-credentials](../connection-credentials/). The model behind
both is the [Credential Model](../../../architecture/08-credential-model.md), and
the tool's realizations are described with the tool transport label in
[AI Features](../../../architecture/09-ai-features.md).
