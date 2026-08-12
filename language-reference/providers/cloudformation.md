# CloudFormation Provider

The cloudformation provider renders Aggrega Recipes into AWS CloudFormation stack templates. Each boundary becomes one CloudFormation stack, emitted as a single pure-JSON template that uses long-form intrinsics. Like every Aggrega provider it is offline and hermetic — an Aggrega build is an ahead-of-time compilation, so the provider never calls AWS, never resolves account-generated identifiers, and never runs CloudFormation. Runtime-only values stay as CloudFormation intrinsic references (`Fn::GetAtt`, `Fn::ImportValue`, `Fn::GetStackOutput`) that CloudFormation resolves at deploy time.

## Fragment recipes assembled into a stack

A cloudformation Recipe authors a **fragment** — the CloudFormation resources contributed by a single component — rather than a whole template. When a boundary's components render, the provider assembles every fragment in the dispatch group into one stack template: the resources merge under a single `Resources` map, and each component's `provides` values surface as stack `Outputs`. Two authoring shapes are accepted:

- **Fragment (artifacts) input.** A Recipe authors resource fragments directly; the provider normalizes them to pure-JSON long-form intrinsics and merges them into the assembled stack.
- **Sourced input.** A Recipe references an existing CloudFormation template (YAML or JSON); the provider normalizes it to long-form JSON and validates its structure before assembly.

The assembled template is pure JSON. Intrinsics are emitted verbatim and never evaluated at build time — the compiler cannot resolve a value that only exists after the stack deploys, and evaluating one would break the ahead-of-time contract.

## Names in the assembled stack

A CloudFormation logical ID is unique within one template and admits only letters and digits, and every component in a boundary assembles into that one template — so each name the stack addresses something by has to be distinct across the components that contributed it.

**Resource logical IDs come from the Recipe.** The provider emits them exactly as authored and rewrites none of them, so the name you read in the assembled template is the name the Recipe wrote. The standard-library CloudFormation Recipes derive it from the component instance's own name, reading that name's separators as word boundaries: instance `payments-db` names its resource `PaymentsDb`. Two instances of the same type therefore describe two resources rather than competing for one.

**Output names are scoped by the component that published them.** Each `provides` entry surfaces as an output named for the publishing component and the entry together — component `payments-db` publishing `host` surfaces as `PaymentsDbHost` — so two components publishing the same entry reach two separate outputs, and an output's meaning does not change when another component joins the stack. A cross-stack consumer imports by the export name rather than by this one, so the export name is unaffected.

Because a logical ID admits no separator character, both names read as capitalised words run together. Two instance names differing only in punctuation can still derive one resource name — `payments-db` and `payments_db` both derive `PaymentsDb` — and the build halts, naming both instances and the name they landed on, rather than emitting one resource where two components were declared. Renaming either instance clears it.

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

## Determinism

Given the same inputs the provider emits a byte-identical stack template across runs: logical IDs, output keys, export names, and resource ordering are all deterministic, so a CloudFormation stack template diffs cleanly in GitOps review.
