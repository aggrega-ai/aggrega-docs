# The attachment facts a governance policy reads

A governance plugin attached at the `ir-verdict` role receives the whole build
graph, and every Feature attachment in the deployment arrives with it. Each
attachment carries a fixed set of facts about itself: which Feature it names,
which slot it fills, which connection it was written on when it was written on
one, which FeatureRecipe realizes it, what the catalog author declared about it,
what an author wrote into it, and whether it handles material someone declared
sensitive. One thing does not
arrive as written: a value an author declared sensitive arrives withheld — see
[Declared-sensitive values arrive withheld](#declared-sensitive-values-arrive-withheld).

This page enumerates those facts and says what each one does and does not
claim. For the socket itself — the four roles, the verdict severities, the
operator input channel, and the two policy engines that ship inside the
compiler — see [`policy-socket.md`](policy-socket.md). For the field-by-field
table with types and requiredness, see the generated
[graph schema reference](../schema/other/ir.md); this page teaches how to read
the facts, and that page is the contract.

## Where the attachments sit in the payload

Attachments hang off the build graph under `feature_values_mapping`, keyed by
node id and then by the instance name the author gave each attachment:

```
input.graph.spec.feature_values_mapping[<node id>][<attachment name>]
```

The attachment name is load-bearing rather than decorative. It is the key an
author fills a slot by, so it is also what the compiler pairs against the
host Component's declared slots.

An attachment written on one of a component's connections — under `features:`
on a `uses` entry, in the Aggregate or in the Release — is one of the consuming
component's attachments, so it sits in the same bucket, on the consuming
component's node. Its key is the name the compiler gives it, the connection's
alias and the slot joined by a dot: `gpt.credential` for the `credential` slot
of the connection written under the alias `gpt`. The dot never appears in a
name an author writes, so that key never equals the name of one of the node's
own attachments. A policy does not read the connection out of the key, though:
the entry carries it as data, in `connection` below.

```rego
package security

import rego.v1

deny contains msg if {
    some node_id, attachments in input.graph.spec.feature_values_mapping
    some name, attachment in attachments
    attachment.binding == "free"
    msg := sprintf("%v carries attachment %v, which fills no declared slot.", [node_id, name])
}
```

**Only `ir-verdict` sees these facts.** A `render-verdict` policy receives the
rendered artifacts and no graph; a `label-transform` policy receives a
projection of the nodes' labels and values, its declared-sensitive values withheld
as here, which carries no attachments at all; an
`annotation-transform` policy receives the components it may annotate. A rule
that reads attachment facts belongs at `ir-verdict`, and moving it to another
role produces a rule that never fires rather than an error, because a path that
is not there is simply undefined.

## One bucket, every attachment family

Every attachment on a node sits in the same bucket whatever its Feature
produces — an operational Feature, a credential Feature, an identity Feature.
No family gets a narrower projection than another, so a policy that walks the
bucket sees all of them and never has to know which family it is looking at
before it can read a fact.

## Identity: `type` and `resolved_version`

`type` is the URI of the catalog Feature the attachment names.
`resolved_version` is the exact version resolution settled on for this build.
Both are always present.

## Catalog metadata, carried verbatim: `labels` and `catalog_annotations`

`labels` are the attached Feature entity's own `metadata.labels`.
`catalog_annotations` are that entity's own `metadata.annotations`. Both are
carried in the order the catalog entity declares them, and neither is filtered,
normalised, or prefix-stripped — a key in the catalog author's own namespace
arrives exactly as written, and the compiler reads none of them.

That verbatim carry is what lets a policy be keyed on a label the compiler has
no reason to know exists. A catalog author who marks credential Features with a
label of their own invention can write a rule against that label directly.

Both are empty when the Feature declares none, and when its `type` resolves to
no catalog entity.

`catalog_annotations` describes the **entity the attachment names**. It is a
different question from `annotation_key` and `annotation_source` below, which
describe **how the attachment came to exist**. An attachment written in a
`features:` block carries catalog annotations while carrying neither of the
other two.

## Which slot the attachment fills: `binding`

`binding` has three answers, and the third is not a variant of the second:

| Value | Meaning |
| --- | --- |
| a slot name | The attachment fills the declared attachment slot of that name. |
| `free` | The attachment fills no declared slot. This is a positive finding: the slot set was resolved and no declared slot carries this name. |
| absent | The host Component's declared slot set could not be resolved, so which slot is filled is unknown. |

Which declared slot set the name comes from depends on where the attachment was
written. An attachment of the node's own block fills a slot the host Component
declares in its own `featuresSchema`. An attachment written on a connection —
one carrying `connection` below — fills a slot the connection's socket declares,
in that socket's `featuresSchema` on the host Component. So the same value,
`credential`, names a slot of the Component on one attachment and a slot of a
socket on another, and `connection` is what tells the two apart.

The pairing is by name — an attachment fills a slot when the Feature is attached
under the slot's name, on the component's block or on the connection — so the
value is an exact key from the declared slot set. Nothing is read out of the
attachment's key: a connection's attachment is keyed `gpt.credential` and
reports `credential`. The slot name is carried rather than a bare flag because
*which* slot was filled is the more useful half of the answer.

An attachment written on a connection never reports `free`. A socket's slots
are the only names a connection through it may carry, and a connection carrying
any other name is refused when the build loads, so every such attachment in a
graph that reaches a policy fills a declared slot.

A policy that treats an absent `binding` as `free` will report an unknown as a
finding. Test for `free` explicitly.

## Which connection the attachment was written on: `connection`

`connection` is present on every attachment written on one of the node's
connections, and absent on every attachment of the node's own block. It carries
two fields, the coordinates of that connection on the node:

| Field | Meaning |
| --- | --- |
| `socket` | The socket the connection is wired through. |
| `alias` | The alias the connection is written under. |

The pair names one of the graph's edges: the edge whose `source` is the node
carrying the attachment and whose `socket` and `alias` are these. That edge's
`target` is the component the attachment is presented to. So a policy joins an
attachment to what it reaches — something no fact on the attachment alone can
say, because the attachment sits on the consuming node:

```rego
package security

import rego.v1

deny contains msg if {
    some node_id, attachments in input.graph.spec.feature_values_mapping
    some name, attachment in attachments
    attachment.labels["feature.aggrega.ai/kind"] == "secret"
    some edge in input.graph.spec.edges
    edge.source == node_id
    edge.socket == attachment.connection.socket
    edge.alias == attachment.connection.alias
    input.graph.spec.nodes[edge.target].labels["example.com/trust-zone"] == "external"
    msg := sprintf("%v presents the credential %v to %v, outside the trust zone.", [node_id, name, edge.target])
}
```

What `connection` claims, and what it does not:

- **It records where the author wrote the attachment.** It is filled from the
  connection the attachment was written on, never parsed out of the attachment's
  key, so it holds the socket — which the key does not carry — as well as the
  alias.
- **It does not carry the slot.** Which slot of the socket the attachment fills
  is `binding`, read the same way as for any attachment; the slot is reported
  once, there.
- **It does not describe the target.** The target, its labels, and who wired the
  edge — the developer, the Release, or a Feature — are facts of the edge and the
  target node, read there after the join.
- **A connection a Feature draws carries no attachments**, so no attachment
  carries a `connection` naming such an edge. A credential a Feature's own
  connection needs is an attachment filling a slot the Feature declares, and it
  carries no `connection`.
- **Absent means the node's own block.** An attachment without `connection` was
  written on the component's own `features:` (or reached it from a broader scope
  or by annotation-driven expansion). It is not a finding that the attachment is
  presented to no other component: what a component's own credential reaches is
  decided by how its delivery is wired, which this field does not describe.

