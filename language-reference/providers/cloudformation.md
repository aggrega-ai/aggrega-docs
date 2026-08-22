# CloudFormation Provider

The cloudformation provider renders Aggrega Recipes into AWS CloudFormation stack templates. Every component rendering to the same output directory under this provider assembles into one stack, emitted as a single pure-JSON template that uses long-form intrinsics. A boundary therefore becomes one stack in the ordinary case — and two boundaries whose `directory:` resolves to the same path assemble into one stack together, sharing that template's names. Like every Aggrega provider it is offline and hermetic — an Aggrega build is an ahead-of-time compilation, so the provider never calls AWS, never resolves account-generated identifiers, and never runs CloudFormation. Runtime-only values stay as CloudFormation intrinsic references (`Fn::GetAtt`, `Fn::ImportValue`, `Fn::GetStackOutput`) that CloudFormation resolves at deploy time.

## Fragment recipes assembled into a stack

A cloudformation Recipe authors a **fragment** — the CloudFormation resources contributed by a single component — rather than a whole template. When a boundary's components render, the provider assembles every fragment in the dispatch group into one stack template: the resources merge under a single `Resources` map, and each component's `provides` values surface as stack `Outputs`. Two authoring shapes are accepted:

- **Fragment (artifacts) input.** A Recipe authors resource fragments directly; the provider normalizes them to pure-JSON long-form intrinsics and merges them into the assembled stack.
- **Sourced input.** A Recipe references an existing CloudFormation template (YAML or JSON); the provider normalizes it to long-form JSON and validates its structure before assembly.

The assembled template is pure JSON. Intrinsics are emitted verbatim and never evaluated at build time — the compiler cannot resolve a value that only exists after the stack deploys, and evaluating one would break the ahead-of-time contract.

## Names in the assembled stack

A CloudFormation logical ID is unique within one template and admits only letters and digits, and every component assembling into that template shares its names — including components from a second boundary, when both resolve to the same output directory. So each name the stack addresses something by has to be distinct across every component that contributed it, and the set of contributors is not always a single boundary.

**Resource logical IDs come from the Recipe.** The provider emits them exactly as authored and rewrites none of them, so the name you read in the assembled template is the name the Recipe wrote. The standard-library CloudFormation Recipes derive it from the component instance's own name, reading that name's separators as word boundaries: instance `payments-db` names its resource `PaymentsDb`. Two instances of the same type therefore describe two resources rather than competing for one.

**Output names are scoped by the component that published them.** Each `provides` entry surfaces as an output named for the publishing component and the entry together — component `payments-db` publishing `host` surfaces as `PaymentsDbHost` — so two components publishing the same entry reach two separate outputs, and an output's meaning does not change when another component joins the stack. A cross-stack consumer imports by the export name rather than by this one, so the export name is unaffected.

Because a logical ID admits no separator character, both names read as capitalised words run together. Two instance names differing only in punctuation can still derive one resource name — `payments-db` and `payments_db` both derive `PaymentsDb` — and the build halts, naming both instances and the name they landed on, rather than emitting one resource where two components were declared. Renaming either instance clears it.

### Two entry names can meet at one output name

Building an output name drops every separator and capitalises each word, and the component half and the entry half are joined with nothing between them. Three kinds of entry name therefore meet at a single output name, and none of them is exotic:

- Entries differing only in punctuation. A component publishing both `db-host` and `db_host` reaches `DbHost` twice.
- Entries differing only in a letter's case. `host` and `Host` reach `Host` alike, because a word's first letter is capitalised either way.
- Entries that meet across the join. Component `payments-db` publishing `host` and component `payments` publishing `db-host` both reach `PaymentsDbHost`, and neither name contains the other.

**The build halts rather than emit one output where two entries were written.** Within a single component the halt names both entries exactly as they were written, the section each was written in — an `Outputs:` block or a `provides:` block — and the component that carried them, so both ends of the collision are searchable in your own files. Between two components the halt names the output name and both components. Renaming either entry, or either component, clears it.

This holds whether or not the two entries carry the same value. Two entries with the same value still describe two outputs a deployment asked for, so folding them into one would leave one of the two written-down outputs absent from the stack.

### A key written twice in one mapping halts

A CloudFormation fragment is read as a mapping, and a mapping holds one value per key, so a key written twice would keep whichever body came last and discard the other. Where the mapping is a `Resources` or `Outputs` block, the discarded body is a resource or an output that was written and would simply not be in the stack.

The build halts instead, naming the repeated key and both lines it was written at. This is a whole-fragment rule rather than a rule about the stack's names: it applies to any mapping in the fragment, including a resource's `Properties`. The commonest way to reach it is a Recipe deriving a logical ID from an authored value, where two authored values differ only in punctuation — `app-cache` and `app_cache` both derive `AppCache`, so the fragment writes `AppCache` twice.

A key name recurring at different places in the document is ordinary and untouched: `Type` appears once per resource, and `Value` once per output, however many resources and outputs the fragment carries. Only a repeat inside one mapping loses a body.

