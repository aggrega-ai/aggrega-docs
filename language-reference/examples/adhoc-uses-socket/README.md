---
example:
  level: start
  products: [core/ai-model/anthropic, core/datastore/mariadb, core/devtool/adminer]
  shows: [connections, guardrails]
---

# A socket nobody declared, delivering real values

This example teaches one line, and both halves of it:

> **A consumer may invent the connection. It may only consume what the producer declares.**

An Aggregate author writes a `uses:` entry on their own component under a socket
name no catalog entity declares. The edge is built and it delivers — the value
reaches the rendered artifact exactly as it would through a declared socket. But
the keys that edge may carry are still the target's to declare: name one the
target does not, and the build halts.

Everything here resolves from the standard-library catalog. The workspace
authors no Component, Feature or Recipe of its own.

## The stack

Three components, and one of them is wired two different ways:

| instance | type | what it is |
|---|---|---|
| `db` | `core/datastore/mariadb` | the database |
| `model` | `core/ai-model/anthropic` | a model endpoint; a reference-form realization, so no compute runs for it |
| `web` | `core/devtool/adminer` | the console, consuming both |

`core/devtool/adminer` declares exactly one socket:

```yaml
  usesSchema:
    databases:
      selector: "component.aggrega.ai/type=stateful-server"
      inject: [env]
```

That is the whole of what its author anticipated. A console fronting a database
is the connection they had in mind; a console carrying a model endpoint in its
environment is not.

## What the Aggregate writes

`aggregate-delivers.yaml` wires both edges from one `uses:` block:

```yaml
    web:
      type: core/devtool/adminer
      uses:
        databases:            # DECLARED — the socket the Component's usesSchema names
          db:
            target: db
            inject:
              env:
                - in: ADMINER_DEFAULT_SERVER
                  from: host

        assistant:            # AD-HOC — declared nowhere
          model:
            target: model
            inject:
              env:
                - in: ASSISTANT_ENDPOINT
                  from: endpoint
                - in: ASSISTANT_MODEL
                  from: model
```

`assistant` appears in no `usesSchema`, on this Component or any other. It is
legal anyway: catalog silence about a socket means the connection was not
anticipated, not that it is forbidden, and the developer owns their own
application's topology.

What the ad-hoc socket gives up is exactly what the missing `usesSchema` entry
would have carried — no `selector`, so nothing constrains which component the
edge may reach and the cross-node type-safety check has nothing to evaluate; no
`inject:` allowlist; no per-edge `valueSchema` or `infraSchema`, so per-edge
`values:` and `infra:` have no contract to be checked against and no declared
defaults to inherit. Per-edge configuration written on such a socket is accepted
and travels unchecked, which is how every socket without a contract for that
pillar behaves — a declared socket that authors no `valueSchema` is in the same
position.

What it does **not** give up is what the edge may carry. `endpoint` and `model`
are both keys `core/ai-model/anthropic` declares in its `provides` pillar.

## Build it

```bash
aggrega build --release release-delivers.yaml --auto-pull
```

The rendered output and the lockfile are generated, not shipped: this example
commits its inputs and regenerates everything else. `--auto-pull` resolves the
lockfile during the build; `aggrega pull --release release-delivers.yaml` once
beforehand does the same thing and lets later builds run with no flag at all.
The catalog entities resolve from `hub.aggrega.ai`, the default registry
`.aggrega-config.yaml` names, so neither the build nor `aggrega inspect` needs
a `--catalog` flag.

## Read the output

`dist/compose/docker-compose.yaml`, the `web` service:

```yaml
  web:
    image: adminer:4
    environment:
      ADMINER_DESIGN: pepa-linha-dark
      ADMINER_DEFAULT_SERVER: db
      ASSISTANT_ENDPOINT: https://api.anthropic.com
      ASSISTANT_MODEL: claude-sonnet-4-5
    [… omitted: the service's ports, provenance labels, networks, depends_on and healthcheck]
```

Four variables, three of them delivered over edges, and **the output does not
record which socket was declared**:

- `ADMINER_DEFAULT_SERVER: db` arrived over `databases`, the declared socket. Its
  value is the database Recipe's `provides.host` — a Compose service name.
- `ASSISTANT_ENDPOINT` and `ASSISTANT_MODEL` arrived over `assistant`, the ad-hoc
  socket, carrying the model Recipe's `provides.endpoint` and `provides.model`.