Beyond deciding which declared slot set `binding` and the slot half of
`sensitive` are read from, `connection` changes nothing about the attachment:
its FeatureRecipe, its provides contract, the rest of its facts and its place in
the bucket are those of any attachment the node carries.

## Which FeatureRecipe realizes the attachment: `realization`

`realization` names the FeatureRecipe the Release's Manifest binds to the
attachment, as `<name>:<version>`. The Manifest binds by the attachment's own
name where its `name` tier maps that name — for an attachment written on a
connection, its qualified name, `gpt.credential` above — and otherwise by the
Feature type the attachment names. The FeatureRecipe named is the one a build of
the same documents renders the attachment with: the graph records the binding
before anything renders, and the render binds the attachment the same way.

```rego
package security

import rego.v1

approved_realizations := {"approved-credential:1.0.0"}

deny contains msg if {
    some node_id, attachments in input.graph.spec.feature_values_mapping
    some name, attachment in attachments
    attachment.labels["feature.aggrega.ai/kind"] == "secret"
    realization := attachment.realization
    not realization in approved_realizations
    msg := sprintf("%v realizes the credential %v with %v, which is not an approved FeatureRecipe.",
        [node_id, name, realization])
}
```

What `realization` claims, and what it does not:

- **It is the same pair everywhere it appears.** `aggrega inspect` prints it as
  the attachment's realization, and where a target stamps provenance on what it
  renders, the documents that FeatureRecipe renders carry it as their
  `aggrega.ai/recipe-uri` value, so a policy joins an attachment to what it
  renders without translating between forms.
