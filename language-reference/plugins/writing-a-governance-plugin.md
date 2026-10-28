# Writing a governance plugin of your own

This page walks a governance plugin from the plugin development kit's adapter
skeleton to a build it refuses. You copy the skeleton, write one rule into it,
build the `.wasm`, call each of its exports by hand on the payload files the
skeleton ships, declare it as a `Plugin` entity in your workspace's own catalog,
attach it at a role, and watch it stop a build that breaks the rule.

It is the worked companion to [the governance socket](policy-socket.md), which
documents the four roles, the payload each carries and the verdicts the host acts
on, and to the [plugin developer guide](plugin-developer-guide.md), which
documents the `Plugin` entity and its lifecycle. [Authoring a
provider](authoring-a-provider-walkthrough.md) is the same kind of walk for a
provider guest.

**About the blocks on this page.** Every block showing output was copied from a
real run of the steps below, in the order they appear, following the
[output convention](../examples/reading-the-output.md): a block is either
complete, or an excerpt marking where lines were left out. Two placeholders stand
for absolute paths that differ on every machine: `<guest>` is the directory of
your copy of the skeleton, and `<workspace>` the directory of the workspace the
plugin is attached in.

## What you need

- The Go toolchain, which compiles to WebAssembly with no extra tooling.
- A checkout of the plugin development kit, which carries the skeleton, and of
  the ABI package the kit builds on: your copy's `go.mod` points at both.
- The `aggrega` binary.

The kit ships the same skeleton for Rust, at
`rust/examples/governance-adapter-skeleton`, and for TypeScript, at
`typescript/examples/governance-adapter-skeleton`. Each carries the same four
payload files, and an unmodified copy of each answers them the same way; every
`aggrega` command on this page applies to either one with its own artifact name,
and each one's README gives its build.

## The shape of the finished thing

A governance plugin is two artifacts, like any plugin: a `.wasm` guest, and a
`Plugin` entity that carries it into a catalog. Attaching it is one entry in the
workspace configuration. Nothing in the compiler changes.

The two directories this walkthrough ends with, less what a build writes into
the workspace:

```text
category-guard/          your copy of the skeleton: the Go module that compiles to the .wasm
  .gitignore
  README.md              the skeleton's own guide
  go.mod
  go.sum
  main.go                the describe() self-report and the shared plumbing
  evaluator.go           the seam, where the rule goes
  annotations.go         the annotation-transform role
  labels.go              the label-transform role
  verdicts.go            the ir-verdict and render-verdict roles
  build.sh
  annotation-payload.json
  label-payload.json
  ir-verdict-payload.json
  render-verdict-payload.json
  my-payload.json        a copy you edit in section 4
  wrong-payload.json     a copy you break in section 5
  overlay.yaml           the identity you supply to the entity generator
  dist/governance-adapter-skeleton-go.wasm   the compiled guest
shop/                    the workspace the plugin is attached in
  catalog/component/example/compute/api/1.0.0/component.yaml
  catalog/component/example/devtool/db-console/1.0.0/component.yaml
  catalog/recipe/compose/api/1.0.0/recipe.yaml
  catalog/recipe/compose/db-console/1.0.0/recipe.yaml
  catalog/plugin/governance/category-guard/0.1.0/plugin.yaml
  catalog/plugin/governance/category-guard/0.1.0/governance--category-guard.wasm
  aggregate.yaml
  manifest.yaml
  release.yaml
  .aggrega-config.yaml
```

The rule the plugin enforces is a common one: a workspace names the component
categories it does not ship — here `devtool`, the category of an administration
console — and a build carrying a component of one of them stops, naming it.

## 1. Copy the skeleton

```sh
cp -r /path/to/aggrega-pdk/go/examples/governance-adapter-skeleton category-guard
cd category-guard
```

The skeleton's `go.mod` reaches the kit and the ABI package by paths relative to
where it sits inside the kit, so a copy outside the kit names them itself. Give
the module a path of your own and point the two `replace` lines at your
checkouts:

```text
module example.com/category-guard

go 1.26.0

require (
	github.com/aggrega-ai/aggrega-abi-go v0.0.0
	github.com/aggrega-ai/aggrega-pdk-go v0.0.0
	github.com/extism/go-pdk v1.1.3
)

replace github.com/aggrega-ai/aggrega-pdk-go => /path/to/aggrega-pdk/go

replace github.com/aggrega-ai/aggrega-abi-go => /path/to/aggrega-abi/go
```

The skeleton's `go.sum` stays as it is.

## 2. Build it, and call each role by hand

Build the copy before changing anything, so the first thing you run is wiring
you did not write:

```sh
./build.sh
```

```text
Wrote <guest>/dist/governance-adapter-skeleton-go.wasm
```

`aggrega plugin run-local` loads a guest from a path, checks that the export you
name is one the guest's `describe()` self-report declares — and, with `--type
governance`, that the guest reports itself as a governance plugin — calls it with
a payload you supply, and prints the answer. The skeleton ships one payload file per role,
each a small, valid input for its export. The payload is written as JSON; every
governance role's wire carries a binary encoding, so the command converts the
payload into it before calling the export and prints the export's answer as JSON.

```sh
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export transform_annotations --with @annotation-payload.json
```

```text
note: no Aggrega workspace was found from <guest>, so it is used as the workspace root; pass --workspace-root naming your workspace, or run the command inside it
{
  "injections": []
}
```

The note says the command found no workspace around the directory it ran in.
`run-local` reads its guest and its payload from the paths you give it and needs
no workspace, so the note changes nothing here; it is left out of the blocks
below.

```sh
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export mutate --with @label-payload.json
```

```text
[… omitted: the note naming the directory used as the workspace root]
{
  "patches": []
}
```

```sh
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export verdict_ir --with @ir-verdict-payload.json
```

```text
[… omitted: the note naming the directory used as the workspace root]
{
  "results": [
    {
      "severity": "info",
      "message": "this adapter has no policy engine yet: the seam received rules.policy (43 bytes) and some settings"
    }
  ]
}
```

```sh
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export verdict_render --with @render-verdict-payload.json
```

```text
[… omitted: the note naming the directory used as the workspace root]
{
  "results": [
    {
      "severity": "info",
      "message": "this adapter has no policy engine yet: the seam received rules.policy (43 bytes) and some settings"
    }
  ]
}
```

Each answer is the shape its role is allowed to return: annotations to add, label
changes, and verdicts. The two transform roles return nothing, and each verdict
role returns one `info` verdict — a note that records an observation and leaves a
build's outcome unchanged. That note is the skeleton's proof of wiring. Each
payload file carries an attachment's two inputs as a build hands them over: one
policy file, `rules.policy`, under `sources`, and a `settings` object. The note
says both reached the seam — the one function the rest of the skeleton calls with
whatever the role received.

Here is the payload the rule below will read, `ir-verdict-payload.json`, complete:

```json
{
  "graph": {
    "apiVersion": "aggrega.ai/v1alpha1",
    "kind": "IR",
    "metadata": {
      "aggregate_name": "shop"
    },
    "spec": {
      "nodes": {
        "api": {
          "component": "example/compute/api",
          "resolved_version": "1.0.0",
          "labels": {
            "component.aggrega.ai/type": "server",
            "component.aggrega.ai/category": "compute"
          }
        }
      },
      "edges": [],
      "values_mapping": {},
      "infra_mapping": {},
      "feature_values_mapping": {},
      "provenance": {
        "schema_version": "aggrega.ai/v1alpha1",
        "compiler_version": "0.0.0",
        "aggregate_version": "1.0.0",
        "manifest_version": "1.0.0",
        "release_version": "1.0.0"
      }
    }
  },
  "precalculated_paths": [],
  "sources": [
    {
      "path": "rules.policy",
      "content": "policy text, handed to the engine verbatim\n"
    }
  ],
  "settings": {
    "max_nodes": 50
  }
}
```

It is the `ir-verdict` role's input: a build graph with one component in it,
the routing paths enumerated over the graph, and the attachment's `sources` and
`settings`. Every field is described on the role's reference page,
[the policy socket schema](../schema/plugins/wasm-policy.md), with the graph
itself on [the build graph schema](../schema/other/ir.md); the other three
files follow [the annotation-transform schema](../schema/plugins/wasm-annotation-transform.md),
[the mutator schema](../schema/plugins/wasm-mutator.md) and, for `verdict_render`,
the policy socket schema's `RenderPolicyInput`.

## 3. Write one rule

The rule lives in `evaluator.go`, the skeleton's seam. Every role decodes its
payload, writes it out as a JSON document, and calls `Evaluate` with the
attachment's policy files, its settings, that document, and the name of the
decision it wants back. The verdict roles ask for three decisions in turn —
`deny`, `warn` and `audit` — and report each one's answers at the severity
`halt`, `warn` and `info`; the two transform roles ask for `annotations` and
`labels`. So a rule that stops a build answers `deny`.

Replace `evaluator.go` with:

```go
package main