**A single component can claim one name twice.** A Recipe contributes several fragments — several `artifacts:` entries, or a sourced directory holding several templates — and every one of them assembles into the same stack, so a component's own fragments share the stack's names with each other exactly as they share them across components. Two fragments that give one name two different bodies halt the build, and the halt names the key space the name sits in — resource logical IDs or output names — along with the component and the name itself. Both spaces are reachable this way: two fragments can author one resource logical ID over different resources, and a component reaches its output names through two routes, an explicit `Outputs:` block and its `provides:` entries, so an entry from each carrying one name meets there too.

Restating a name is not itself a conflict. A name written more than once with identical content addresses one thing either way, so the restatements merge into a single entry and the build proceeds — an ordinary repeat costs nothing. What halts is the case that loses content: one of the two bodies would have to be discarded, and the resource or output the Recipe declared would then be missing from the stack. Renaming either one clears it.

## Structural input validation

A sourced CloudFormation template is structurally validated before it renders: the provider parses the template and normalizes its intrinsics, halting the build with a clear message that names the offending node when a template is malformed. The parse checks shape, not semantics — it does not contact AWS, resolve references, or evaluate intrinsics.

## Cloud-target annotations

Three boundary annotations tell the provider where a stack deploys, so it can wire cross-stack references correctly:

- `aggrega.ai/aws-account` — the AWS account the stack deploys into.
- `aggrega.ai/aws-region` — the AWS region the stack deploys into.
- `aggrega.ai/aws-assume-role-arn` — the IAM role ARN a cross-account stack read assumes to reach a peer stack's exported values.

These annotations are opaque to the compiler — it pipes their values through to the provider without interpreting them (see [well-known-annotations.md](well-known-annotations.md)). They are authored on the **producer** boundary — the stack that owns the exported value. A cross-account read assume-roles into the producer's account, so the account, region, and role that describe the read all come from the producer boundary's annotations, not the consumer's.

## Intra-stack references

When a `uses` edge connects two components that land in the **same** boundary — the same stack — the consumed value is wired as an `Fn::GetAtt` against the producer resource's logical ID within the one template. The producer's `provides` value flows into the consumer's rendered input as a native intra-stack reference; no export or import is needed.

## Cross-stack wiring

When a `uses` edge crosses **from one boundary to another** — the two components assemble into different stacks — the reference cannot be a plain value, because the produced value does not exist until the producer stack deploys. The provider wires it as a CloudFormation cross-stack reference. The producer stack publishes the value as a stack `Output` with an `Export` under a deterministic export name (derived from the release, boundary, component, and provided key). The consumer stack reads it with one of two intrinsics, chosen by comparing the two boundaries' declared placement:

- **`Fn::ImportValue`** — the same-account, same-region case. CloudFormation resolves the import against the matching export name within the account and region.
- **`Fn::GetStackOutput`** — a genuine cross-account or cross-region read. The consumer reads the producer stack's output directly, assuming the producer boundary's `aws-assume-role-arn` into the producer's account and region.

**Detection semantics.** The provider routes to `Fn::GetStackOutput` only when **both** endpoints declare a placement (account/region) and those placements **differ**. In every other case — neither declares, only one declares, or both declare the same placement — it uses `Fn::ImportValue`. This is a conservative rule: a same-account cross-stack read stays a plain import, and the direct-read intrinsic is reserved for a real cross-account or cross-region hop.

The producer stack always publishes the `Export`, even when a particular consumer reads it cross-account through `Fn::GetStackOutput`. An unused export is inert, and publishing it unconditionally keeps the producer template independent of how each consumer chooses to read the value.

> **Version note.** `Fn::GetStackOutput` is a native CloudFormation intrinsic, available since May 2026. A cross-account reference rendered with it requires CloudFormation tooling that recognizes the intrinsic; older tooling may not. The same-account path uses `Fn::ImportValue`, which is universally available.

### How an export name is built

The four parts are joined with a **double hyphen**, and each part is written into the letters, digits and hyphens an export name is made of. A letter or digit is carried through as written, and so is a hyphen inside a part — `payments-db` stays `payments-db`. Any other character is written as a short escape opening with `-z`: a slash as `-zs`, an underscore as `-zu`, a dot as `-zd`. A part with no value at all is written `-ze`. A stack name is built the same way from the release and the boundary.

So the export publishing `host` from component `db`, in boundary `dist/stack-a/cloudformation` of release `orders`, is:

```
aggrega--orders--dist-zsstack-a-zscloudformation--db--host
```

Reading it back is unambiguous, and that is the point rather than a nicety: because a part never contains two hyphens in a row and never ends with one, the double hyphens are always the joins. Two different sets of parts therefore always produce two different names. `payments-db` and `payments_db` reach two separate exports rather than converging on one, and a hyphen at the edge of one part cannot be read as belonging to its neighbour.

### What an export name is unique against, and where that stops

Within one build, an export name identifies exactly one release, boundary, component and provided key — no two of them converge on a single name, so a build cannot lose one exported value behind another.

CloudFormation additionally requires an export name to be unique across everything already deployed into the account and region the stack lands in. That is a property of the deployment rather than of the build, and it sits beyond what any build-time derivation can reach: the compiler does not authenticate against AWS, does not query it, and cannot read the output of another build, so nothing computed ahead of time can observe what is already deployed there.