- **It names the FeatureRecipe by name and version, not by capability.** Two
  capabilities may each publish a FeatureRecipe under one name and version.
  Which of them is bound is settled by the Manifest's mapping, which names the
  capability wherever the name alone would be ambiguous; this field does not
  restate it.
- **A Release boundary's own attachments carry it too**, under
  `boundary_features`, read the same way. A boundary-level attachment also
  reaches each component the boundary holds, and carries the same realization
  there.
- **Absent means bound to nothing.** An attachment the Manifest binds to no
  FeatureRecipe the catalog holds carries no `realization`. A build of such a
  composition halts before it renders, naming the unmapped attachment — but a
  policy at this role is asked before that halt, so it can meet an attachment
  carrying none. The rule above passes such an attachment by, because its body
  binds `realization` first; a rule that wants to report it tests for the
  missing key explicitly.

## How the attachment came to exist: `origin` and its two companions

`origin` distinguishes an attachment a developer typed from one the
annotation-driven expansion produced:

| Value | Meaning |
| --- | --- |
| `explicit` | Authored in a `features:` block. |
| `annotation` | Produced by annotation-driven expansion. |
| `mixed` | The attachment's value or infra leaves carry a mix of both; the per-leaf detail is in the provenance maps. |

`annotation_key` names the annotation that triggered a synthetic attachment,
and `annotation_source` locates its declaration as
`<release-file-path>:<dotted-yaml-key-path>`. Both are empty when `origin` is
`explicit`.

## The authored payloads: `values`, `infra`, and `inject`

`values` is the attachment's operational configuration — the developer's
domain. `infra` is its per-instance physical sizing — the operator's. `inject`
is the agnostic injection routing, mapping delivery keys to the `provides` keys
they fill from, keyed first by delivery mechanism.

What a credential attachment's `values` carries is the author's choice, and the
compiler carries whichever was written without resolving either: a by-reference
credential carries a pointer into a secret store, and a by-value one carries
the material itself. Whichever it is, a leaf the attached Feature declares
sensitive reaches a policy withheld, as the next section describes; a leaf it
leaves undeclared, such as a published locator, arrives as written.

## Declared-sensitive values arrive withheld

Every leaf the graph marks as declared sensitive arrives at this socket as a
withheld marker rather than as the value an author wrote. The marker is a
single-key object carrying the reason the value is absent:

```json
{ "aggrega_withheld": "declared" }
```

`declared` means a declaration covers the leaf. A payload that could not be
read at all is withheld whole, with the reason `unreadable`, because no leaf
inside it could be judged.

The withholding follows the graph's own markings, so it reaches exactly the
leaves they name, wherever they sit:

- **every attachment's `values` and `infra`**, whatever scope wrote it — the
  component's own block, a subsystem, a boundary or the Release, an
  annotation-driven expansion — and whether it was written on the node's own
  block or on one of its connections, by the leaves its
  `sensitive_payload_leaves` names;
- **a boundary-level attachment's `infra`**, under `boundary_features`, by its
  own marking;
- **a node's own `values` and `infra`**, under `values_mapping` and
  `infra_mapping`, by the node's own `sensitive_payload_leaves`.

What a policy reasons on is unchanged. The type, the resolved version, the
labels, the catalog annotations, `binding`, `connection`, `realization`,
`origin` and its provenance maps, all three sensitivity facts, and every leaf no
declaration marks arrive as before. The key of a withheld leaf survives too, so a policy
still sees which leaves a payload carries and which of them carry declared
material — only the value is absent. A rule about where declared-sensitive
material travels, and by which route, is therefore fully expressible; a rule
about the material's content is not, by design.

A node's authored `uses` block, carried on the node beside its edges, keeps
each attachment written on a connection to its `type` and `description`. The
attachment's values are carried once, on the attachment itself, where the
withholding reaches them.

A policy that wants to tell a withheld leaf from an authored one tests for the
marker's key:

```rego
package security

import rego.v1

audit contains msg if {
    some node_id, attachments in input.graph.spec.feature_values_mapping
    some name, attachment in attachments
    some key, value in attachment.values
    is_object(value)
    value.aggrega_withheld
    msg := sprintf("%v/%v writes a declared-sensitive value at values.%v.", [node_id, name, key])
}
```

This is the same withholding `--ir-graph` applies when a command prints the
graph and the daemon's `aggrega/irGraph` applies when it answers a client, so a
policy and a person reading the graph see the same leaves withheld. Those
surfaces return the values to a person who asks for them with `--unredacted`;
the payload a policy receives has no such request, and a node's own declared
values are withheld from it on the same terms as an attachment's. It applies to
the payload a policy receives and to nothing else: the
graph the build renders from is untouched, so the withholding changes no
rendered byte. Nothing is withheld from what a `render-verdict` policy
receives, because the rendered artifacts are what that role judges.

## Where each leaf came from: `values_provenance` and `infra_provenance`

Each is keyed by the dotted leaf path within its pillar, and each entry records
that leaf's `origin` — the same `explicit` / `annotation` distinction, applied
one leaf at a time. An annotation-contributed leaf additionally carries the
authoring surface it was declared on, the annotation key that contributed it,
and that declaration's source location. Where an explicit leaf overwrote an
annotation-contributed one, the entry also carries the suppressed contribution
it replaced, so a policy can see what was overridden rather than only what won.

## The three sensitivity units

The payload carries **three** sensitivity facts, and they sit at three
different units: one whole attachment, one delivery key, one payload leaf.

Each is computed from its own inputs. **None is derived from another**, and in
particular the per-attachment answer is never spread down to the narrower
units. Conflating any two of them produces a policy that is wrong in a
direction that fails quietly, so the three are worth reading separately before
writing a rule against any of them.

Every one of them is derived from what an author **declared** — `sensitive:
true` on a Feature's schema leaf, or `sensitive: true` on an attachment slot a
Component declares, for its own attachments or on one of its sockets. No value's
content is inspected, and no meaning is read out of a field's name.

### `sensitive` — one answer for the whole attachment

True when either the attached Feature declares a sensitive leaf in its
`values`, `infra`, or `provides`, or the slot the attachment fills declares that
whatever binds it handles secret material — the host Component's attachment slot
of the same name, or, for an attachment carrying `connection`, the slot of that
name the connection's socket declares. Unset when neither declaration is
present.

