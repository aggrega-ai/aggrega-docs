# The built-in tagging plugins

_Two governance plugins compiled into the CLI that write labels on a build's nodes without a policy to author: what each reads, what each writes, and an attachment of each with the labels it wrote._

The CLI carries two governance plugins that shape labels from configuration alone,
with no policy language to write:

| Plugin | Writes |
| --- | --- |
| `governance/label-injector` | the labels a list of rules sets on every node whose labels match the rule |
| `governance/selector-tagger` | one label, `tag`, whose value a map of Component names gives each node |

Both are attached like any governance plugin, through `plugins.governance` in the
workspace configuration (see [Attaching a policy](policy-socket.md#attaching-a-policy)),
and both are listed among the [embedded plugins](embedded-plugins.md). The attachments on
this page name `0.9.0-rc.2`, the version of each plugin's Plugin entity in the standard-library
catalog; the build serves the plugin compiled into the CLI.

## What the two share

**They serve `label-transform` and no other role.** Each reports label changes at the
label-shaping role, after the build graph is built and before it is judged (see
[the transform roles](policy-socket.md#the-transform-roles-annotation-transform-and-label-transform)).
Attached at any other role, either is refused before it runs, because it declares no
export for that role. At `ir-verdict` the build halts with:

```text
[E0085]
  ir-verdict: plugin "governance/label-injector:0.9.0-rc.2": call "verdict_ir": wasm: plugin "label-injector" does not declare export "verdict_ir" in describe(): wasm: plugin rejected by the sandbox
```

```text
[E0085]
  ir-verdict: plugin "governance/selector-tagger:0.9.0-rc.2": call "verdict_ir": wasm: plugin "selector-tagger" does not declare export "verdict_ir" in describe(): wasm: plugin rejected by the sandbox
```

At `render-verdict` and `annotation-transform` the refusal is the same `E0085`, naming
`verdict_render` and `transform_annotations` instead.

**They read a node's labels and its Component, and nothing else.** A node's labels are
the ones it carries when the plugin runs: its Component's own, and those any transform
listed before it wrote. Its Component is the name the Aggregate's `type:` gives it, such
as `core/datastore/mariadb`. Neither plugin reads a node's values, the Release, or its
environment: what either writes on a node follows from that node's labels and Component
alone.

**They write labels, and only labels.** Every change either plugin reports names one
label on one node of the build, with a string value. Writing a label the node already
carries replaces its value — a Component's own label included. Neither removes a label,
and neither can change a value, a node's Component or version, or the set of nodes:
the label-shaping role offers no change of that kind (see
[Shaping labels](policy-socket.md#shaping-labels-a-policy-names-the-label-and-the-engine-addresses-it)).

**Their settings are not checked before they run.** Neither declares a schema for its
`settings`, so the build hands them to the plugin as written. A key the plugin does not
read is ignored — a misspelt `rules` sets nothing, and the build completes — while a key
it reads holding a value of another type halts the build with a message naming the
plugin, then `decode settings:` and the reason.

**They read the files under `sources` as YAML, in file-name order.** The plugin receives
the files sorted by file name, whatever order the attachment lists them in. A file that
is not valid YAML halts the build with a message naming the plugin, then
`parse source "<file>":` and the parser's reason; one whose content is not the shape the
plugin reads halts it with `decode source "<file>":` and the reason.

**The lockfile holds the inputs a build applies.** The pull that resolves a Release's
lockfile — `aggrega pull`, or a build with `--auto-pull` — records each attachment's
settings and the content of each of its files, and a build applies what was recorded.
After editing an attachment's settings or one of its files, resolve the lockfile again;
a build that does not keeps writing the labels the recorded inputs give.

**Attached with no `with:` block, either writes nothing**, and the build completes.

Several attachments at `label-transform` run in the order they are listed, each reading
the labels the ones before it wrote, so a rule can match a label an earlier attachment
set. [`examples/policy-label-transform/`](../examples/policy-label-transform/README.md)
attaches both plugins after a Rego policy, and a verdict that reads what all three wrote.

## `governance/label-injector`

The label injector adds labels to every node whose labels match a rule.

### The label injector's settings

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| `rules` | a list of rules | none | the rules applied to every node; with no rules, the plugin writes nothing |

Each rule carries two maps of label keys to string values:

| Key | Default | Effect |
| --- | --- | --- |
| `match` | no pairs | a node matches when it carries every pair listed, each with that value; a rule with no pairs matches every node |
| `set` | no pairs | every pair is written on each node the rule matches |

A label the node does not carry compares as the empty string, so a `match` pair whose
value is `""` also matches a node that does not carry that key.

The rules are applied to each node in the order they are listed, and a label a later
rule writes replaces the value an earlier rule wrote for the same key.

### Where the rules come from

The plugin reads `rules` from its settings when the settings hold at least one rule.
When they hold none, it reads the files under `sources`, in file-name order, and takes
the rules of the first file whose top-level `rules` list holds at least one, in the same
shape:

```yaml
rules:
  - match: {}
    set:
      ops.example.com/owner: shop-team
```

The rules of any later file are not read. A file before it that does not parse halts
the build.

### The label injector attached, and the labels it wrote

This attachment sets an owner on every node, then a backup schedule and a different
owner on the nodes in the `datastore` category:

```yaml
plugins:
  governance:
    - uri: governance/label-injector:0.9.0-rc.2
      role: label-transform
      with:
        settings:
          rules:
            - match: {}
              set:
                ops.example.com/owner: shop-team
            - match:
                component.aggrega.ai/category: datastore
              set:
                backup.example.com/schedule: nightly
                ops.example.com/owner: data-team
```

Attached alone to the Aggregate of
[`examples/policy-label-transform/`](../examples/policy-label-transform/README.md) — `db`
is `core/datastore/mariadb`, `cache` is `core/datastore/redis`, `web` is
`core/devtool/adminer` — `aggrega build --release release-production.yaml --auto-pull --ir-graph`
prints a build graph whose nodes carry:

```json
"db": {
  "labels": {
    "component.aggrega.ai/type": "stateful-server",
    "component.aggrega.ai/category": "datastore",
    "component.aggrega.ai/upstream-licensing": "osi-approved",
    "backup.example.com/schedule": "nightly",
    "ops.example.com/owner": "data-team"
  },
  [… omitted: the node's Component, its version and the rest of the node]
},
"cache": {
  "labels": {
    "component.aggrega.ai/type": "server",
    "component.aggrega.ai/category": "datastore",
    "datastore.aggrega.ai/engine": "kv",
    "component.aggrega.ai/hosting": "mixed",
    "component.aggrega.ai/upstream-licensing": "mixed",
    "backup.example.com/schedule": "nightly",
    "ops.example.com/owner": "data-team"
  },
  [… omitted: the node's Component, its version and the rest of the node]
},
"web": {
  "labels": {
    "component.aggrega.ai/type": "server",
    "component.aggrega.ai/category": "devtool",
    "component.aggrega.ai/upstream-licensing": "osi-approved",
    "ops.example.com/owner": "shop-team"
  },
  [… omitted: the node's Component, its version and the rest of the node]
}
```

Every node matched the first rule and took `shop-team`; `db` and `cache`, in the
`datastore` category, matched the second too, which replaced it with `data-team`. Every
other label is the Component's own.

## `governance/selector-tagger`

The selector tagger writes a `tag` label on each node, its value looked up by the
node's Component.

### The selector tagger's map and settings

It always writes the key `tag`; the key is not configurable.

The map comes from the files under `sources`. Each file is a YAML map from a Component
name to the tag its nodes take:

```yaml
core/datastore/mariadb: orders
core/datastore/redis: sessions
```

Every file is read, in file-name order, and an entry in a later file replaces the same
Component's entry in an earlier one. Each tag is a string: a value YAML reads as another
type, such as `3`, halts the build, so quote it — `"3"`.

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| `default` | string | empty | the tag a node takes when the map does not list its Component; when empty, such a node is left without a `tag` |

With no `sources`, every node takes the `default`.

### The selector tagger attached, and the labels it wrote

This attachment tags the database and the cache from `tags.yaml`, the map above, and
every other node `untagged`:

```yaml
plugins:
  governance:
    - uri: governance/selector-tagger:0.9.0-rc.2
      role: label-transform
      with:
        sources:
          - tags.yaml
        settings:
          default: untagged
```

Attached alone to the same Aggregate, `aggrega build --release release-production.yaml --auto-pull --ir-graph`
prints a build graph whose nodes carry:

```json
"db": {
  "labels": {
    "component.aggrega.ai/type": "stateful-server",
    "component.aggrega.ai/category": "datastore",
    "component.aggrega.ai/upstream-licensing": "osi-approved",
    "tag": "orders"
  },
  [… omitted: the node's Component, its version and the rest of the node]
},
"cache": {
  "labels": {
    "component.aggrega.ai/type": "server",
    "component.aggrega.ai/category": "datastore",
    "datastore.aggrega.ai/engine": "kv",
    "component.aggrega.ai/hosting": "mixed",
    "component.aggrega.ai/upstream-licensing": "mixed",
    "tag": "sessions"
  },
  [… omitted: the node's Component, its version and the rest of the node]
},
"web": {
  "labels": {
    "component.aggrega.ai/type": "server",
    "component.aggrega.ai/category": "devtool",
    "component.aggrega.ai/upstream-licensing": "osi-approved",
    "tag": "untagged"
  },
  [… omitted: the node's Component, its version and the rest of the node]
}
```

`core/devtool/adminer` is not in the map, so `web` took the `default`. Without the
`default` setting, `web` carries no `tag` and the other two are tagged as above.

## Where the compiler does not interpret

Neither plugin, nor the compiler, knows what an owner, a backup schedule or a tag means.
The label keys and values are strings the attachment supplies; the compiler hands each
plugin the nodes, applies the labels it reports, and carries them in the build graph,
where a policy that reads them gives them their meaning.