They sit in one map, in author order, with no marker, no annotation and no
ordering difference between them. That is the point: an ad-hoc socket is a
different thing to *declare*, not a different thing to *deliver*. There is one
delivery path and both edges take it.

`ASSISTANT_ENDPOINT` is also worth reading as an ahead-of-time compilation fact.
The compiler did not contact Anthropic to discover `https://api.anthropic.com`;
the Recipe emitted it as a deterministic pointer string sourced from the model
component's `infra.endpoint`, and the compiler routed that string without
interpreting it. Adminer itself does not read either `ASSISTANT_*` variable — the
developer chose those delivery keys, and the console's container carries them for
whatever reads them there.

The graph the build emits records the distinction even though the rendered
artifact does not: every edge carries a `socket_declaration` field reading
`declared` or `ad-hoc`, so an organisation that wants every connection to go
through a socket its Architects declared expresses that as a governance policy
rather than relying on the compiler to hold an opinion. See
[architecture/11-governance-and-compliance.md](../../../architecture/11-governance-and-compliance.md).

## The control: what the consumer still may not invent

`aggregate-undeclared-key.yaml` is `aggregate-delivers.yaml` with one edit. The
ad-hoc edge asks for a third key:

```yaml
                - in: ASSISTANT_API_KEY
                  from: api_key
```

`core/ai-model/anthropic` declares `endpoint` and `model` in its `provides`
pillar, and nothing else. The build is **expected to fail**:

```bash
aggrega build --release release-negative-undeclared-key.yaml --auto-pull
# [… omitted: a refused: line carrying the message below]
# [DEVELOPER_ERROR E0156] .spec.components.web.uses.assistant.model
#   invalid inject key: the from-key must name a provides key its source publishes
#   (Aggregate adhoc-uses-socket-undeclared-key,
#   at .spec.components.web.uses.assistant.model, "env", "ASSISTANT_API_KEY", "api_key",
#   "core/ai-model/anthropic", "endpoint", "model")
```

The halt is the lesson, and *where* it fires is the part worth noticing: the
offending path names the ad-hoc socket, `uses.assistant`, and stops at the
connection rather than at the delivery entry inside it. The `from:` key is
checked against the target Component's declared `provides` on every edge, and the
socket being ad-hoc changes nothing about that check. An author who may invent a
socket name still may not invent an output key on somebody else's component.

The refusal comes first, then the Aggregate and the path the edge was authored
at, the mechanism and the delivery key the entry was written under, the key at
fault, the component type it was resolved against, and that type's declared keys
in sorted order — so the fix is visible from the message alone. A target
Component that declares no `provides` at all rejects every `from:` reference to
it just the same; there are simply no declared keys to list, so the message ends
after the component type.

## Which one to write

Declaring the socket in the catalog remains the better path, and it is what the
standard-library catalog does. A declared socket carries a `selector` that
constrains which components the edge may reach, an `inject:` allowlist, a
per-edge contract with its own defaults, and a description — a reviewable
statement of an anticipated connection, versioned with the entity that makes it.
An ad-hoc socket carries none of that, and the edge is only as safe as the author
who wrote it.

The ad-hoc form is an escape hatch, for the case this example shows: a connection
the catalog author did not anticipate, needed by one deployment, where waiting on
a catalog change would mean waiting to ship. Reach for it knowing what it costs.

Two costs are worth stating plainly:

- **A misspelled socket name is a legal ad-hoc socket**, not an error. Writing
  `databses` where `databases` was meant produces a green build in which nothing
  flows over the intended socket. The compiler reports a socket name within one
  edit of a declared one as an advisory naming both spellings — see
  [errors/warnings.md](../../errors/warnings.md) "Uses-socket near-miss lint" —
  but it is a warning and never changes the build's verdict.
- **Two surfaces are deliberately not open this way.** A Feature attachment's
  `uses` may only name a socket the attached Feature declares, and a Release's
  per-edge `uses` may only name a socket the consuming Component declares. An
  operator configures and wires within an architecture; they do not author it.
  `release-delivers.yaml` therefore carries `infra:` and nothing about sockets —
  the `assistant` socket is the Aggregate author's, and only theirs.

For the full contract, see
[entities/component.md](../../entities/component.md) "Topology Sockets: `usesSchema`" and
[architecture/07-dependency-resolution.md](../../../architecture/07-dependency-resolution.md).