This answers *what the entity is*, so it deliberately does not vary with what a
particular author wrote. It reads the Feature's declarations rather than
the subset of sensitive leaves this attachment happened to fill, because a
field that was sensitive in one deployment and not another would be unusable to
a policy reasoning about the catalog entity.

The two halves are independent, and each holds on its own. A Feature that
declares no sensitive leaf at all still binds a sensitive slot as a sensitive
attachment, because the slot said so. A fill declaring a sensitive leaf is a
sensitive attachment even when the slot made no such declaration, and even when
it is a free attachment binding no slot.

### `sensitive_inject` — one answer per delivery key

The subset of `inject` whose referenced `provides` key the attached Feature
declares sensitive, carried in `inject`'s own shape: mechanism, then delivery
key, with the referenced `provides` key as the value.

A delivery key filling from a `provides` key the Feature marked sensitive
appears here; one filling from an unmarked key does not, even on the same
attachment and the same mechanism. Empty when the attachment declares no
delivery mechanism, or references no sensitive `provides` key.

### `sensitive_payload_leaves` — one answer per payload leaf

The leaves **this attachment's payload carries** whose path the attached
Feature declares sensitive, each as the pillar-prefixed dotted path the datum
occupies: `values.<path>` or `infra.<path>`.

The payload read here is the one the attachment ends up carrying, not the block
an author wrote. A leaf standing at a value the Feature's schema declares as
a `default` is named alongside one an author wrote at it: a filled default is
a datum the payload carries, and a marking read off the written block alone
would leave it unnamed.

A leaf appears where a path the Feature's schema declares sensitive **covers**
it — the declaration names that leaf, or names an object containing it.
Matching runs segment-wise over the dotted path, so a declaration at `db`
covers `db.password` and does not reach a sibling leaf named `dbPassword`.
Nothing is read out of the path's own text and no value is inspected — whether
the author wrote the material itself at a marked leaf, or a pointer to it, is
not knowable here and is not what the marking claims.

The comparison runs over the payload flattened to its leaves, not over the
pillar's top-level keys, so a leaf nested inside a nested map is compared like
any other.

Leaves arrive in the order the payload holds them, the `values` pillar's before
the `infra` pillar's — the same order the payloads themselves carry, which is
what keeps the wire byte-identical across runs of identical input.

This unit answers *where this attachment put data*, which varies by deployment
necessarily. That is why it intersects with what was authored while `sensitive`
does not: the two are answers to different questions, and applying either
rule to the other field would break it.

### Reading the three together

An author attaching a credential Feature that declares its `literalPassword`
values leaf and its `password` provides key sensitive, filling a declared
`credentials` slot, and authoring a literal password inline:

```json
{
  "type": "example/db-credential",
  "resolved_version": "1.0.0",
  "binding": "credentials",
  "values": {
    "secretName": "db-creds",
    "literalPassword": { "aggrega_withheld": "declared" }
  },
  "inject": {
    "env": { "DATABASE_PASSWORD": "password" }
  },
  "sensitive": true,
  "sensitive_inject": {
    "env": { "DATABASE_PASSWORD": "password" }
  },
  "sensitive_payload_leaves": ["values.literalPassword"]
}
```

Three different questions, three different answers. The attachment handles
declared-sensitive material at all (`sensitive`). The `DATABASE_PASSWORD`
environment key is one that carries it (`sensitive_inject`). And this
attachment's payload carries a value at `values.literalPassword` specifically
(`sensitive_payload_leaves`) — while `values.secretName`, a locator the
Feature deliberately leaves unmarked, is absent from that list even though the
payload carries it too. The password the author wrote arrives withheld, while
the locator beside it arrives as written: the marking tells a policy that a
value is there, and the value itself never reaches it.