What carries the distinction across that line is the release identity leading every export and stack name. Two deployments that share an account and region keep their exports apart by being released under different names — which is the lever you hold, and the reason the release identity leads the name rather than trailing it.

### An Outputs entry can declare its own export name

A Recipe's `Outputs:` block is authored CloudFormation, and an entry in it may carry its own `Export:` with a `Name:`. That name reaches the assembled stack exactly as written — the provider does not rewrite it, does not prefix it, and does not require it to look like a derived one.

Usually there is nothing more to say about it. An authored export name that matches no name the provider derives publishes alongside the derived ones and is never remarked on. **The authoring is supported; only one coincidence is not.**

**The build halts when an authored export name equals one the provider derives for a cross-boundary link in the same build.** Both declarations would reach the assembled template, leaving one export name declared twice in one stack — and an export name has to be unique, so the two cannot both stand. The halt gives the derived export name and the four parts it was built from, so you can see which link produced it, and it names the stack output the authored declaration sits under, marked as a name the provider assembles rather than one a Recipe wrote. **The export name is the term to search your Recipes for.** The authored entry spells it exactly as the halt does — that identity is what makes the two a collision — so it is the one string that appears both in the message and in your own files. Renaming the export name that entry declares clears the halt, and so does removing that entry's `Export:` block and letting the cross-stack wiring publish the export itself.

**The check is a build-scope one, and its scope is one stack.** It compares the export names an assembled stack declares against the names the provider derives for the cross-boundary links that publish into that same stack — the comparison the build can make from what it has assembled. Two stacks are not compared against each other. And what an authored name meets among the exports already deployed into an account and region is a property of the deployment, which lies beyond what any build-time derivation can reach, for the reason set out under *What an export name is unique against, and where that stops*: the compiler does not authenticate against AWS, does not query it, and cannot read the output of another build. An export name written as an intrinsic rather than as a plain string sits on the far side of the same line — it resolves at deploy time, and nothing here evaluates an intrinsic, so there is no name for the build to compare.

## Deployment ordering

A Release boundary's `syncWave:` value orders provisioning of the stack that boundary assembles into. Every component in the boundary inherits the boundary's wave, and where several boundaries resolve to the same output directory — so their fragments assemble into a single template — the stack holds more than one wave and the provider expresses the ordering between them as `DependsOn`.

**Each resource names every resource of the immediately-preceding wave that has any resources, and no earlier wave than that.** CloudFormation chains the rest: a resource in wave `2` depends on wave `1`, which depends on wave `0`, so the whole sequence is ordered while each resource's own list stays the size of one wave rather than of the whole stack. Waves need not be contiguous, and negative values are ordinary — `-1` is a common choice for a bucket or a role the rest of the stack reads. The lowest wave names nothing, because nothing precedes it.

**What the ordering is: creation order, and in reverse, deletion order.** CloudFormation operates on resources in parallel to the extent it can, and `DependsOn` overrides that parallelism to operate on the named resources in a stated order. The attribute governs both directions, so a wave that creates a resource earlier also deletes it later — correct teardown sequencing comes with the ordering rather than needing anything else.

**It is not readiness ordering.** A stack template expresses no notion of a resource being serviceable, so nothing here waits for one to become ready — only for CloudFormation to finish creating it. That is a real difference from the same wave on [compose](compose.md#deployment-wave-ordering), where a service that declares a `healthcheck` is waited on until it reports healthy: compose has a readiness primitive to gate on and a stack template has none. Creation order is what this target offers, and stating it plainly is more useful than a caveat attached to a promise it cannot make.

**An authored `DependsOn` is extended, never replaced.** A fragment that declares its own ordering constraint keeps it: the entries it wrote stay first, in the order it wrote them, and the wave's entries follow. Both requirements hold and neither hides the other. A single logical ID and a list are both read, and the merged value is emitted as a list, which is the one spelling that holds however many entries the merge produces.

**A stack whose resources all carry one wave gets nothing from this.** So does a Release that declares no `syncWave` at all: every contributor carries the field's default of `0`, the assembled template holds a single wave, and the output is exactly what it would be if the provider expressed no wave ordering.

**Ordering across two stacks is not expressible, and it is not approximated.** `DependsOn` names a resource inside the same template, and components that assemble into a different stack are outside it. So a wave orders every resource in the stack it assembles into and nothing beyond it. Sequencing two stacks is the operator's concern, the same way a cross-stack reference is a deploy-time resolution rather than a build-time one.

Ordering that the waves do not express stays CloudFormation's own concern, and the references between resources already carry much of it: an `Fn::GetAtt` against a producer resource tells CloudFormation to create that resource first. A fragment that needs a constraint neither the references nor the waves imply authors `DependsOn` itself, which is the case the merge above preserves.

## Determinism

Given the same inputs the provider emits a byte-identical stack template across runs: logical IDs, output keys, export names, and resource ordering are all deterministic, so a CloudFormation stack template diffs cleanly in GitOps review.