import (
	"encoding/json"
	"fmt"
	"slices"
	"sort"
)

// Program is one policy program the attachment carried.
type Program struct {
	Path string
	Text string
}

// categoryLabel is the label a catalog Component states its category in.
const categoryLabel = "component.aggrega.ai/category"

// Evaluate refuses every component whose category the attachment's settings
// list under forbidden_categories.
func Evaluate(programs []Program, settings json.RawMessage, payload json.RawMessage, decision string) ([]json.RawMessage, error) {
	if decision != denyDecision {
		return nil, nil
	}

	var config struct {
		ForbiddenCategories []string `json:"forbidden_categories"`
	}
	if len(settings) > 0 {
		if err := json.Unmarshal(settings, &config); err != nil {
			return nil, fmt.Errorf("reading the settings: %w", err)
		}
	}

	var input struct {
		Graph struct {
			Spec struct {
				Nodes map[string]struct {
					Labels map[string]string `json:"labels"`
				} `json:"nodes"`
			} `json:"spec"`
		} `json:"graph"`
	}
	if err := json.Unmarshal(payload, &input); err != nil {
		return nil, fmt.Errorf("reading the build graph: %w", err)
	}

	// A Go map has no order, so the node ids are sorted: identical input must
	// yield an identical sequence of decisions.
	ids := make([]string, 0, len(input.Graph.Spec.Nodes))
	for id := range input.Graph.Spec.Nodes {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	var decisions []json.RawMessage
	for _, id := range ids {
		category := input.Graph.Spec.Nodes[id].Labels[categoryLabel]
		if !slices.Contains(config.ForbiddenCategories, category) {
			continue
		}
		message, err := json.Marshal(fmt.Sprintf(
			"component %q is a %s component, and this workspace ships none", id, category))
		if err != nil {
			return nil, err
		}
		decisions = append(decisions, message)
	}
	return decisions, nil
}
```

`Program` stays, because the role files build their list of programs with it.
The rest is the rule, and four things in it are worth reading closely.

- **It reads the payload under the names the wire gives it.** The nodes are at
  `graph.spec.nodes`, keyed by node id, each with its `labels` — the same path
  [What each role's payload exposes](policy-socket.md#what-each-roles-payload-exposes)
  gives a Rego policy as `input.graph.spec.nodes`. A rule written for this role
  reads nothing at the others: the `render-verdict` payload carries no graph, so
  there the loop finds no node.
- **What it forbids is the operator's, not the plugin's.** The categories come
  from the attachment's `settings`, so the same `.wasm` serves a workspace that
  forbids `devtool` and one that forbids nothing.
- **It sorts before it answers.** A build's output is byte-identical across runs
  of identical input, and a guest that answered in a Go map's order would break
  that from inside.
- **It fails loudly.** Settings or a payload it cannot read return an error
  rather than an empty list, and the role turns that error into a failed call. An
  empty list is a policy that found nothing to say; a failed call is one that did
  not run, and a build tells the two apart only if the guest does.

The rule never reads `programs`. This plugin's rule is compiled into the guest,
so an attachment supplies settings and no policy file — the same shape as a guest
built around a precompiled engine, and the opposite of one that loads its rules
from `sources`.

Last, say what the plugin is. In `main.go`, change the description in
`descriptor()`:

```go
		Description: "Refuse a build that carries a component of a category the attachment forbids.",
```

The entity generator in section 6 copies it into the `Plugin` entity.

## 4. Build again, and read the rule's answer

```sh
./build.sh
```

```text
Wrote <guest>/dist/governance-adapter-skeleton-go.wasm
```

Call the four exports again on the same files:

```sh
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export transform_annotations --with @annotation-payload.json
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export mutate --with @label-payload.json
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export verdict_ir --with @ir-verdict-payload.json
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export verdict_render --with @render-verdict-payload.json
```

```text
[… omitted: the note naming the directory used as the workspace root]
{
  "injections": []
}
[… omitted: the note naming the directory used as the workspace root]
{
  "patches": []
}
[… omitted: the note naming the directory used as the workspace root]
{
  "results": []
}
[… omitted: the note naming the directory used as the workspace root]
{
  "results": []
}
```

The placeholder note is gone from both verdict roles, and neither returns a
verdict: the shipped payload's `settings` forbid no category, so the rule allows
it. An empty `results` list is how a verdict role says the build may proceed.

To see the rule fire, give it settings that forbid what the payload carries.
Copy `ir-verdict-payload.json` to `my-payload.json` and replace its `settings`
with:

```json
  "settings": {
    "forbidden_categories": [
      "compute"
    ]
  }
```

```sh
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export verdict_ir --with @my-payload.json
```

```text
[… omitted: the note naming the directory used as the workspace root]
{
  "results": [
    {
      "severity": "halt",
      "message": "component \"api\" is a compute component, and this workspace ships none"
    }
  ]
}
```

The `deny` decision arrives as a `halt` verdict carrying the rule's own message.
In a build, a `halt` stops it with that message as the reason.

## 5. When a payload does not fit

The command converts each field the payload carries into the type its shape
declares, and refuses a field it cannot convert before the guest runs. Write a
node's `labels` as a list instead of an object, in a copy named
`wrong-payload.json`:

```json
          "labels": [
            "server",
            "compute"
          ]
```

```sh
aggrega plugin run-local --plugin dist/governance-adapter-skeleton-go.wasm \
  --type governance --export verdict_ir --with @wrong-payload.json
```

```text
under key "api": expected JSON object, found [
```

The command exits non-zero, and the guest is never called.

The conversion checks the type of every field the payload carries; it does not
check that the payload carries every field the shape requires. A payload missing
one is converted and handed to the guest all the same, and a guest whose rule
reads that field finds nothing there. So check a payload you write by hand against
its schema reference page: the command's silence does not say the payload is
complete.

## 6. Declare it as a `Plugin` entity in your workspace's catalog

The entity's contract fields are read out of the guest rather than written by
hand, so the entity cannot claim an export the binary does not have. You supply
the identity in a small overlay, `overlay.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: category-guard
```

```sh
aggrega plugin gen-catalog --plugin dist/governance-adapter-skeleton-go.wasm \
  --overlay overlay.yaml --output-dir ../shop/catalog/plugin
```

```text
[… omitted: the note naming the directory used as the workspace root]
generated ../shop/catalog/plugin/governance/category-guard/0.1.0/plugin.yaml
```

The generated entity:

```yaml
# Generated from the plugin by `aggrega plugin gen-catalog`. You may narrow its capability lists; edit nothing else here.
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: category-guard
  version: 0.1.0
  pluginType: governance
  description: Refuse a build that carries a component of a category the attachment forbids.
spec:
  abiVersion: v1alpha1
  exports:
    - name: transform_annotations
    - name: mutate
    - name: verdict_ir
    - name: verdict_render
```

`version` is the one the skeleton's `build.sh` stamps into the guest, `0.1.0`
unless `AGGREGA_PLUGIN_VERSION` names another; `pluginType` and the four exports
are what `describe()` reports. A governance plugin declares no capabilities: what
it may return comes from the role it is attached at, not from the entity.

While you develop a plugin there is nothing published to fetch, so a build reads
it from a catalog directory, with the `.wasm` beside its entity. The file beside
the entity is named from the entity's plugin type and name, in the directory the
entity's document sits in — for `governance/category-guard`,
`governance--category-guard.wasm`:

```sh
cp dist/governance-adapter-skeleton-go.wasm \
  ../shop/catalog/plugin/governance/category-guard/0.1.0/governance--category-guard.wasm
```

Copy the file rather than linking to it. A link in that place is followed only to
somewhere inside the workspace — or, for a catalog directory listed outside the
workspace, somewhere inside that directory; one leading further stops the build
and the pull naming the link, as
[the workspace boundary](../cli/workspace-boundary.md#halted) sets out. A pull that finds no `.wasm` under that name stops and names the file it
expected, as [A plugin's `.wasm` is not on this machine](../errors/fatal-halts.md#a-plugins-wasm-is-not-on-this-machine)
describes.

## 7. The workspace the plugin guards

The workspace is a small shop: an API, and the documents that build it with
Docker Compose. Its catalog also carries the administration console the rule will
refuse, a Component whose category is `devtool`.

`catalog/component/example/compute/api/1.0.0/component.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: example/compute/api
  version: 1.0.0
  description: The shop's HTTP API.
  labels:
    component.aggrega.ai/type: server
    component.aggrega.ai/category: compute
spec:
  schema:
    infra:
      port:
        type: integer
        default: 8080
        description: The port the API listens on.
```

`catalog/component/example/devtool/db-console/1.0.0/component.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: example/devtool/db-console
  version: 1.0.0
  description: A database administration console in the browser.
  labels:
    component.aggrega.ai/type: server
    component.aggrega.ai/category: devtool
spec:
  schema:
    infra:
      port:
        type: integer
        default: 8081
        description: The port the console listens on.
```

`catalog/recipe/compose/api/1.0.0/recipe.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api
  version: 1.0.0
  description: Runs the API as a Docker Compose service.
spec:
  capability: compose
  implements: example/compute/api:1.0.0
  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    containers:
      main:
        image: "registry.example.com/shop/api:1.0.0"
        ports:
          http: {{ .infra.port }}
```

`catalog/recipe/compose/db-console/1.0.0/recipe.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: db-console
  version: 1.0.0
  description: Runs the database console as a Docker Compose service.
spec:
  capability: compose
  implements: example/devtool/db-console:1.0.0
  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    containers:
      main:
        image: "adminer:4"
        ports:
          http: {{ .infra.port }}
```

`aggregate.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: shop
  version: "1.0.0"
  description: The shop's API.
spec:
  components:
    api:
      type: example/compute/api
```

`manifest.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: shop-manifest
  version: "1.0.0"
  description: Binds each component type to its Docker Compose recipe.
spec:
  mappings:
    components:
      type:
        example/compute/api:1.0.0: api:1.0.0
        example/devtool/db-console:1.0.0: db-console:1.0.0
```

`release.yaml`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: shop-staging
  environment: staging
  version: "1.0.0"
spec:
  aggregate: shop
  manifest: shop-manifest
  components:
    api: {}
```

## 8. Attach it, and build

An operator attaches a governance plugin in the workspace configuration, naming
the role and the attachment's settings. `.aggrega-config.yaml`:

```yaml
workspace:
  catalog_dirs:
    - catalog
auto_pull: true
plugins:
  governance:
    - uri: governance/category-guard:0.1.0
      role: ir-verdict
      with:
        settings:
          forbidden_categories:
            - devtool
```

The `uri` names the entity by its plugin type, name and version. The role is
`ir-verdict`, so the host calls `verdict_ir` with the build graph once the graph
is built and before anything is rendered. `auto_pull` lets the build resolve the
Release itself, so the first build needs no separate step.

```sh
cd ../shop
aggrega build --release release.yaml
```

```text
warning: plugin "governance/category-guard" resolved from local with no recorded digest to check it against, so it runs unverified; it is read from beside its Plugin entity in a catalog directory on every build, and a pull records its digest only for a plugin attached at a transform role; otherwise publish the plugin and reference the published entity to have its digest recorded
Pull complete: release.lock (entities=7, source_artifacts=0, external_inputs=0)
[… omitted: a line reporting total build time, which differs on every run]
Build completed: 1 files written to <workspace>/dist
```

The shop carries no `devtool` component, so the rule allows the build, and
Compose output lands in `dist/compose/docker-compose.yaml`.

**The warning is expected, and it stays while the plugin is local.** It says the
guest ran with no recorded content digest to check it against — the truth of a
guest built a minute ago and read from beside its entity on every build. A plugin
attached at a verdict role shapes no output, so a pull records no digest for it
from a catalog directory; publishing the plugin and referencing the published
entity is what records one.

## 9. Plant a violation

Add the administration console to the Aggregate, and place it in the Release:

```yaml
spec:
  components:
    api:
      type: example/compute/api
    console:
      type: example/devtool/db-console
```

```yaml
  components:
    api: {}
    console: {}
```

```sh
aggrega build --release release.yaml
```

```text
[… omitted: the unverified-plugin warning, and the pull's lines saying the Release could not be rendered to discover its external inputs, which carry the refusal below]
[POLICY_ERROR E0005]
  policy plugin "category-guard" rejected the build: component "console" is a devtool component, and this workspace ships none
  caused by: policy violation
```

The build stops before rendering anything, and writes no `dist/`. The message is
the rule's own sentence, headed with the plugin's name, so an author reading it
knows which component to remove and which policy asked for it. The plugin did not
remove the console, rename it, or render the build without it: a verdict role
accepts or rejects, and the host never applies its answer as a change.

## What to change next

- **More rules, or a policy language.** A rule written in Go is compiled into the
  guest. To load rules from files instead, read `programs` in `Evaluate` — the
  attachment's `sources`, each with its base name and its text — and hand them to
  an engine. [The ABI is Aggrega's own](policy-socket.md#the-abi-is-aggregas-own)
  describes a guest that wraps a foreign policy engine.
- **Other roles.** The same `Evaluate` serves every role; answering `annotations`
  or `labels` makes the plugin shape a build at a transform role. The decision
  shapes are in the skeleton's README, and what each role may change is in
  [the four roles](policy-socket.md#the-four-roles).
- **Fewer exports.** A plugin serving only `ir-verdict` deletes the other role
  files and their entries in `descriptor()`. An attachment that points a role at
  an export the guest does not declare is then refused by name, before the guest
  runs.
- **Typed settings.** A guest may declare a JSON Schema for its settings in
  `describe()`, and the host then validates an attachment's settings against it
  before the guest runs; see [Typed settings](policy-socket.md#typed-settings).
- **Publishing**, which turns the catalog-directory arrangement into a
  digest-pinned artifact a Release resolves and verifies. The
  [plugin developer guide](plugin-developer-guide.md) covers that lifecycle.

## Related references

- [The governance socket](policy-socket.md) — the four roles, their payloads,
  the verdict severities and how an operator attaches a plugin.
- [Plugin contract](plugin-contract.md) — every socket's input and output shapes,
  and the encoding each carries.
- [Wasm plugin developer guide](plugin-developer-guide.md) — the `Plugin` entity,
  the capability surface and the publish lifecycle.
- [Authoring a provider](authoring-a-provider-walkthrough.md) — the same walk for
  a provider guest.
- [Reading the output on these pages](../examples/reading-the-output.md) — the
  convention the output blocks above follow.