A rule that denies a literal secret in a rendered artifact wants the third. A
rule that requires every credential-handling attachment to carry an ownership
label wants the first. Substituting one for the other changes which builds
halt.

### Absence is not permission

**A leaf is listed only where a declaration covers it. So an absent
`sensitive_payload_leaves` states that this attachment names no leaf its Feature
declares sensitive — never that the payload is insensitive.** It also does not
separate an attachment that has no such leaf to name from a producer that does
not report this axis at all: those two stay indistinguishable, and a reader of
an absent key learns that and nothing more.

A guest that reads an absent leaf list as permission to display or emit a value
in the clear has read the marking backwards.

The key is omitted from the wire entirely when it would be empty, so an
attachment whose Feature and slot declare nothing carries exactly the bytes it
would carry if the marking did not exist. That omission is what makes the
misreading easy, and it is why the direction is worth stating plainly.

The clearest case is an attachment that is sensitive and lists no leaf at all.
Take the attachment above and change one thing — the author writes only
the locator, leaving the declared-sensitive leaf unfilled:

```json
{
  "type": "example/db-credential",
  "resolved_version": "1.0.0",
  "binding": "credentials",
  "values": { "secretName": "db-creds" },
  "inject": {
    "env": { "DATABASE_PASSWORD": "name" }
  },
  "sensitive": true
}
```

`sensitive` is still true — the Feature's declarations did not change — while
both narrower units are gone. The attachment still handles secret material; it
simply does not do so through a leaf this attachment carries. A policy keyed
on the roll-up denies this build, and a policy keyed on the per-leaf marking
lets it through. Both are defensible rules, and which one a policy wants is a
decision the policy author makes deliberately.

The same asymmetry runs the other way for `sensitive_inject`: an attachment can
author a sensitive leaf while routing nothing sensitive through a delivery key,
or route a sensitive `provides` key while authoring no value at all.

## What a sensitivity declaration does not do

The marking annotates; it is not a control. Declaring a leaf or a slot
sensitive does not encrypt anything, does not validate or reject a value, and
does not force a delivery mechanism. No build outcome changes because a
declaration is present.

On most targets it changes no rendered byte either: a declared-sensitive value
an author supplied inline is rendered exactly as an undeclared one is. Terraform
is the exception among the standard-library targets, because it carries a native
per-value sensitivity primitive for the declaration to land on — see
[`providers/terraform.md`](../providers/terraform.md) "Declared-sensitive module
inputs". A target with no sensitivity notion of its own has nothing for a
declaration to change.

What the declarations do everywhere is make the fact **legible** — to the
compiler's own debug output, and to a policy at this socket that decides what to
do about it. Turning a marking into a build outcome is the policy's job, which
is what this socket exists for. And a policy is told about declared-sensitive
material without being handed it: the marking arrives, the value arrives
withheld.

## Cross-references

- [`policy-socket.md`](policy-socket.md) — the governance socket: the four
  roles, verdict severities, the operator input channel, the policy engines
  that ship inside the compiler, and attaching a plugin to a workspace.
- [`plugin-contract.md`](plugin-contract.md) — the socket's pipeline placement
  and its typed wire shapes.
- [graph schema reference](../schema/other/ir.md) — the field-by-field contract
  for the build graph, including every field on an attachment.
- [`entities/component.md`](../entities/component.md) "Attachment Slots" —
  declaring a slot, and declaring a slot sensitive; and the `featuresSchema`
  a socket declares for the connections wired through it.
- [`entities/aggregate.md`](../entities/aggregate.md) "A connection's own
  attachments" — writing an attachment on a connection, and the name it takes.
- [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md)
  "Declaring a leaf sensitive" — the `sensitive:` keyword and the ceiling on
  what declaring it achieves.
- [`vocabulary/labels-and-annotations.md`](../vocabulary/labels-and-annotations.md)
  — the label and annotation surfaces a policy reads.
