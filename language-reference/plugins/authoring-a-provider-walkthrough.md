# Authoring a provider: a worked walkthrough

This page walks the whole task of authoring a provider guest, from an empty
directory to a build that writes files the provider rendered. It is the worked
companion to the [plugin developer guide](plugin-developer-guide.md), which
documents the entity and the lifecycle, and to the
[plugin contract](plugin-contract.md), which documents the sockets.

The provider built here is small enough to read in one sitting and does real
work: it renders environment files. That target is a good first provider
because its translation is genuinely format-specific — an environment file has
its own key grammar, its own quoting rules, and no metadata block to put build
provenance in — so the guest has to make every decision a larger provider
makes, without a large body of code hiding them.

**About the blocks on this page.** Every block showing output was copied from a
real run of the steps below, in the order they appear, following the
[output convention](../examples/reading-the-output.md): a block is either
complete, or an excerpt marking where lines were left out. This is a
walkthrough you assemble yourself rather than a workspace you can clone, so the
source blocks are the files to create rather than files to check out.

## What you need

- The Go toolchain, which compiles to WebAssembly with no extra tooling.
- A checkout of the plugin development kit, which the
  [plugin developer guide](plugin-developer-guide.md) introduces.
- The `aggrega` binary.

## The shape of the finished thing

A provider is two artifacts: a `.wasm` guest, and a `Plugin` entity that carries
it into a catalog. Nothing else — no host change, no registration, no compiler
build. Adding a provider is adding those two files where a build can see them.

The workspace this walkthrough ends with:

```
dotenv-walkthrough/
  guest/                  the Go module that compiles to the .wasm
    go.mod
    main.go
  catalog/                the Component and Recipe you author
    component/example/compute/checkout/1.0.0/component.yaml
    recipe/dotenv/checkout/1.0.0/recipe.yaml
  dev-catalog/            the generated Plugin entity, with the .wasm beside it
    plugin/provider/dotenv/0.1.0/plugin.yaml
    plugin/provider/dotenv/0.1.0/provider--dotenv.wasm
  dotenv.wasm             the compiled guest
  overlay.yaml            the identity you supply to the entity generator
  aggregate.yaml
  manifest.yaml
  release.yaml
  .aggrega-config.yaml
```

## 1. The guest's self-report

Every plugin exports `describe()`. The host calls it once when it loads the
guest and reads the answer as the guest's own account of what it is. For a
provider, four parts of that answer matter.

Create `guest/main.go`:

```go
// A provider guest that renders environment-file artifacts.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	pdk "github.com/extism/go-pdk"

	"github.com/aggrega-ai/aggrega-pdk-go/pkg/aggrega"
)

func descriptor() aggrega.PluginDescriptor {
	return aggrega.PluginDescriptor{
		AbiVersion:   aggrega.APIVersion,
		PluginType:   "provider",
		Description:  "Render artifact bodies into environment files, quoting and escaping each value as the format requires.",
		Capabilities: []string{"dotenv"},
		Exports: []aggrega.PluginExport{
			{Name: "render_node"},
		},
		Metadata: &aggrega.PluginDescriptorMeta{License: "Apache-2.0"},
	}
}

//go:wasmexport describe
func describe() int32 {
	out, err := aggrega.MarshalDescriptor(descriptor())
	if err != nil {
		pdk.SetError(err)
		return 1
	}
	pdk.Output(out)
	return 0
}
```

`PluginType` says which socket this guest serves. `Capabilities` is the list a
Recipe resolves against: a Recipe whose `spec.capability` is `dotenv` will be
routed to this guest. `Exports` names the entry points the host may dispatch
to; `render_node` is the one every provider must have.

This descriptor is deliberately incomplete, in the way a first draft usually
is. The first build below is where that shows up.

## 2. Rendering a node

`render_node` is called once per component the build renders through this
provider. It receives the node's identity, the render context, and whichever
pre-evaluated inputs the bound Recipe declared — here, an artifact set the host
has already read and evaluated as a template.

The guest's whole job is to decide what bytes come out. Add to `guest/main.go`:

```go
// needsQuoting reports whether a value cannot be written bare in an
// environment file. A bare value ends at the first space, so anything
// carrying whitespace has to be quoted; the quote characters, the comment
// introducer and the expansion introducer would each be read as syntax.
func needsQuoting(v string) bool {
	if v == "" {
		return true
	}
	return strings.ContainsAny(v, " \t\n\r\"'#$\\")
}

// quote wraps a value in double quotes and escapes what the format reads as
// syntax inside them. Order matters: the backslash is escaped first, or the
// escapes introduced afterwards would be escaped a second time.
func quote(v string) string {
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, `"`, `\"`)
	v = strings.ReplaceAll(v, "\n", `\n`)
	v = strings.ReplaceAll(v, "\r", `\r`)
	v = strings.ReplaceAll(v, "\t", `\t`)
	return `"` + v + `"`
}

// normaliseKey maps an authored key into the environment-variable grammar:
// upper case, with the separators an author reaches for folded to
// underscores. It reports an error rather than correcting a key that still
// does not fit, because a silently-renamed variable is one the application
// never reads.
func normaliseKey(k string) (string, error) {
	n := strings.ToUpper(k)
	n = strings.NewReplacer("-", "_", ".", "_", "/", "_").Replace(n)
	if n == "" {
		return "", fmt.Errorf("empty key")
	}
	for i, r := range n {
		switch {
		case r >= 'A' && r <= 'Z', r == '_':
		case r >= '0' && r <= '9' && i > 0:
		default:
			return "", fmt.Errorf("key %q maps to %q, which is not a valid environment-variable name", k, n)
		}
	}
	return n, nil
}
```

Three decisions in that fragment are the provider's own, and no other layer
could make them. Which characters force quoting is a fact about environment
files. So is the variable-name grammar, and so is the choice to **refuse** a
key that does not fit rather than rename it — a renamed variable is one the
application will look for and not find, which is worse than a halted build.

Now the two remaining pieces: where provenance goes, and the export itself.

```go
// provenanceComment renders the build-provenance key set the host computed as
// comment lines. An environment file has no metadata block, so a comment
// header is where provenance can go; the keys are emitted in sorted order so
// the bytes are identical across runs of identical input.
func provenanceComment(annotations map[string]string) []byte {
	if len(annotations) == 0 {
		return nil
	}
	keys := make([]string, 0, len(annotations))
	for k := range annotations {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var out bytes.Buffer
	for _, k := range keys {
		fmt.Fprintf(&out, "# %s=%s\n", k, annotations[k])
	}
	out.WriteByte('\n')
	return out.Bytes()
}

// renderBody translates one artifact body into environment-file lines. A
// blank line and a comment pass through untouched; every other line is
// KEY=value, and a line carrying no separator is a loud failure rather than a
// line the guest guesses at.
func renderBody(name string, body []byte) ([]byte, error) {
	var out bytes.Buffer
	for i, raw := range strings.Split(string(body), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, found := strings.Cut(line, "=")
		if !found {
			return nil, fmt.Errorf("%s line %d: %q declares no value; an entry is KEY=value", name, i+1, line)
		}
		key, err := normaliseKey(strings.TrimSpace(k))
		if err != nil {
			return nil, fmt.Errorf("%s line %d: %w", name, i+1, err)
		}
		val := strings.TrimSpace(v)
		if needsQuoting(val) {
			val = quote(val)
		}
		fmt.Fprintf(&out, "%s=%s\n", key, val)
	}
	return out.Bytes(), nil
}

//go:wasmexport render_node
func render_node() int32 {
	var in aggrega.RenderNodeInput
	if err := json.Unmarshal(pdk.Input(), &in); err != nil {
		pdk.SetError(fmt.Errorf("dotenv: unmarshal RenderNodeInput: %w", err))
		return 1
	}

	if in.ArtifactsProjection == nil || len(in.ArtifactsProjection.Entries) == 0 {
		pdk.SetError(fmt.Errorf("dotenv: node %q supplied no artifacts to render", in.Node.ID))
		return 1
	}

	var files []aggrega.RenderedFile
	for _, e := range in.ArtifactsProjection.Entries {
		body, err := renderBody(e.Name, e.Content)
		if err != nil {
			pdk.SetError(fmt.Errorf("dotenv: %w", err))
			return 1
		}
		files = append(files, aggrega.RenderedFile{
			Path:    e.Name,
			Content: append(provenanceComment(e.Annotations), body...),
			Format:  "text",
		})
	}

	outputBytes, err := json.Marshal(aggrega.RenderNodeOutput{Files: files})
	if err != nil {
		pdk.SetError(fmt.Errorf("dotenv: marshal RenderNodeOutput: %w", err))
		return 1
	}
	pdk.Output(outputBytes)
	return 0
}

func main() {}
```

**The host hands the guest content it has already evaluated.** Each artifact
entry's `Content` is the authored body with its template expressions already
resolved against the render context — the guest never evaluates a template and
never reads a file. That is what keeps the compiler's ahead-of-time boundary
intact: the guest is a pure function from the payload to bytes.

**Determinism is the guest's responsibility.** Nothing checks it for you on an
ordinary build. Here it comes from sorting the provenance keys before emitting
them and from walking the artifact entries in the order the payload carries,
and the checks near the end of this page measure the result.

`guest/go.mod` references your checkout of the kit:

```
module example.com/dotenv-provider

go 1.26.0

require (
	github.com/aggrega-ai/aggrega-pdk-go v0.0.0
	github.com/extism/go-pdk v1.1.3
)

require github.com/aggrega-ai/aggrega-abi-go v0.0.0 // indirect

replace github.com/aggrega-ai/aggrega-pdk-go => /path/to/aggrega-pdk/go

replace github.com/aggrega-ai/aggrega-abi-go => /path/to/aggrega-abi/go
```

## 3. Build the guest

A guest is an ordinary Go build with the WebAssembly target selected:

```sh
cd guest
GOWORK=off GOOS=wasip1 GOARCH=wasm go build -trimpath -buildvcs=false \
  -ldflags "-X github.com/aggrega-ai/aggrega-pdk-go/pkg/aggrega.Version=0.1.0 \
            -X github.com/aggrega-ai/aggrega-pdk-go/pkg/aggrega.Commit=walkthru" \
  -buildmode=c-shared -o ../dotenv.wasm ./
```

`-trimpath` and `-buildvcs=false` keep build-path and version-control stamps
out of the binary, so the same source at the same commit produces the same
bytes. The two `-ldflags` values stamp the guest's own version into it, which
the next step reads.

Confirm the exports before going further:

```sh
aggrega inspect --plugin dotenv.wasm
```

```text
Plugin .wasm: dotenv.wasm
Exports:
  render_node
hostFunctions (derived from binary, not yet stamped): (none)
```

This guest imports no host functions, which is the least-privilege default: it
needs neither the filesystem nor the network, because everything it renders
arrives in the payload.

## 4. Generate the Plugin entity

The entity's contract fields are not written by hand — they are read out of the
guest so the entity cannot promise something the binary does not do. You supply
only the identity, in a small overlay.

`overlay.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: dotenv
```

```sh
aggrega plugin gen-catalog --plugin dotenv.wasm \
  --overlay overlay.yaml --output-dir dev-catalog/plugin
```

```text
generated dev-catalog/plugin/provider/dotenv/0.1.0/plugin.yaml
```

The generated entity:

```yaml
# generated; DO NOT EDIT
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: dotenv
  version: 0.1.0
  pluginType: provider
spec:
  abiVersion: v1alpha1
  exports:
    - name: render_node
  provider:
    capabilities:
      - dotenv
```

Note what is **not** there: any pointer to the `.wasm`. A plugin's location is
derived from its identity — the `pluginType`/`name` coordinate plus whichever
registry is configured — so there is no location field to author and none to
get wrong. The content digest is recorded when a Release is resolved, in that
Release's lockfile, not in the entity.

## 5. Put the guest where a build will look for it

While you are developing a guest there is nothing published to fetch, so the
build reads it from a catalog directory: the `.wasm` sitting **beside** its
entity, named for the socket and the plugin.

```
dev-catalog/plugin/provider/dotenv/0.1.0/plugin.yaml
dev-catalog/plugin/provider/dotenv/0.1.0/provider--dotenv.wasm
```

```sh
cp dotenv.wasm dev-catalog/plugin/provider/dotenv/0.1.0/provider--dotenv.wasm
```

The filename carries the socket as well as the name because a bare plugin name
is unique only within its own socket — two plugins called `dotenv` at different
sockets have to reach two files.

Copy the built file there rather than linking to it. A link in that place is
followed only to somewhere inside the workspace — or, for a catalog directory
listed outside the workspace, somewhere inside that directory; one leading
further stops the build and the pull naming the link, as
[the workspace boundary](../cli/workspace-boundary.md#halted) sets out.

A provider's plugin entity in a catalog directory is never pinned, and neither a
pull nor a build fetches its `.wasm`, so the file has to be there when the Release is resolved. A pull checks
before it writes the lockfile: where it finds the `.wasm` neither beside the entity
nor anywhere else a build reads plugins from, it stops and names the file and
the directory it expected, as
[A plugin's `.wasm` is not on this machine](../errors/fatal-halts.md#a-plugins-wasm-is-not-on-this-machine)
describes.

Point the workspace at both catalog directories in `.aggrega-config.yaml`:

```yaml
workspace:
  catalog_dirs:
    - catalog
    - dev-catalog
auto_pull: true
```

`auto_pull` lets `aggrega build` resolve the Release in-process, so a first
build needs no separate resolve step.

## 6. The documents that target the provider

Four files. The Component declares what an author may set; the Recipe binds the
capability and authors the artifact; the Aggregate states the intent; the
Release places it.

`catalog/component/example/compute/checkout/1.0.0/component.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: example/compute/checkout
  version: 1.0.0
  description: An application whose configuration is delivered as an environment file.
  labels:
    component.aggrega.ai/type: server
    component.aggrega.ai/category: compute
spec:
  schema:
    values:
      service_name:
        type: string
        default: checkout
        description: The name the application reports itself under.
      log_level:
        type: string
        default: info
        description: The application's log verbosity.
      greeting:
        type: string
        default: hello
        description: A value carrying characters the environment-file format must quote.
    infra:
      endpoint:
        type: string
        default: http://localhost:8080
        description: The endpoint the operator points the application at.
```

`catalog/recipe/dotenv/checkout/1.0.0/recipe.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: checkout
  version: 1.0.0
  description: Renders the application's configuration as an environment file.
spec:
  capability: dotenv
  implements: example/compute/checkout:1.0.0

  artifacts:
    app.env: |
      service-name = {{ .values.service_name }}
      log.level = {{ .values.log_level }}
      greeting = {{ .values.greeting }}
      endpoint = {{ .infra.endpoint }}
```

`spec.capability: dotenv` is the whole binding. It names a capability, not a
plugin: the build resolves it to whichever provider plugin declares that
capability. Where exactly one does — as here — nothing else is needed.

The authored keys are deliberately not in environment-variable form.
`service-name` and `log.level` are the spellings an author would naturally
write, and normalising them is the provider's job.

`aggregate.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: aggregate
  version: "1.0.0"
  description: One application whose configuration is an environment file.
spec:
  components:
    app:
      type: example/compute/checkout
      values:
        service_name: checkout
        log_level: debug
        greeting: hello world
```

`manifest.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: manifest
  version: "1.0.0"
  description: Binds the component type to the environment-file recipe.
spec:
  mappings:
    components:
      type:
        example/compute/checkout:1.0.0: checkout:1.0.0
```

`release.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: walkthrough
  environment: production
  version: "1.0.0"
spec:
  aggregate: aggregate
  manifest: manifest
  boundaries:
    infra:
      directory: infra
      components:
        app:
          infra:
            endpoint: "https://checkout.example.net"
```

## 7. The first build, and what it refuses

```sh
aggrega build --release release.yaml --auto-pull
```

```text
Pull complete: release.lock (entities=5, source_artifacts=0)
warning: plugin "provider/dotenv" resolved from local with no recorded digest to check it against, so it runs unverified; it is read from beside its Plugin entity in a catalog directory on every build, and a pull records its digest only for a plugin attached at a transform role; otherwise publish the plugin and reference the published entity to have its digest recorded
[CATALOG_ERROR E0265] app
  provider does not support the node's input kind (node "app"). provider "dotenv" does not support artifacts-only recipes (this provider supports: none); declare one of the supported input kinds, or target a provider that supports artifacts-only
```

Read the two lines separately, because they say different things.

**The warning is expected while you develop, and it will not go away.** It says
the guest ran without a recorded content digest to check it against, which is
the truth of a guest you built a minute ago: nothing published it, so there is
no digest on record. It also says why resolving the Release again would not
change that — a guest read from beside its entity in a catalog directory is read
afresh by every build, and a pull records its digest only for a governance
plugin attached at a transform role, which this guest is not — and what would: publishing
the plugin and referencing the published entity. Read the warning as the build
correctly declining to claim a verification it did not perform, and expect it
for as long as the guest is local.

**The error is the real finding, and the parenthesis is the diagnosis.** The
provider was found, loaded and asked what it renders, and it answered
`none` — `this provider supports: none`. The descriptor written at the start
named the socket, the capability and the exports, but never said which of the
three Recipe input kinds the guest handles. The host will not guess: the input-kind
gate reads the guest's declared set and refuses a node the guest never claimed.

This is the shape of most first-provider failures. The guest is fine; its
self-report is incomplete. `describe()` is not a formality the host tolerates —
it is the whole basis on which a format-blind host decides what to send where.

## 8. Declare the render-behaviour contract

Add the contract to the descriptor in `guest/main.go`:

```go
		Capabilities: []string{"dotenv"},
		Contract: &aggrega.ProviderContract{
			InputKinds: aggrega.InputKinds{
				Sourced:             false,
				Synthesized:         false,
				ArtifactsStandalone: true,
			},
			BoundaryAssembly: "none",
		},
		Exports: []aggrega.PluginExport{
```

`ArtifactsStandalone: true` is the claim the gate was looking for. The two
`false` values are claims as well, and stating them is the point: a Recipe that
vendors a source tree, or one that declares a workload, is now refused before
any render runs, with a message naming this provider — rather than reaching
`render_node` and failing somewhere inside it.

`BoundaryAssembly: "none"` says each node's output is written where it lands,
with nothing to combine. A provider that folds several components into one
document declares `merge` or `nest` instead, and exports `assemble_boundary` to
do it. That is the natural next thing to add to this provider, and it is
documented in the [plugin contract](plugin-contract.md).

Rebuild the guest, regenerate the entity, and put the new `.wasm` back beside
it:

```sh
cd guest
GOWORK=off GOOS=wasip1 GOARCH=wasm go build -trimpath -buildvcs=false \
  -ldflags "-X github.com/aggrega-ai/aggrega-pdk-go/pkg/aggrega.Version=0.1.0 \
            -X github.com/aggrega-ai/aggrega-pdk-go/pkg/aggrega.Commit=walkthru" \
  -buildmode=c-shared -o ../dotenv.wasm ./
cd ..
aggrega plugin gen-catalog --plugin dotenv.wasm \
  --overlay overlay.yaml --output-dir dev-catalog/plugin
cp dotenv.wasm dev-catalog/plugin/provider/dotenv/0.1.0/provider--dotenv.wasm
```

The regenerated entity now carries the contract, read from the binary:

```yaml
spec:
  abiVersion: v1alpha1
  exports:
    - name: render_node
  provider:
    capabilities:
      - dotenv
    contract:
      inputKinds:
        artifactsStandalone: true
      boundaryAssembly: none
```

**Regenerating the entity after every guest rebuild is part of the loop.** The
entity restates what the binary reports, and the two are cross-checked when the
guest loads, so an entity left behind by a rebuild is a mismatch the build
halts on rather than a stale file nobody notices.

## 9. The build that renders

```sh
aggrega build --release release.yaml --auto-pull
```

```text
Pull complete: release.lock (entities=5, source_artifacts=0)
warning: plugin "provider/dotenv" resolved from local with no recorded digest to check it against, so it runs unverified; it is read from beside its Plugin entity in a catalog directory on every build, and a pull records its digest only for a plugin attached at a transform role; otherwise publish the plugin and reference the published entity to have its digest recorded
[… omitted: a line reporting total build time, which differs on every run]
Build completed: 1 files written to dist/
```

The rendered tree:

```text
dist/infra/dotenv/app/app.env
```

And the file the provider wrote, complete:

```text
# aggrega.ai/boundary-path=infra
# aggrega.ai/recipe-uri=checkout:1.0.0

SERVICE_NAME=checkout
LOG_LEVEL=debug
GREETING="hello world"
ENDPOINT=https://checkout.example.net
```

Every decision the guest makes is visible in those seven lines.

- `service-name` and `log.level` arrived as authored and left as
  `SERVICE_NAME` and `LOG_LEVEL`. The author never had to write the target's
  grammar.
- `GREETING` is quoted and the other three are not. `hello world` carries a
  space, so bare it would end at `hello`; the endpoint carries none of the
  characters the format reads as syntax, so quoting it would add noise.
- The two provenance keys are comments, because an environment file has
  nowhere else to put them. A provider whose output has a metadata block puts
  the same keys there instead. The host computed the keys; the guest chose
  the placement.
- The values came from two different authors. `service_name`, `log_level` and
  `greeting` are developer intent, from the Aggregate. `endpoint` is the
  operator's, from the Release. The guest saw neither distinction — it received
  one evaluated body.

## 10. Two things worth checking before you trust it

**That it is deterministic.** Capture the output, rebuild, and compare:

```sh
cp -r dist ../capture && rm -rf dist
aggrega build --release release.yaml
diff -r ../capture dist
```

`diff` printing nothing is the result you want. Determinism is the guest's
contract, not the host's, and a guest that iterates a Go map somewhere in its
output path will fail this while looking perfectly correct in a single build.

**That its refusals are loud.** Break one line of the Recipe's artifact, so it
declares no value:

```yaml
  artifacts:
    app.env: |
      service-name = {{ .values.service_name }}
      this line declares no value
```

```text
[CATALOG_ERROR] app
  rendering node "app"
  caused by: wasm: plugin "provider/dotenv:0.1.0" call to render_node: dotenv: app.env line 2: "this line declares no value" declares no value; an entry is KEY=value
```

The guest's own message reaches the author intact, with the file and the line
it came from. This is worth checking deliberately, because the alternative
failure — a guest that quietly skips a line it cannot parse — produces a build
that succeeds and a deployment missing a variable, and nothing in the output
says so.

## 11. What to add next

The provider built here is complete but minimal. In rough order of how often
each is wanted:

- **`assemble_boundary`**, to fold several components' output into one
  document, declared through `BoundaryAssembly`.
- **`validate_node_input`**, to check a node's input structurally before any
  render runs, so a malformed input is reported at the authoring boundary
  rather than mid-render.
- **Render facts**, to report something about what the guest wrote that only
  this provider's knowledge of the environment-file format can see — here, the
  variable names each file defines. A fact is a name and a list, both this
  provider's own vocabulary, returned beside the files — and the value is
  always a JSON array, even with one entry, or the build halts:

  ```go
  // names lists the variables the files define, in the order they were written.
  value, err := json.Marshal(names)
  if err != nil {
  	pdk.SetError(fmt.Errorf("dotenv: marshal render fact: %w", err))
  	return 1
  }
  out := aggrega.RenderNodeOutput{
  	Files:       files,
  	RenderFacts: []aggrega.RenderFact{{Name: "variable_names", Value: value}},
  }
  ```

  The compiler keeps the facts in the order the guest lists them, checks only
  that each value is a list, hands the lists to the Feature templates that read
  them, and writes the same files whether or not they are reported. Document each fact's name and what its entries hold as part of the
  provider's contract.
- **Publishing**, which turns the local `dev-catalog` arrangement into a
  digest-pinned artifact a Release resolves and verifies. The
  [plugin developer guide](plugin-developer-guide.md) covers that lifecycle,
  under the publish, pull and build stages.

Each socket's payload and result shapes are in the
[plugin contract](plugin-contract.md).

## Related references

- [Wasm plugin developer guide](plugin-developer-guide.md) — the `Plugin`
  entity, the capability surface, and the publish lifecycle.
- [Plugin contract](plugin-contract.md) — every socket's input and output
  shapes.
- [Provider architecture](../providers/architecture.md) — how providers fit
  into the compilation pipeline.
- [Provider reference index](../providers/reference-matrix.md) — what each
  standard-library provider produces.
- [Reading the output on these pages](../examples/reading-the-output.md) — the
  convention the output blocks above follow.
