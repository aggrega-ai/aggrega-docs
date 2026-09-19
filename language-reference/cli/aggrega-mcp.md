# aggrega mcp

Run a Model Context Protocol server over standard input and output, or over HTTP, for AI-assistant integration

<!-- BEGIN GENERATED: cli-mcp -->
**Synopsis**

```
aggrega mcp [flags]
```

**Description**

```
Run Aggrega as a Model Context Protocol (MCP) server, so an AI
assistant can discover and drive Aggrega operations through a structured
protocol instead of scraping command output.

Two transports reach the same server, and the invocation chooses between
them. With no listen address the server speaks newline-delimited JSON-RPC
2.0 over the process's standard input and output, which is how an
MCP-capable client runs it: spawned as a subprocess, not typed by hand.
Given --listen, or mcp.listen in the workspace configuration, it serves
the protocol over HTTP instead — one long-running process on a host,
reached by callers who are not at its keyboard.

It speaks two MCP protocol revisions on both transports, 2026-07-28 and
2025-06-18, so a client of either connects. In 2026-07-28 nothing is
settled for the connection as a whole: every request states the protocol
version it speaks and the capabilities its sender offers, and the server
reads both from the request it is answering rather than holding anything
between messages. In 2025-06-18 a client settles those same facts once,
by opening the connection with an initialize handshake.

Both revisions reach the same server, and a client learns the same
things about it either way. A client on 2026-07-28 calls server/discover
for the revisions the server speaks, the capabilities it advertises —
tools, resources, and prompts — and the guidance it offers a model
before the first call. A client on 2025-06-18 receives those same
capabilities, and that same guidance, in the reply to its handshake.

From there the client discovers the server's surface through the list
methods (tools, resources, resource templates, and prompts) and invokes
it through tools/call and resources/read. The server exposes Aggrega
operations — compiling and inspecting a Release, reading catalog
entities — as tools and resources an assistant can call directly.

On standard input and output, stream discipline is strict: stdout carries
only protocol messages, one JSON object per line, so the client can parse
the stream without heuristics. Every log, warning, and diagnostic is
written to stderr instead. The server reads one message per line and
exits cleanly when stdin reaches end of stream, so a client that closes
the connection shuts the server down. A client ends one call by naming
its id, and every other call carries on.

Over HTTP there is one endpoint, /mcp, accepting POST. Every message is
its own request and no session of any kind is kept, so nothing a client
sends first decides how a later request is answered. Closing the
connection ends the call it carried. A request carrying an Origin header
is checked against mcp.allowed_origins, and mcp.limits bounds how large
one request body may be, how many requests are answered at once, and how
many one caller may send in a minute. A caller sending faster than
mcp.limits.requests_per_minute is answered 429, counted against that
caller alone.

Every request to /mcp carries a credential, and which one depends on
whether a proxy in front has already checked it. By default it is a
bearer token the server verifies itself, against the keys
mcp.authorization.issuer publishes: it must come from that issuer, name
mcp.authorization.resource among its audiences, be inside its validity
window, and be signed with an asymmetric algorithm. A request carrying no
token is answered 401 with a challenge, and so is one whose token fails
any of those. A token is never accepted from the address, never forwarded
anywhere, never exchanged, and never written to any log; the subject it
names is recorded and compared to nothing.

Set mcp.authorization.trusted_proxy instead and the caller is read from a
header the proxy sets rather than from a token, with its scopes from a
second header; no token is read at all in that mode, and a request
without the principal header is answered 401. Because that header is then
the whole credential, it is trustworthy only where nothing else can set
it: the process is refused before it binds unless mcp.listen is loopback
or a Unix socket.

The challenge names where to obtain a token. A listener publishes an
OAuth protected-resource metadata document, with no credential asked for,
naming the authorization server, this deployment's own address and the
scopes that exist; it is served at /.well-known/oauth-protected-resource
and at that path followed by the endpoint path, which are the two places
a client looks. A client reads it before it can hold a token, which is
why it is the one answer given without one. What that document publishes
comes from mcp.authorization.issuer and mcp.authorization.resource, and a
listener is refused before it binds unless both are set.

The verification keys are read from the issuer itself, by asking it where
it publishes them and fetching them from the address it names, and read
again once when a token arrives signed by a key identifier the held set
does not carry. A workspace that is offline makes no such request, so
there mcp.authorization.jwks_file names a file holding those keys and a
listener is refused before it binds without it.

Liveness and readiness are answered on a second address, and only there.
Set mcp.health.listen and a GET of /healthz reports that the process is
running while a GET of /readyz reports whether it can answer a call yet,
each a status code with an empty body and no credential asked for. The
address opens before the workspace is resolved, so a supervisor sees the
process alive while it is still deciding whether it can serve at all.
Leave the key unset and no second listener exists. The endpoint itself
answers both paths the same not-found it gives every path it does not
serve, with a token and without one, so reaching this process over the
network is never a way to probe it.

The workspace this process serves is fixed when it starts, on either
transport: --workspace-root names it, and AGGREGA_WORKSPACE_ROOT supplies
it when the flag is absent. With neither, a server on standard input and
output resolves the workspace from the directory it was started in, while
a listener is refused before it binds unless a workspace resolves there:
one reached over HTTP serves a workspace an operator chose rather than
whichever directory it happened to be started in.

For the same reason a call arriving over HTTP cannot name a workspace of
its own. Sending workspace_root or catalog_dirs is refused, naming the
argument, and the directories searched for catalog entities beside the
served workspace are the ones that workspace itself resolves: its own
workspace.catalog_dirs setting, then its catalog directory. Over
standard input and output both arguments are honoured: the client that
launched the server is running on this machine.

Asking the process itself to stop — an interrupt from the terminal, or a
termination request from a supervisor or container runtime — shuts the
server down on the first request, whether or not a client is sending
anything: it stops accepting messages, ends the work a call in progress
is doing, and exits cleanly. A listener stops accepting and lets a call
already being answered finish, within a bounded budget, before the
process exits. A second request ends the process at once.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--listen` | — | Serve the protocol over HTTP on this address instead of standard input and output, in one of two forms: host:port, or unix: followed by a filesystem path. Without it, and with no mcp.listen in the workspace configuration, the server speaks over standard input and output. A listener with no certificate serves plaintext and is permitted only on loopback (127.0.0.1, ::1, localhost) or on a Unix socket, which is the shape a deployment behind a terminating proxy takes; any other address needs mcp.tls.cert_file and mcp.tls.key_file, which this process then uses to terminate TLS itself. When set, overrides the mcp.listen config key. |
<!-- END GENERATED: cli-mcp -->

## What it does

`aggrega mcp` runs a Model Context Protocol server. **Two transports reach it, and the invocation chooses between them.**

With no listen address it speaks over the process's standard input and output. In that shape it is not a command you run interactively — an MCP-capable client (Claude Desktop, Cursor, Windsurf, Cline, or any other) launches it as a subprocess and speaks the protocol over stdio. Running it turns the CLI into an Aggrega-aware authoring assistant inside your editor or chat client.

Given `--listen <address>`, or `mcp.listen` in the workspace configuration, it serves the protocol over HTTP instead: one long-running process on a host, reached by callers who are not at its keyboard. See [Reaching the server over HTTPS](#reaching-the-server-over-https) for how that listener is configured and what it accepts.

**It speaks two revisions of the protocol, `2026-07-28` and `2025-06-18`, so a client of either connects and reaches the same surfaces.** Which one a call speaks is stated on that call rather than agreed once for the connection. A client on `2026-07-28` sends the protocol version it speaks and its own capabilities with every request, and asks `server/discover` what the server supports; a client on `2025-06-18` settles those same things once, by opening the connection with an `initialize` handshake. Either way the server holds nothing between messages, so what you send first decides nothing about how a later call is answered. A request naming a revision the server does not speak is refused and told which two it can ask for, rather than being answered as if it had asked for one of them.

The server exposes three surfaces to the connected assistant:

- **Prompts** — two families, and the difference is what each one answers. *Authoring* prompts answer "what am I writing": one persona per role (developer, architect, operations), plus a focused per-entity template. Each frames the role and points the assistant at the right schema, reference page, and authoring guide, so its suggestions stay inside the pillars that role owns. *Workflow* prompts answer "which calls, in what order": each lays out the ordered sequence of tool calls that reaches a goal spanning several operations, with the decision points between them — starting a deployment, bringing an existing one into Aggrega, working out why one fails or renders the wrong artifacts. `prompts/list` enumerates both families and `prompts/get` renders one, so the set is read from the server rather than from this page.

  A workflow prompt names the calls and you make them, one at a time, reading each result before the next. There is no call that performs a whole goal: each tool wraps one operation you can check, so the sequence is the thing that gets you there. The authoring personas take an optional `kind` to focus on, the per-entity template requires one, and a `kind` no schema answers to is refused with the accepted set listed rather than quietly ignored.
- **Resources** — read-only reference material served inline: `schema://<kind>` for an entity's JSON Schema, `langref://<path>` for any language-reference page, `authoring://<topic>` for the authoring guide, `catalog://<kind>/<name>` for a catalog entity's authored YAML, and `cli://<command>` for a command's own help, with `cli://` alone as its entry point — that help is answered from the commands the server itself carries, so reading one starts no process and returns the same text the command prints for `--help`. `resources/list` enumerates the ones addressable without a parameter and `resources/templates/list` advertises every family's URI shape.
- **Tools** — actions against your workspace, in two tiers.

  The tools an assistant sees by default are shaped for the authoring loop: `list-entities` and `list-releases` to find out what the workspace holds, `scaffold` a schema-correct skeleton for a kind, `get-schema` for an entity's JSON Schema, `validate` a draft, `describe` a catalog entity, `pull` to resolve a Release's dependencies into the local cache and write its lockfile, `build` a Release into its rendered artifacts entirely in memory (no artifact is written to disk, and the dependencies are resolved first only if you send `auto_pull`), `gen-catalog` to generate Plugin entities from Wasm guests, and `explain-error` to expand a compiler diagnostic into actionable guidance — including, where the diagnostic opens with a halting condition's short code, that condition and the published walk-through of the authoring fix, the same expansion [`aggrega explain`](aggrega-explain.md) gives the same code at a terminal.

  Behind those sits everything else, surfaced on demand rather than up front: further tools that run inside the server — `lint`, the two candidacy tools, the attachment-container and insertion-point tools and the four publication tools described below, plus inventories of the caches and the configured registries — and, **for a client that launched this server over its standard input and output**, a tool for each command you could otherwise type, named after its invocation path. Those command tools exist on that transport alone: a server reached over HTTP offers none of them, for the reason given under [Reaching the server over HTTPS](#reaching-the-server-over-https). An assistant asks for what is offered with `describe-capabilities`, which returns each tool's name, description and argument schema, and can narrow the set to a single entity kind. Keeping them out of the default list holds down the definitions a client loads before it has done anything; each is then called by name like any other tool. Arguments are named after the command's own flags, so `--output-dir` is sent as `output_dir`, and an unrecognised name is refused with the accepted spellings listed rather than being quietly dropped.

  Some capabilities sit in both tiers **on standard input and output**: a tool shaped for the authoring loop runs the operation inside the server, and the tool named after the command that carries the same capability runs that command. The two do not behave alike, so on that transport each names the other and states the difference; over HTTP the second tier is absent, and the pairing sentence is withheld rather than pointing at a tool the caller cannot reach. The one that runs inside the server is the one to reach for — it answers with a machine-readable result alongside the readable text, so an assistant gets a verdict, a file list or a diagnostic as fields rather than as a transcript to parse. The command tool starts the real command in a separate process, so it does whatever that command does on the machine it runs on, including writing to disk where the command writes, and hands back only the command line it ran and the text that command printed. Reach for it when you need a flag the command declares that the other tool does not accept.

  A few commands are deliberately absent **even on standard input and output, where the command tier exists at all** — over HTTP every one of them is absent, and that is a property of the transport rather than of any command. On standard input and output, each of these is left out for a stated reason: the daemon and this server itself would never return a result; a command that reads a password from the terminal has nothing to read it from; one that writes a shell completion script has no shell to install it into; removing a stored credential acts on the machine-wide store rather than on any workspace you named; and acquiring an identity token interactively has no non-interactive form to offer. Absent on that same machine-wide ground is `aggrega plugin run-local`, which loads a `.wasm` guest from a path you give it: what the command is *for* is reading a file wherever you put it, so there is no workspace it could be confined to, and the read happens in the process itself before the guest exists. The guest is granted nothing when it does run — no directories, no sockets, no environment — but that is a limit on the module rather than on the read, so it is not what decides this. Run it at your terminal, where you are the one naming the path. **Signing and publishing are a different case entirely, and the difference is what keeps them off that list.** Each of them resolves an identity from a supplied or ambient input and refuses out loud when none is available, so each has a form that completes with nobody watching — whereas acquiring a token interactively is a verb no input can satisfy even in principle. So they are present, in both tiers: as the commands, and as the four in-process tools described under [Publishing, signing and withdrawing](#publishing-signing-and-withdrawing). Where the command line would open a browser, they refuse and name what to supply instead, rather than waiting on a person who is not there.

## Reaching the server over HTTPS

`aggrega mcp --listen <address>` serves the protocol over HTTP instead of over standard input and output. `mcp.listen` in the workspace configuration is the key that flag overrides; with neither, the command speaks over standard input and output exactly as a client that spawns it expects. It is the same server either way — the same workspace and the same protocol surfaces — and what changes is how a message reaches it, how a call ends, and what the deployment has to hold. This section is what an operator configures; the entry a client needs in order to reach a running one is in [Setup](../../authoring/setup.md#a-server-reached-over-https).

**A server reached over HTTP offers no tool that runs an `aggrega` command in a separate process.** Those tools exist only for a client that launched this server over its standard input and output, on that client's own machine, where naming a folder or a flag grants the caller nothing they did not already have. A caller reaching the server over HTTP does not own the host it runs on, so a command that would act on that host's filesystem with the server's own authority is run at a terminal on the host instead. The tools are absent from the list and from `describe-capabilities` rather than being offered and refused, and a call naming one is answered with an error saying so. That is a property of the transport, not a setting: there is no configuration that puts them back.

**Read [Nothing is served without a credential](#nothing-is-served-without-a-credential) before you deploy one.** Every request to the endpoint carries a credential, and there is no setting that serves a request without one — what a setting chooses is whether this server checks a bearer token itself or reads a caller a proxy in front has already checked.

### The two deployment shapes

**The process terminates TLS itself.** Set `mcp.tls.cert_file` to a PEM certificate chain and `mcp.tls.key_file` to its private key, and the listener serves HTTPS directly on whatever address you gave it. Both files are read when the process starts, so a replaced certificate is picked up by restarting the process. Setting one without the other is refused at startup rather than falling back: a certificate with no key cannot be presented and a key with no certificate names nothing, and a typo in one path is not a reason to start serving unencrypted traffic.

**A proxy in front terminates TLS and forwards to a confined listener.** Leave both keys unset and the listener serves plaintext, which is accepted only on loopback or on a Unix socket — so nothing that is not already on that host can reach it. That is the shape a reverse proxy, a sidecar, or a service mesh uses, and it is the one where the certificate lives in front of this process rather than in it.

**A plaintext listener on any other address is refused before anything binds**, and the refusal names both TLS keys. There is no setting that lifts this and no address that is an exception: a listener accepting from the network with no certificate of its own is never safe, so the process declines to start rather than starting in that shape.

### The address forms

`--listen` and `mcp.listen` take one of two forms:

- **`host:port`** — a TCP address, such as `127.0.0.1:7777` or `0.0.0.0:8443`. Loopback means `127.0.0.1`, `::1`, or `localhost` when every address that name resolves to is a loopback address. Anything else is a network address and needs a certificate: an empty host, which is every interface the machine has; a specific interface address; and any other name, even one that resolves to a loopback address at this moment, because where a listener may bind should not depend on a resolution that can change under it.
- **`unix:` followed by a filesystem path** — a Unix-domain socket, such as `unix:/run/aggrega/mcp.sock`. A socket is reachable only from the host it sits on, so it needs no certificate.

A socket path is taken exactly as written, a relative one included. It is deliberately not resolved against the configuration file that declared it, because the same address also arrives from `--listen`, which has no declaring file — see [where a relative path points](configuration.md#where-a-relative-path-points).

### What the listener accepts

**One endpoint, `/mcp`, accepting `POST`.** Every JSON-RPC message is its own request and **no session of any kind is kept**: nothing a client sends first decides how a later request is answered, no session identifier is ever minted, and a session or stream-resumption header a client sends is ignored. Any other method on that endpoint is answered `405` with `Allow: POST`, and any other path `404` — both settled before the credential check, so probing learns nothing from a challenge on a path or a method that would serve nothing anyway.

A request is answered with one JSON object and a status code — or, where the call reported progress on its way to that object, with a stream of events ending in it, which [Being told how a long call is going](#being-told-how-a-long-call-is-going) sets out. A notification — a message carrying no id — is answered `202` with an empty body. A message that is neither, including a JSON-RPC response, is answered `400`, because a client sends this server requests and notifications and nothing else.

**Both protocol revisions are served here exactly as they are over standard input and output.** A `2026-07-28` request mirrors its body in transport headers so an intermediary can route it without parsing the body: `MCP-Protocol-Version` carries the revision the body states, `Mcp-Method` the method it names, and `Mcp-Name` the target, for the methods that address one by name. A header that disagrees with the body is answered `400`. A `2025-06-18` client opens with an `initialize` handshake, which is answered statelessly; it may carry the version header naming that revision or omit it. A request naming a revision the server does not speak is answered `400` listing the two it does, and one naming a method it does not serve is answered `404`.

**`mcp.allowed_origins` is consulted only when a request carries an `Origin` header**, which in practice means a browser sent it: a request naming an origin the list does not carry is answered `403`, and one carrying no such header is served. A client that is not a browser sends no such header and needs no entry. A browser-based one always needs an entry: the list is empty until an operator writes it, so until then no origin at all is carried and every browser request is answered `403` — including one from a page served at the endpoint's own address.

**`mcp.limits` bounds the traffic that is accepted.** A body past `max_body_bytes` is answered `413` and is not read past the cap. A request arriving while `max_concurrent_requests` are already in flight is answered `503` rather than being queued behind work it cannot see. A caller sending more than `requests_per_minute` inside a minute is answered `429`, counted against that caller alone, so one caller sending hard does not cost another anything. Each cap's default is stated beside its key in [the configuration reference](../schema/other/aggrega-config.md), and none of them has a value that turns it off.

### One process, one workspace

**The workspace a serving process answers for is fixed when it starts.** `--workspace-root` names it; the `AGGREGA_WORKSPACE_ROOT` variable supplies it when the flag is absent. With neither, a server on standard input and output resolves the workspace from the directory it was started in, and a listener is refused before it binds unless a workspace resolves there — a process reached over HTTP answers callers who cannot see the machine, so it serves a workspace an operator chose rather than whichever directory it happened to be started in. Serve several projects by running one process per project root.

**A call arriving over HTTP cannot name a workspace of its own.** `workspace_root` and `catalog_dirs` are refused, naming the argument that was sent, rather than being quietly dropped: an argument silently ignored reads to its sender exactly like one that was honoured. Catalog directories searched beside the served workspace are that workspace's own `workspace.catalog_dirs` setting, which the operator writes. Over standard input and output both arguments are honoured as before, because the client that launched the server is running on the caller's own machine.

**A path a call names stays inside that workspace too.** Over HTTP a path argument is resolved against the workspace root and refused if it reaches outside it — a relative path that climbs out of the workspace, and an absolute path naming somewhere else, each come back as a failure naming the workspace this process serves. Where the path you meant is inside that workspace but was spelled absolutely, the refusal gives you the root-relative spelling to send instead, so a caller that guessed the wrong form is told the right one rather than only that it was wrong. That holds for the paths a call names as its subject — the document to validate, the Release to build, the directory a generation writes its output into — and for the ones a tool writes to no less than the ones it reads: a caller reaching a server over the network is asking a machine it cannot see to read and write files, and the workspace the operator chose is where that reading and writing is kept. Over standard input and output each tool's path arguments keep the contract described under that tool below, where a path may be absolute and may point outside the workspace — the person calling owns the machine the server is running on, so confining them to a directory they chose themselves would buy nothing.

### How a call ends

**Closing the connection cancels the call it carried.** That is this transport's cancellation signal: the server treats a caller's disconnect as cancellation of that request, ends the work it was doing, and writes nothing further for it. No cancellation message is needed or expected here — which is the opposite of standard input and output, where there is no per-request stream to close and a client ends one call by naming its id instead. A cancellation message that does arrive over HTTP is accepted and ends nothing.

**Stopping the process drains the listener.** An interrupt, or a termination request from a supervisor or a container runtime, stops the listener accepting and lets a call already being answered finish, within a bounded budget, so a caller that asked for something before the stop still receives its answer. A call that has not finished inside that budget loses its connection. A second stop request ends the process at once.

### Liveness and readiness, on an address of their own

**`mcp.health.listen` is where a supervisor asks whether this process is up and whether it can answer a call.** Give it an address in either of the forms above and a second listener answers `GET /healthz` and `GET /readyz` there. Leave it out — which is the default — and no second listener is started and neither check is answered anywhere.

**The two answers say different things, and that difference is why there are two.** `/healthz` is answered `200` from the moment the process is running, which is the whole of what liveness claims: it is up, and a supervisor that gets no answer at all should restart it. `/readyz` is answered `503` until the workspace this process serves has resolved and the endpoint has bound, and `200` from then on — so a balancer holds traffic back until the process can actually answer a call, rather than sending the first request into one that is still starting. Every answer is a status code with an empty body; no credential is asked for, and nothing the caller sent is read.

**The endpoint never answers those two paths.** `GET /healthz` and `GET /readyz` on the address `mcp.listen` names are answered `404`, exactly as every other path that endpoint does not serve, with a token and without one alike. Answering a probe there would hand anything that reaches the endpoint a free reading of whether the process is up, together with a free way to make it do work — on a listener that otherwise refuses every request carrying no credential.

**Where the health address sits is yours to choose, and it is not confined the way `mcp.listen` is.** No address is refused for it. Point it at loopback or at a Unix socket, which is what it is for: a supervisor, a balancer or a container runtime running beside this process on the same host. Whatever can reach the address you choose can read those two answers, so an address the open network reaches publishes them to the open network.

### Nothing is served without a credential

**Every request to the endpoint carries a credential, and which one depends on whether a proxy in front has already checked it.** By default it is a bearer token this server verifies itself, described in the rest of this section. Set `mcp.authorization.trusted_proxy` and it is instead a header that proxy sets, described under [Reading the caller from a proxy in front](#reading-the-caller-from-a-proxy-in-front) — where no token is read at all. Neither shape serves a request that presents nothing.

**By default the server checks a bearer token itself.** It reads the token off the `Authorization` header and accepts it only where the signature verifies against a key the authorization server publishes, the token names `mcp.authorization.issuer` as its issuer, it names this deployment's own `mcp.authorization.resource` among its audiences, it is inside its validity window, and it says who presented it. A token failing any of those is answered `401`, with `error="invalid_token"` added to the same challenge a caller carrying nothing receives — and the answer is identical whichever check turned it away, so a caller learns that it needs a different token rather than which part of the one it sent was wrong. Only asymmetric signature algorithms are accepted: an unsigned token, and one naming a symmetric algorithm, are refused before anything is read from it.

**A token may say what kind of token it is, and four forms are accepted.** A JWT can carry a `typ` header naming its own type. This server accepts `at+jwt` and `application/at+jwt`, the two spellings registered for an access token; `JWT`, which says only that the token is a JWT; and a token that declares no type at all. Anything else is answered `401` exactly as every other refused token is. The set is fixed and no setting widens or narrows it, because which form appears there is decided by the authorization server that minted the token rather than by the deployment receiving it. Accepting `JWT` does mean the declared type alone no longer tells an access token from an identity token — the audience check is what tells them apart, and it is why that check is the load-bearing one: an identity token's audience is the client it was issued to, never this deployment's own `mcp.authorization.resource`, so a token issued for anything but this deployment is refused whatever it calls itself.

**Which authorization servers that admits.** Microsoft Entra ID issues access tokens typed `JWT`. Keycloak issues `at+jwt`, and `JWT` where its OpenID Connect compatibility mode is on. Auth0 issues `JWT` under its own token profile and `at+jwt` under its RFC 9068 profile. A token from any of those satisfies this check whichever of the two forms it carries. **Okta is not supported**: its access tokens declare a type of their own that is none of the four above, so this server refuses them.

**A refused token leaves the reason on the server's own error stream.** The caller is told only that what it presented was not accepted; the serving process writes one line naming the check that turned the token away — the audience, the issuer, the validity window, the signature, the key identifier, the declared type, and each of the others. That line is how a deployment refusing every request is diagnosable by whoever runs it rather than only by whoever is calling it. It carries no part of the token. A request presenting no credential at all writes no line, because being challenged is how a client finds out where to obtain a token in the first place, so it is the first thing every well-behaved client does.

**A token belongs on the header and nowhere else.** One sent as an `access_token` query parameter is answered `400` and is never read, because an address is recorded by every proxy log, browser history and referrer header the request passes through, so a token that arrived that way has already been exposed. The server never writes a token to a log, never sends one anywhere, and never obtains or exchanges one on a caller's behalf: it reads what was presented, decides, and keeps none of it. The subject the token names is recorded and compared to nothing.

**The verification keys come from the authorization server, or from a file you name.** With `mcp.authorization.jwks_file` unset, the server reads the authorization server's metadata at its well-known address, follows the `jwks_uri` published there, and holds the keys it finds; a token signed by a key identifier those keys do not carry prompts one re-read, and no more than one inside a short interval, so a caller sending invented key identifiers cannot drive an outbound request per request. With `jwks_file` set, the keys are read from that file and the authorization server is never contacted — which is what a workspace declaring `offline: true` needs, and such a workspace is refused before its listener binds unless the file is named. Where the keys cannot be read at all, requests are answered `503` with no challenge: nothing a caller presented was found wanting, so sending it after another token would not help.

**The one answer given with no credential asked for is the protected-resource metadata document.** A client has to read it before it can hold a token, so requiring one there would close the only door in. It is answered at `/.well-known/oauth-protected-resource`, and — where the address `mcp.authorization.resource` names has a path of its own — at that well-known path with that path appended as well. Those are the two places a client looks, and the appended form is the address the challenge names. The document carries that address as the resource this deployment is called, `mcp.authorization.issuer` as the authorization server to obtain a token from, `header` as the only way to present a token, and the three scope names below.

**The scope names this deployment publishes are `aggrega:read`, `aggrega:workspace-write` and `aggrega:registry-write`.** Those are the names to register at the authorization server and the names a client asks it for, and the challenge a refused caller receives names `aggrega:read` as the one to obtain first. What each of them admits — and the second bound, the one this deployment sets on itself — is under [What a caller may reach](#what-a-caller-may-reach) below.

### Reading the caller from a proxy in front

**Where a proxy in front already validates tokens, `mcp.authorization.trusted_proxy` tells this server to read the caller from it instead of checking a token a second time.** Give it `principal_header`, the header that proxy sets to say who the caller is, and optionally `scopes_header`, a second header carrying that caller's scopes separated by spaces. Those two headers are the only ones read: no forwarded-address header and no other header participates. A request arriving without the principal header is answered `401`, and **no token is read in this mode at all** — a request carrying a token this server would otherwise have refused is served when its principal header is present, and one carrying a token this server would have accepted is still refused when that header is absent.

**That mode is accepted only on loopback or a Unix socket, and the process is refused before it binds anywhere else.** A header is trustworthy exactly when nothing but the proxy can set it. On an address the network reaches, anything can set it — so a listener in this mode on such an address would let every caller name itself whatever it liked. The refusal names both settings that conflict, so you can lift it by moving the address or by removing the block.

**What the proxy asserts is what this server believes, and that is the bargain.** This server checks no signature in this mode and compares the asserted caller to nothing, exactly as it compares a token's subject to nothing. Whether the proxy validated what it forwarded, and whether anything can reach that listener without passing through the proxy, are the deployment's to get right; the confinement above is what makes them possible to get right, not a guarantee that they were.

**Setting `mcp.authorization.trusted_proxy` does not remove the other requirements.** `issuer` and `resource` are still needed, because the metadata document is still published and the challenge still names it — a client behind the proxy still has to learn where to obtain the token the proxy will check.

### What a caller may reach

Two bounds decide what a caller reaches over HTTP, and they are set by different people. The caller's own credential is the first; what this deployment carries at all is the second. Both are read before anything runs, from a declaration each operation makes about itself — so a client is told what it can do rather than finding out from a call that fails.

**Every operation declares how far its own effects travel, and there are four kinds**, widest last:

- **Reaches nothing** — reads a definition, inspects what a Release pins, renders artifacts in memory and hands them back. Nothing is written and nothing leaves the process.
- **Reaches the workspace** — writes inside the workspace this process serves: a Release's lockfile, the content-addressed store, generated entities, an edited document.
- **Reaches a registry** — publishes, signs, or attaches a withdrawal marker to something already published. What it changes is what **every** consumer of that registry resolves, and none of it can be recalled from anyone who has already fetched it.
- **Reaches the machine** — changes what every workspace on the host shares, among them the compiled-module store, the configuration file common to all of them, and the credential store. A cache a single project keeps under its own cache directory is not this kind, and `cache-status` reports which of these kinds each cache it lists carries.

The kind is a property of the operation rather than of the tool that offers it, and it covers what the operation **leaves behind** — not where a surface puts the answer it hands back. Rendering a Release produces artifacts as its answer, so it reaches nothing; a command line that then saves those artifacts into a directory you named is delivering that answer rather than reaching further. Read the other way, every operation that answers with content would take the kind of whichever surface happened to save it, and the kind would stop being a property of the operation at all.

**A scope admits a kind, and each write scope implies the read scope.** `aggrega:read` admits an operation that reaches nothing. `aggrega:workspace-write` admits one that reaches the workspace, and implies the read scope. `aggrega:registry-write` admits one that reaches a registry, and implies the read scope too. So a client asks its authorization server for the write scope it needs and does not also have to ask for the read scope.

**No scope admits the machine kind, and no setting adds one.** The operations of that kind are carried only by the tools that run an `aggrega` command in a separate process, and a server reached over HTTP offers none of those at all, for the reason given under [Reaching the server over HTTPS](#reaching-the-server-over-https) above. Run them at a terminal on the host.

**A tool the calling credential does not admit is absent from the tool list that credential receives**, and absent from `describe-capabilities` too, so what a client is offered is what it can call. Calling one anyway is answered `403` with `error="insufficient_scope"` on the challenge, naming the one scope that would admit it.

**A build is the case worth knowing.** It changes nothing by itself and so needs only `aggrega:read`, but a build that resolves its dependencies first writes the lockfile, so that one needs `aggrega:workspace-write` — whether the call asked for that with `auto_pull` or the workspace's own `auto_pull` setting did. The tool itself is offered to a read-scoped caller, because the builds that stay in memory are genuinely available to it; what is refused is the call that resolves first.

**`mcp.deny_reach` is where a deployment withdraws a kind from itself.** List the kinds — `none`, `workspace`, `registry`, `machine` — this deployment does not carry, and every tool that reaches one of them is absent from every caller's tool list whatever that caller's token says, and refused if called anyway with an error naming this setting. It is the deployment's bound rather than the caller's, so no credential lifts it and the refusal carries no challenge: a server meant to serve reads and nothing else lists `workspace`, `registry` and `machine` here, and then cannot publish even for a caller whose token carries all three scopes. Leave it out, which is the default, and this deployment carries whatever its callers' own scopes admit. Naming `machine` is accepted and changes nothing, since nothing of that kind is offered here in the first place. A value that is not one of the four is refused when the configuration loads, rather than being passed over — an operator who misspells a kind has asked for a bound, and being served without one silently is the wrong way to answer that.

### Which credentials a call spends

**Keyless signing over a listener takes its identity from the `identity_token` the call carries, and from nothing else.** A token sent in the call is a credential the caller holds: they had to obtain it, it is bound to them, and the signature it makes is attributable to them. Every other place an identity could come from belongs to whoever started this process, so on this transport the resolution is handed an environment that answers nothing. `AGGREGA_IDENTITY_TOKEN` and `SIGSTORE_ID_TOKEN` in the server's environment are not read, and the ambient GitHub Actions OIDC endpoint is not reached. They are out of reach rather than discouraged — there is nothing for the resolution to find. A call sending no `identity_token` is refused, and the refusal names `identity_token` as what to send and names no variable and no endpoint: a caller who is not at this machine's keyboard cannot export anything here, so naming one would be telling them to arrange something that cannot change the answer.

**A signing key held on this machine cannot be selected, by either route.** `key_path` is refused before anything is resolved, and it is absent from the argument schemas `publish-entity`, `sign-artifacts` and `deprecate-artifact` advertise here, so a caller is never offered an argument that could not succeed. **The signing key the served workspace's own configuration names is not reached either** — `signing.key_path`, whether it is set for the workspace as a whole, set against one registry, or supplied from the environment. One reason covers both: a key path is not a credential, it is a *name* for a secret this server holds. A caller supplying one proves nothing, anyone who reached this address could supply the same name, and the signature that followed would say the operator vouched for the artifact rather than the caller. Closing the argument while leaving the configuration open would be one door shut onto a room the other still opens. So keyed signing is unreachable over a listener: only a token sent in the call signs.

**`fulcio_url`, `rekor_url` and `timestamp_url` are unaffected and stay on both transports.** They name services to contact rather than anything this machine holds, so a caller that cannot select a key still signs against the endpoints this deployment configures.

**A listener started over a workspace that names a signing key says so once, as it starts.** The process writes one line on its own error stream naming the setting and saying that a caller reaching this listener cannot spend that key — so an operator learns it from the process they started rather than from a signature they did not expect. A workspace naming no key produces no such line, because there is nothing about it to say. The line carries the setting's name and neither the key nor anything about the file it points at.

**Over standard input and output none of the above applies.** There the environment is read and `key_path` selects a key held on this machine, because the client that launched this server is running on the caller's own machine and what that process can reach is that caller's own to spend.

**A registry call uses the credential store of the operating-system user this process runs as**, exactly as the same call does at a terminal on this host. There is no per-workspace credential source and no setting that adds one, which is why `registry-list` reports a host's credential state the same way in every workspace on this machine. **A deployment that wants different workspaces to hold different registry credentials runs them as different operating-system users** — one process per workspace, each started as its own user. That is where the separation comes from, and arranging it is the operator's.

### What the server records

**Every request this endpoint answers leaves one line on the process's error stream, and that line is a single JSON object.** It carries the `time` it was written and a `request_id` this process minted for the call and does not send back to the caller; `subject` and `issuer` as the presented credential asserted them, with `client_id` where it named one; `workspace_root`, the workspace this process serves; `method`, and `target` where the method addresses something by name; `reach`, the kind the operation declares, and `reach_escalated_to` where the call reached further than that; `outcome`; `duration_ms`; and `transport`. A field with nothing to say is left out rather than written empty, so an absent `client_id` is a credential that named no client, and an absent `reach_escalated_to` is a call that reached exactly what its operation declares.

**`outcome` says what became of the call, and the values are distinct so you can count them apart.** `ok` ran and succeeded. `tool-failure` ran and came back flagged as a failure the caller can correct — a call this server served rather than one it refused, so it does not belong among your refusals. `error` is a refusal carried back as a protocol error envelope. `unauthenticated`, `forbidden` and `rate-capped` are the credential, the origin-or-scope bound, and the per-caller rate cap turning a request away. `cancelled` is a caller that closed its connection before it was answered.

**The reason a refused credential was turned away is a field of that same line rather than a line of its own.** A refused request leaves one record like every other, with `refusal` naming the check that turned it away. No credential, and no part of one, reaches any line — not on a refusal, and not on a call that was served.

**A caller that presented nothing at all leaves no line.** Being challenged is how a client finds out where to obtain a token, so it is the first thing every well-behaved client does, and a line for each of those would bury the refusals that mean something. A request naming a path or a method this endpoint does not serve leaves none either: both are settled before anything about a caller is read, so scanning the address writes nothing into whatever collects the stream.

**Trace context a client sends is copied onto the line verbatim.** `traceparent`, and `tracestate` and `baggage` beside it where those are sent too, are carried through exactly as received, so whatever collects this stream can join it to the caller's own records. A request that sends none, or sends one that is not well-formed W3C trace context, produces a line without those keys: nothing is invented, and nothing is altered on the way through.

**The process records its own life in the same shape and on the same stream**, each of those lines naming an `event` where a request line names a method and a caller: `startup` as it begins, `listening` with the address it bound, `startup-refused` with the reason a launch was declined before it served, `signing-key-ignored` where the workspace it serves names a signing key no caller reaching this listener can spend, `docs-bundle` with the outcome of acquiring the documentation bundle, and `shutdown` as the run ends. Reading for the presence of `event` is how the two kinds of line are told apart.

**You collect all of it from the process's error stream, and that is the whole of the delivery.** There is no exporter to configure, no file to name, and no setting that turns any of it on, off, or elsewhere: whatever supervises this process — a container runtime, a service manager, a log shipper — is what collects that stream, and where you query it afterwards. Over standard input and output the same stream carries readable prose instead, because the client reading it launched the process and sits on the same machine.

**None of it is sent to the caller.** The server publishes no log stream over the protocol on either transport, and a request carrying the protocol's per-request log-level field is answered exactly as one that carries none: what is recorded here is the operator's, and it goes to the operator's stream alone.

## What the server tells the model when it connects

The server offers a block of guidance for the model, which your client may surface to it before the first call. A client on `2026-07-28` reads it from the `server/discover` answer; a client on `2025-06-18` reads it from the reply to its `initialize` handshake. **It is the same text on both paths, byte for byte**, and the same text for every client reaching one process: nothing in it is negotiated, and nothing is derived from what the client sent or from the credential it presented, so what a model is told on connect does not vary between sessions or between clients.

**One thing does vary, and it is the transport rather than the client.** The closing paragraph is composed for the transport a process serves, so a server speaking over standard input and output and a listener hand a model different closing text. Within either process the two revisions still serve that process's own text identically.

It teaches the mental model a tool's argument schema cannot convey on its own:

- **What the compiler does, and what it deliberately does not do** — that it routes text and evaluates label matches rather than interpreting what a value means, that it is unopinionated about the content you put in your documents, and that while compiling it never authenticates with a provider, never reads a cluster's state, and never turns a secret into plaintext. A value that exists only once infrastructure is running travels through as a pointer string the target environment fills in later.
- **The authoring vocabulary, and how the kinds relate** — what each kind is for and which one a build is actually run against, so an assistant does not have to infer the shape of a deployment from the tool list.
- **The order the authoring loop runs in** — read the contract, scaffold from it, inspect what you are wiring to, then check before rendering.
- **When to reach for a prompt rather than a tool** — a tool to act, a prompt to frame a task.
- **That the default tool list is not the whole surface**, and the call that loads the rest.
- **What an empty workspace means, and what the model may do about it** — the paragraph that differs by transport, below.

**It names the surfaces rather than restating them.** Each tool already carries its own description and argument schema in `tools/list`, and each kind's contract already lives in its schema and its reference page, so the guidance points at those and stops — one home per statement. A tool it names is a tool the server serves, and it points at every resource family the read surface resolves, so nothing it sends an assistant after is a dead end.

It also states what it does not enumerate, and why: the render targets available and the library kinds installed are properties of your plugins and your schema set, so the resource surfaces report them directly rather than the guidance carrying a copy that could disagree.

### What a model is told about an empty workspace

The closing paragraph answers the question a model meets first on a workspace holding nothing: what an empty `list-entities` means, and what it may do about it. Its opening is the same on both transports — an empty listing means the workspace this process resolved holds no Aggrega documents it can read and the catalog directories configured beside it declare none either — and what follows it depends on which transport this process serves, because the honest answer is not the same on the two.

**Over standard input and output the model is told the workspace is its to inspect and to repair.** It is pointed at `cli-config-show` for the configuration in force and where it came from, and at `cli-config-init` for seeding a working one; both are reachable on that transport, through `describe-capabilities`. The client running the server is on the caller's own machine, so what that process can reach is that caller's own to spend — and where you set the boundary is where it is set for every other tool, in your MCP client, as [What an assistant can do without asking you first](#what-an-assistant-can-do-without-asking-you-first) sets out.

**Over HTTP the model is told to report rather than to configure.** The workspace is the one you started the process over and is fixed for its life; a call naming `workspace_root` or `catalog_dirs` is refused, naming the argument; and no tool that writes configuration is offered to any caller here, whatever scopes its credential carries. Those operations are carried only by the tools that run an `aggrega` command in a separate process, and a session reached over HTTP is composed without them — so the bound is the composition rather than a scope, and no token widens it. A model reaching your deployment over a listener therefore cannot seed a registry or rewrite a trust policy on your host, and the paragraph tells it so instead of letting it try and read the refusal.

## What an assistant can do without asking you first

**An assistant connected to this server over standard input and output can call every tool the server exposes, without asking you, unless your client is configured to deny it.** On that transport the server offers the tools and does not decide which of them any particular call is allowed to use: that decision is your client's, and it is yours to make there. Over HTTP it is not the same: the server offers only what the calling token's scopes admit, and refuses a call outside them, so the bound is the deployment's as well as the client's.

This matters because the tool surface is the command line. Anything you can type, an assistant can call — including the operations that change your machine.

**Some of those operations reach further than the workspace you are working in, and cannot be undone by running something else.** These are the ones worth knowing by name, widest reach first:

- **`publish-entity`, `publish-artifact`, `sign-artifacts` and `deprecate-artifact` reach past the machine entirely.** They put bytes, a signature or a withdrawal marker in a registry, so what they change is what **every** consumer of that registry resolves — not only what this machine does. Re-publishing different content over a tag is refused rather than offered, so nothing here takes a publication back; the answer is to publish a new version. A signature and a withdrawal marker leave the artifact's bytes untouched, but anyone who fetches that artifact afterwards fetches them too, and **neither can be recalled from anyone who already has it**. On standard input and output the same four capabilities are also reachable as `cli-push`, `cli-push-artifact`, `cli-sign` and `cli-deprecate`, which run the commands; over HTTP those four tools do not exist.
- **Signing uses credentials.** Over standard input and output, keyless signing takes an identity token from the call's `identity_token` argument, from `AGGREGA_IDENTITY_TOKEN` or `SIGSTORE_ID_TOKEN` in the server's environment, or from the ambient GitHub Actions OIDC endpoint where one is reachable; `key_path` selects an offline held key instead. An assistant that can call these tools can therefore sign as you, with whatever identity the machine running the server already carries — and a signature is a statement about who vouches for an artifact, which is why this is the operation to think hardest about before allowing it. Over a listener only a token sent in the call signs: nothing in the server's environment is read, and no key held on the host can be selected by an argument or by the served workspace's configuration, as [Which credentials a call spends](#which-credentials-a-call-spends) sets out.
- `aggrega cache evict` trims the compiled-module store, and `aggrega cache clear` wipes it. That store is shared by **every** Aggrega project on the machine. Modules removed from it are recompiled on demand, so nothing is lost permanently — but the next build of any project pays that cost.
- `aggrega cache prune` reclaims artifact-cache entries no lockfile references. Where a project's lockfile is not present to be read, its pinned artifacts are not protected by it, and reclaiming them means fetching them again.
- `aggrega registry add` and `aggrega registry remove` write to the configuration shared across every workspace by default, so they change what resolves everywhere on the machine, not only here.
- **`pull` reaches a registry and writes inside the workspace it is pointed at.** It writes that Release's lockfile, fills the content-addressed store with what it resolved, records the identity of each verdict-returning plugin your workspace attaches beside the lockfile, and writes the resolved content digests into the recipe files it reached that are writable. None of it leaves the machine, and resolving again is how you change what it recorded, so this is the mildest of the operations here that write — but it and `gen-catalog`, which writes generated Plugin entities under the directory you name, are the two writes an assistant can reach without first asking `describe-capabilities` for anything. That output directory, the guest `gen-catalog` reads and any overlay you give it are each absolute or relative to the workspace root, the same contract every other path argument on this surface uses. On standard input and output the same capability is also reachable as `cli-pull`, which runs the command; over HTTP that tool does not exist.
- **`build` reaches the same registry and performs the same write when you send it `auto_pull`, and only then.** Resolving a Release's dependencies is one operation wherever it is asked for, so a build told to resolve first does exactly what `pull` does and then renders against what it wrote — which is why it carries the same reach rather than a lesser one. Left off, which is the default, `build` renders from the pins the workspace already holds and reaches nothing. Read [Building against the content a Release already pins](#building-against-the-content-a-release-already-pins) for what the argument changes and what it leaves alone.

The inventory tools say so in their own answers. `cache-status` marks each cache class with its reach — `workspace` for the artifact cache under this project's own cache directory, `machine` for the stores every project shares — and names the machine-wide ones outright, so an assistant reading the inventory before proposing a reclamation is told which parts of it are not yours alone. The maintenance operations report the same reach for each element they removed. Each of the four publication results carries a `reach` of its own, holding `registry` — the host it addressed — and `beyond_this_machine`, which is read off what the call actually did rather than what it asked for, so it is false for a dry run and true once anything has landed.

**Where you set the boundary.** The protocol itself defines no per-tool permission — its authentication is about whether a client may connect at all, not about which tools it may then call. The permission decision lives in your MCP client. Widely used clients can generally allow and deny individual tools by name from a single server, and disable a server entirely for a given project; the setting's name and location differ per client, so consult your client's own documentation for tool permissions. If you want the reads and not the writes, allow the tools you want and deny the rest there. A permissive configuration, or a client with no such setting, leaves every exposed tool callable.

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

Everything the server reads for reference is served offline — the JSON Schemas are built into the binary and the documentation is read from the local documentation-bundle cache. Scaffolding, validating, describing, building and linting all run against your workspace and the local caches, and none of them reaches a registry of its own accord: a render serves a pinned external reference from the content-addressed store and **declines** an unpinned one rather than fetching it, which is what keeps the whole inspecting-and-rendering loop offline. Publishing and signing are the deliberate other side of that, and they are covered above.

Between the two sits resolving a Release's dependencies, which is the one thing here that acquires: it reaches a registry because being asked to resolve dependencies is being asked to fetch them. **It happens only when you ask for it, and there are exactly two ways to ask** — calling `pull`, whose whole job it is, or sending `auto_pull` to `build`, which performs that same resolution as the build's first step. Nothing pulls on your behalf otherwise, and a build you did not send `auto_pull` reaches nothing. The one setting that changes this is the workspace's own `auto_pull`: a workspace configured that way is asking every build in it to resolve first, wherever that build is run from, which is covered below.

The one exception among those reference reads is acquiring the documentation bundle itself, and it happens away from every read. The server pulls the bundle once when it starts, before it answers anything you send, through the same egress settings the rest of the CLI uses — so the pages are already cached by the time anything asks for one, whatever your client happens to send first. Serving a page is then a local read that cannot reach the network at all. If the bundle cannot be acquired the server still starts and every other surface works; documentation requests answer not-found, and the server's log stream says why.

## Building against the content a Release already pins

`build` renders a Release into its artifacts in memory, and a render can ask for content from a remote URL — a chart's values schema with a remote reference, for example. **External inputs are frozen for the call.** A reference the Release's lockfile already pins is served from the content-addressed store, which is a read of content already on disk rather than a fetch. A reference the lockfile does not pin is **declined and named** rather than fetched: what you asked for is a render, and acquiring a reference would both reach the network and write a blob into the store as a side effect of producing bytes. That freeze is a property of the render. Resolving is the step that acquires: it renders the Release to find out which remote references that render asks for, fetches them, and records them in the same lockfile write that carries the dependency pins. So what resolving changes is *which references are pinned by the time a render runs*, never what a render may reach — and a reference no resolution pinned is declined on a call that resolved first exactly as it is on one that did not.

**The files come back as the bytes a real build emits, and two things together are what make that true.** One is the freezing above: a pinned reference is read from the store rather than fetched. The other is that the lockfile being read from still describes what the Release resolves to — so `build` checks that, and refuses a lockfile that no longer matches, exactly as `aggrega build` does at a terminal. Reading pinned bytes says nothing on its own about whether they were the right bytes to read.

**All three lockfile states, so the posture is explicit.** With **no lockfile** at all, `build` renders from whatever the workspace already pins and declines every external reference it cannot serve, naming each one; left to itself it neither requires a lockfile nor writes one, and that is unchanged by the check above — there is no lockfile for it to compare, so nothing is refused. With a lockfile that **matches**, it renders. With a lockfile that **no longer matches**, it refuses, and the refusal names how to clear it: call `pull` with the same `release` and no `upgrade_targets`, which reconciles the lockfile against what the Release resolves to today. The refusal also carries the terminal form of that same operation, which asks additionally for every pin to be re-resolved to the highest available version — more than this condition needs, and it clears it too. Either invocation clears it; they are one operation reachable from two places, not two instructions to choose between.

### Asking a build to resolve its dependencies first

**Send `auto_pull` and the build resolves before it renders.** It performs the same resolution `pull` performs — the operation itself, not a second one written for a build, so a workspace filled by a build and one filled by a `pull` call are filled identically — writes the Release's lockfile, and then renders against what it wrote. That step **reaches a registry and writes**, which nothing else about `build` does, so it is off unless asked for.

**It answers the two refusals above without leaving the protocol.** A Release nobody has resolved yet renders from whatever pins happen to be there and declines the rest; a lockfile that has drifted stops the build outright. Sending `auto_pull` resolves first and renders against a lockfile derived from the closure this build is about, so both cases come back as a render rather than as something to go and fix. Where you want the resolution and the render as separate steps — to read what was pinned before rendering it — call `pull` and then `build`, which is the same two operations with a look in between.

**One call renders the Release once.** Finding out which remote references a Release consumes is itself a render, so a resolution has already rendered the Release the build is about — against the very pins it just wrote, with every gate a build runs. The build is answered from that render rather than repeating it, which is why sending `auto_pull` costs a resolution and not a second render. Only a render that *finished* is used that way: where a resolution pinned its dependencies but could not finish discovering the external references, the build renders for itself against the pins that did land, and an unpinned reference then halts it by name rather than coming back as a file list stopping short of what a build emits.

**What comes back says what was resolved.** A build that filled carries `dependency_resolution` on its answer, in the shape `pull` answers with: the lockfile it wrote, every reference the resolution reached with the version each resolved to, the counts the lockfile holds afterwards, and the resolution's own account of itself line by line. A build that did not fill carries no such field at all, so its presence is how you tell the two apart without reading the disk. The rendered files are reported exactly as they are for any other build, and they are still returned in memory — resolving writes the lockfile and the content-addressed store, never an artifact.

**A workspace can ask for it standingly, and a call cannot turn that off.** The workspace's own `auto_pull` setting turns the same step on for every build in that workspace, and `auto_pull` on a call adds to that setting rather than overriding it: either one is enough, and there is no argument that suppresses a resolution the workspace asked for. That is the same way the setting and [`aggrega build --auto-pull`](aggrega-build.md) combine at a terminal, so one workspace answers the same way whichever surface a build arrives on.

Declining is reported rather than absorbed, and with the providers this binary carries a decline stops the render: the provider that asked for the reference hands the refusal back, so the call answers with that failure and returns no files. The reference is named where a reader can act on it, alongside the command that pins it: `aggrega pull --release <path>`. **The same pinning is reachable on this surface as the `pull` tool**, described in [Resolving what a Release depends on](#resolving-what-a-release-depends-on) below, so an assistant that meets this refusal can act on it without leaving the protocol. A fully-pinned render says nothing about any of this. See [`aggrega pull`](aggrega-pull.md) for what pinning fetches and records, and [`aggrega build`](aggrega-build.md), where an unpinned reference is reported and halts the run in the same way.

## What a build tells you besides its files

**A build carries every advisory it raised, on the answer itself.** These are the findings `aggrega build` prints while it works — a name one edit from a declared one, a parameter nothing reads, a target that cannot honor an authored field, a non-halting governance verdict. None of them changes the outcome: a build that carries advisories still succeeded, and the files it returns are the files it produced. They arrive in the order the build raised them, which is the order a terminal prints them, so a reader comparing the two finds one sequence rather than two.

They are on the answer rather than only in the summary text because an assistant driving this surface reads no terminal, and a finding nobody is told about is a finding that was not made. Each carries a `severity` — `warn` for something wanting attention, `info` for an observation recorded — and a `message`; a `code` where its class assigns one, so you can react to a specific condition without matching text; and a `key_path` naming the key in the authored document the finding is about, where it is about one. A finding about the shape of the deployed topology names no key, because its coordinates are the deployment's rather than a document's, and says what it concerns in its message instead.

A Release raising nothing says nothing: the key is absent rather than present and empty, so its presence alone tells you there is something to read.

## What a refused build hands back

**A build that refuses answers in the same fields a build that succeeded answers in, populated as far as the run got.** It comes back flagged as a failure with the correction as its text, and the structured payload sits beside that text rather than being replaced by it. The advisories are in it: the phases that ran raised what they raised, and those are the findings you have to act on to get past the refusal, so they arrive as entries you can match on rather than as prose you would have to parse. `deprecations` and `declined_external_inputs` are in it for the same reason — a recorded marker is reported because a marker was recorded, and a declined reference because a reference was declined, and neither of those facts is a consequence of how the run ended.

**`files` reports nothing on a refusal, and it is not the field to read the outcome from.** Nothing was emitted, so there are no artifacts to name. Do not branch on whether the key is there: it is reported either way, and an empty `files` cannot on its own tell a build that refused from one that ran and emitted nothing. Read the failure flag on the result — that is the protocol's own discriminator — and read `files` for what it is, the list of what was written.

**What bounds the advisories on a refusal is how far the run got, not what the answer is able to carry.** A refusal from one of the checks that run before the compiler starts — the Release's closure could not be resolved, the Manifest maps a type onto a recipe that does not implement it, the lockfile no longer matches what the Release resolves to, a pinned entry in the cache no longer matches the digest recorded for it — reports no advisories, because the phases that raise them had not run yet. A refusal from the render, or from any check downstream of the phases that raise findings, reports everything raised ahead of it. So read `advisories` on a refusal exactly as you read it on a success: what this run found, in the order it found it.

A worked shape, so the two halves are concrete. A Release declaring a parameter no reference reads, whose render then cannot complete, comes back as a failure whose text names the render and whose payload carries the unread-parameter advisory with its `severity`, `message`, `code` and `key_path` — the same entry, with the same values, that the same Release reports on the answer when the render does complete. The same Release with an unresolvable closure comes back as a failure with no `advisories` key at all, because nothing had been raised when it stopped.

## Resolving what a Release depends on

`pull` resolves a Release's catalog and source dependencies into the local cache and writes that Release's lockfile. It is in the default list, which is the point of it: the two refusals above — a render that declined an unpinned external reference, and a build that stopped because the lockfile no longer matches what the Release resolves to — are both answered by pinning, and an assistant that has to ask you to run a command has no way to answer them itself. Read [What an assistant can do without asking you first](#what-an-assistant-can-do-without-asking-you-first) for what it writes and how far that reaches.

Pass `release`, the Release path, absolute or relative to the workspace root — the same contract every other path argument here uses. `workspace_root` and `catalog_dirs` override workspace and catalog discovery exactly as they do on `build`. Both hold on a server reached over standard input and output; over HTTPS those two arguments are refused and the path must resolve inside the workspace the process serves, as [One process, one workspace](#one-process-one-workspace) sets out.

**By default it reconciles rather than re-resolving.** A pin the lockfile already records is honoured and fetched at that version, and refused rather than silently re-pinned if the registry no longer serves those bytes. A reference with no pin — newly added, or removed from the lockfile by hand — is resolved fresh and added. A reference no longer among the resolved dependencies is pruned. An unchanged dependency set therefore leaves the file **byte-identical, its recorded timestamp included**, so a call that changed no pin produces no diff for anyone reviewing the workspace afterwards.

**`verify` compares and writes nothing at all.** It checks the recorded lockfile against what the Release resolves to today and comes back as a failure on drift, or when there is no lockfile to compare against — so it is how an assistant finds out whether pinning is needed before doing anything that writes. It also reports the toolchain the lockfile records: the compiler version that wrote the file and the version of each core plugin that compiler carried. That is reported for audit and never compared against the running binary, because the toolchain is not part of what the lockfile pins and checking it would pin the compiler by proxy — a toolchain difference is not drift.

**`upgrade_targets` re-resolves the references you name, and nothing else.** Give it one or more entity URIs in the bare authored form — `core/database`, not a versioned form. Each named pin is dropped and re-resolved to the highest available version, while every other pin and the recorded external inputs are held unchanged. A URI that matches neither a recorded pin nor a configured attachment is refused rather than ignored.

**There is deliberately no argument that re-resolves everything at once.** The command line has that form, and it discards the whole lockfile before re-resolving from current registry state. On this surface the argument does not exist, so the call cannot be composed at all rather than being accepted and then refused: nobody is watching a protocol stream, so a wholesale discard has nobody to confirm it. Where you want it, and on standard input and output only, `cli-pull` runs the command, which is the surface where a person is present; a caller reaching this server over HTTP runs it at a terminal on the host instead. `verify` and `upgrade_targets` cannot be combined — one writes nothing and the other rewrites the lockfile — and the tool's advertised schema declares that, so a client composing calls against the schema never sends the pair.

**The result names what was resolved, not merely that something was.** It carries the lockfile it wrote or compared against; `resolved`, every reference the resolution reached with the version each resolved to and, where the resolution records one, the kind an author writes; counts of the source artifacts, external inputs and trusted plugin identities the lockfile holds afterwards; and `diagnostics`, the resolution's own account of itself in the order it raised each line — which pin was reused, which signature was checked, which version was skipped as withdrawn. Those lines reach a terminal when you run the command; here they are in the answer, because a caller reading no terminal has no other way to receive them. `verified` is present only on a comparison, so its absence is how you tell a run that wrote from one that only read.

**A refusal answers in the same fields, populated as far as the run got.** Once the resolution has been computed, `resolved` is carried whatever the verdict — a drift verdict most of all, since that is the refusal a caller has to decide what to change about. A refusal from before that point, such as a Release path that does not resolve, carries the correction as its text and no resolution, because there was none to carry.

**Where the pins are complete and the external inputs are not, the call still succeeds and says so.** Discovering which external inputs a Release consumes is a render, and a render can fail after the dependency pins are already correct and on disk. Reporting the whole call as failed would tell you to redo work that is right, so `incomplete_external_inputs` is set on the successful result instead, naming what stopped: the dependency pins are complete, the external-input pins may not be.

**This is the slowest tool here, and the reconciling no-op is not a fast path.** A resolution pays its full cost to establish that a dependency set is unchanged, so a call that rewrites nothing costs what a first resolution costs — on a small Release, seconds rather than milliseconds, and it grows with the size of the dependency set. A `verify` is the cheaper of the two shapes, because a comparison skips the per-component source descent that a writing run performs. If your client imposes a per-call timeout, this is the tool to check it against. Asking to be told how it is going, below, means something arrives while the call runs rather than nothing until it ends — which answers an idle timeout in your client, or in whatever sits between you and a server reached over HTTP, but not a cap on how long one call may take in total.

### Being told how a long call is going

**A call reports its progress when you ask to be told, and asking is one field.** Put `progressToken` in the call's `_meta` — a string or a number, yours to choose. It comes back on every report exactly as you spelled it, and it is the only thing in a report that points back at your call: a report answers nothing, so it carries no id. Send no token, or send it as null, and nothing changes — the call is answered the same way it is answered without one. **A token of any other shape is refused**, before the call does anything, naming the two forms it may take rather than being passed over: a caller that asked to be told and is then met with silence has nothing to act on.

**What arrives is `notifications/progress`, carrying your token and a count that rises with every one.** There is no total and no message, and neither is an omission awaiting work: what the work reports is that it has entered another phase, so a total could only be invented and a sentence could only be composed here rather than passed through. Draw an indeterminate indicator off the rising count; there is no fraction to fill a bar with.

**Over HTTP the answer becomes an event stream, and only once something has actually reported.** It is served as `text/event-stream`, marked not to be cached, and carrying `X-Accel-Buffering: no` for an intermediary that would otherwise hold every event until the work was over and turn the stream into a slow single answer. Each report is one event, and the call's own answer is the last event before the stream closes. While the work is quiet the stream carries a comment line at intervals, which reaches whatever sits in between as bytes on a live connection and reaches your client as nothing at all. **A call that asked for progress and reached work that reports none is still answered with one JSON object**, because what opens the stream is the first report rather than the token.

**On a stream, read the outcome from that last event rather than from the status code.** The status and the headers are written when the stream opens, which is before the work is done, so a call that reports and then refuses carries its refusal as the last event under the status already sent. Closing the connection mid-stream ends the work and nothing further is written for it, exactly as [How a call ends](#how-a-call-ends) describes for every other call.

**Over standard input and output the reports are lines ahead of the response line**, framed the way every other message on that stream is framed — one JSON object per line, in the order they were written — and the response line follows them. Nothing is reported once a call is over, on either transport.

**Resolving a Release's dependencies is what reports here.** `pull` reports each time the resolution enters a phase. `build` reports only when it is resolving first — because you sent `auto_pull`, or because the workspace's own setting asks every build in it to resolve — since the reporting belongs to that step: a build rendering from the pins it already holds reaches nothing and reports nothing, so a token on that call changes nothing about how it is answered. Every other call accepts a token and reports nothing, which is harmless rather than an error: the answer is the one you would have received without it.

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

`position_encoding` names the units the reported character offset is measured in: `utf-8`, `utf-16` or `utf-32`. It is an argument here because neither revision of this protocol negotiates one, and it defaults to `utf-16`, which is what an editor session takes when a client negotiates nothing — so a caller that names nothing is answered identically on both surfaces. A value that is none of the three is refused rather than quietly defaulted, because offsets measured one way and applied into a buffer measured another corrupt the document at the first character outside ASCII.

**It answers and stops.** It writes nothing to any file, composes no entry text and applies no edit; composing the text and deciding whether to apply it are yours. A request that does not address a place an entry can go comes back as a failed result naming what to change — a document that is not in the workspace, cannot be read, or is not well-formed YAML; a container path carrying no segments or an empty one; a path running through a scalar, which nothing can be appended inside; a path reaching a collection written in flow style, where appending would rewrite bytes the author already wrote rather than add a line; or a path addressing a block sequence with something that is not one of its indices.

## Publishing, signing and withdrawing

Four tools put something where other people will resolve it. `publish-entity` bundles a catalog entity and publishes it; `publish-artifact` publishes a standalone file, such as a documentation bundle, with its bytes opaque and no entity envelope parsed; `sign-artifacts` signs already-published references and attaches each signature; `deprecate-artifact` attaches a signed withdrawal marker to one. Like the candidacy and insertion-point tools they are not in the default list — ask `describe-capabilities` for them. **Read [What an assistant can do without asking you first](#what-an-assistant-can-do-without-asking-you-first) before you allow any of them**: these are the tools whose effects leave the machine.

`publish-entity` takes `entity`, the document to publish, and a Plugin also needs `plugin`, the executable published inside its manifest. `publish-artifact` takes `file` with the `name` and `tag` it is published under. Every path argument here is absolute or relative to the workspace root, the same contract every other tool on this surface uses, and `workspace_root` names the workspace the call means — on a server reached over standard input and output. A server reached over HTTPS refuses `workspace_root` and requires each of those paths to resolve inside the workspace it serves, as [One process, one workspace](#one-process-one-workspace) sets out. `registry` is the destination and defaults to the workspace's configured one; sending neither, with no default configured, is refused naming what to send. `sign-artifacts` takes `references`, one or more registry addresses rather than paths. `deprecate-artifact` takes either `reference` with `severity` and `reason`, or `from` naming a batch file — and refuses content arguments sent alongside a batch file rather than dropping them, because a batch file supplies its own and a silently ignored argument reads as one that was honoured.

**The two publishing tools take `dry_run`, which shows what a publication would send without contacting anything.** It computes the bundle, reports what it would have published, and answers with `beyond_this_machine` false. It is the way to show someone a proposed publication before it becomes one. Signing and withdrawing have no such form: both act on something already published, so there is nothing to preview.

Signing is where the credential is spent, and three of the four tools do it — a data-artifact publication signs nothing, and is signed afterwards by reference. `identity_token` supplies a keyless identity for the call. On a server reached over standard input and output, leaving it out falls through to the identity that server's own environment carries, and `key_path` selects an offline held key instead. **Over a listener neither of those is reachable**: the environment is not read, `key_path` is refused and withheld from what these three tools advertise, and a key the served workspace's configuration names is not reached — so only a token sent in the call signs, as [Which credentials a call spends](#which-credentials-a-call-spends) sets out. `fulcio_url`, `rekor_url` and `timestamp_url` override the keyless endpoints the workspace configures, on either transport. When no identity resolves at all the call **refuses and names what to send** — nothing here opens a browser or waits on a person, because there is nobody watching a protocol stream, and a call that hung would be the silent failure that refusal exists to prevent. On `publish-entity`, whether a signature is attached at all follows the destination registry's policy unless `sign` says otherwise, and a registry that requires signatures refuses an unsigned publication whatever you send: there is no argument that bypasses that refusal. See [`aggrega sign`](aggrega-sign.md) for the two signing modes and what each contacts.

Each result carries the facts rather than a transcript: where the artifact landed, its tag, the published digest, whether the tag already pointed at byte-identical content, whether a publication was signed, and its `reach`. A signing batch reports every reference signed with the digest its signature commits to, and a batch in which any reference failed comes back as a failure naming each one rather than as a result with a short list — a partial batch reported as a success is how a refusal comes to be read as a pass. A deprecation reports each marker with its own digest, since a marker is attached as an untagged referrer of the artifact it withdraws and nothing else addresses it. Signing or withdrawing a reference nothing published is refused rather than attached to nothing.

## When a call does not succeed

Where the answer arrives depends on one thing: whether the caller can fix it by changing the arguments of a tool that exists.

Everything that can be fixed that way comes back as the tool's own result, flagged as a failure and carrying the correction as its text — a combination of selectors the tool does not accept, a required argument left out, an argument sent as the wrong JSON type, a path that does not resolve, a diagnostic from the compiler. That is the channel an assistant is shown, so it reads what went wrong and calls again with the argument corrected.

The protocol's error channel is kept for what has no tool result to live in: a tool name the server does not serve, a request whose parameters it cannot read, a method it does not implement, and a message that is not valid JSON at all. Reading a resource and rendering a prompt answer there too, because neither of those results carries a failure flag of its own.

A tool's advertised schema also declares the rules its arguments must satisfy — which selectors are mutually exclusive, which argument is meaningful only alongside another, and which are required — so a client composing calls against the declared schema does not have to make the call to learn them.

## What stops the server

**Over standard input and output, closing the connection stops it.** The server reads one message per line and exits cleanly when its standard input reaches end of stream, so a client that closes the connection shuts the server down. That is the ordinary case on that transport, because you never launch the command yourself: the client that started it is what ends it, so quitting your editor, or disabling this server for a project, is what stopping it usually looks like.

**Asking the process itself to stop reaches the server on either transport.** An interrupt from a terminal, or a termination request from a supervisor or a container runtime, shuts it down on the first request, whether or not a client is sending anything: it stops accepting messages, ends the work a call in progress is doing, and exits cleanly. A second request ends the process at once. Over standard input and output a call still running when the process is asked to stop therefore does not finish; a listener instead drains, letting a call already being answered finish within a bounded budget before the process exits.

**A client can also stop one call without stopping the server, and how it does so is the transport's.** Calls are answered concurrently, so ending one is acted on while that call is still running rather than waiting behind it. Over standard input and output a client names the call's id; cancelling a call that has already been answered, or one the server is not working on, does nothing — which is what makes such a message safe to send without first knowing whether the answer is already on its way back. Over HTTP there is no message to send: closing the connection that carried the call ends it. Either way the work stops, nothing further is sent for that call, every other call in progress carries on, and the server keeps serving.

## When to use it

Use `aggrega mcp` when you want an AI assistant to help author Aggrega entities against the real schemas and reference — so its suggestions are grounded in the exact structure the compiler accepts rather than guessed. It fits the authoring loop directly: the assistant reads a kind's schema and reference, scaffolds a skeleton, fills the fields your role owns, and validates before handing the draft back. See [Getting Started with Authoring](../../authoring/getting-started.md) for that loop.

Over standard input and output you typically never type `aggrega mcp` yourself. Instead you name it once in your client's MCP configuration, and the client starts and stops it for you. A listener is the other case: there you run the process, and it keeps running for callers who did not start it.

## Example: client configuration over standard input and output

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
