# CloudFormation Provider

The cloudformation provider renders Aggrega Recipes into AWS CloudFormation stack templates. Every component rendering to the same output directory under this provider assembles into one stack, emitted as a single pure-JSON template that uses long-form intrinsics. A boundary therefore becomes one stack in the ordinary case — and two boundaries whose `directory:` resolves to the same path assemble into one stack together, sharing that template's names. Like every Aggrega provider it is offline and hermetic — an Aggrega build is an ahead-of-time compilation, so the provider never calls AWS, never resolves account-generated identifiers, and never runs CloudFormation. Runtime-only values stay as CloudFormation intrinsic references (`Fn::GetAtt`, `Fn::ImportValue`, `Fn::GetStackOutput`) that CloudFormation resolves at deploy time.

## Fragment recipes assembled into a stack

A cloudformation Recipe authors a **fragment** — the CloudFormation resources contributed by a single component — rather than a whole template. When a boundary's components render, the provider assembles every fragment in the dispatch group into one stack template: the resources merge under a single `Resources` map, each component's `provides` values surface as stack `Outputs`, and the template's other top-level sections are accounted for one by one under [Top-level sections in the assembled stack](#top-level-sections-in-the-assembled-stack). Two authoring shapes are accepted:

- **Fragment (artifacts) input.** A Recipe authors resource fragments directly; the provider normalizes them to pure-JSON long-form intrinsics and merges them into the assembled stack.
- **Sourced input.** A Recipe references an existing CloudFormation template (YAML or JSON); the provider normalizes it to long-form JSON and validates its structure before assembly, fills the parameters the template declares from the Recipe's `valuesMapping` — see [Values for a sourced template's parameters](#values-for-a-sourced-templates-parameters) — and leaves out any resource the Recipe's `omits:` entries name — see [Leaving resources out of a sourced template](#leaving-resources-out-of-a-sourced-template).

The assembled template is pure JSON. Intrinsics are emitted verbatim and never evaluated at build time — the compiler cannot resolve a value that only exists after the stack deploys, and evaluating one would break the ahead-of-time contract.

### A Feature attached to a component contributes to the same stack

A Feature attached to a component contributes its resources to the stack its host component assembles into, on the same terms as the host component's own Recipe. There is no separate template beside it: the assembled stack is the whole of what this provider emits for an output directory, so an attached Feature's resources are either in that stack or they are not deployed at all. Detaching the Feature removes exactly those resources and leaves the host component's own untouched.

Because they land in the assembled stack, they share its names. An attached Feature's resource logical IDs sit in the same space as the host component's and as those of every other Feature attached alongside it, so [Names in the assembled stack](#names-in-the-assembled-stack) applies to them unchanged. Where two contributors meet on one name the halt names the component and the key the Feature is attached under, so both ends of the collision are searchable in your own files.

**An attached Feature's outputs publish under its host component's name, and its resource logical IDs do not.** The two halves of the stack are named on different rules, so they answer this differently. A resource logical ID is emitted exactly as the FeatureRecipe authored it, like any Recipe's. An output is named for the publishing component and the entry together — and for a Feature attached to a component, the publishing component is the **host**: a Feature attached to `payments-db` publishing `alarm` reaches `paymentsXzhdbXXalarm`, the same name it would reach had the host component published that entry itself. So an entry name the host also publishes meets the attachment's at one output name, and the build halts naming the component and the key the Feature is attached under alongside the component on its own. Choosing entry names that read as the Feature's own — `backup-alarm` rather than `alarm` — keeps them clear of the host's.

Each resource a Feature contributes keeps the identity composed for that attachment in the provenance the build writes onto it, rather than the host component's, so the two stay distinguishable inside a stack both contributed to. [Labels and annotations](../vocabulary/labels-and-annotations.md) covers how that identity is built.

## Top-level sections in the assembled stack

Several components assemble into one stack, so every top-level section a CloudFormation template admits has to be accounted for by the assembly — including `Globals` and `Hooks`, the two sections a transform CloudFormation hosts adds to the template language. Each one falls into exactly one of the groups below, and a top-level key a component writes that is no section at all gets a warning naming the component and the key, so nothing is dropped without being said.

**Assembled under names the provider scopes, or reads as written.** `Resources` and `Outputs`, which [Names in the assembled stack](#names-in-the-assembled-stack) covers in full. `AWSTemplateFormatVersion` is written by the provider rather than read from any component: the template language admits a single value for it, so there is nothing for a component to decide.

**Carried under exactly the names you wrote.** `Parameters`, `Mappings`, `Conditions`, `Metadata` and `Rules`. Each of these is a map keyed by names you chose, so each component's entries reach the assembled stack under those names, unrewritten — which is what lets a resource's `Condition:`, an `Fn::FindInMap`, or a `Ref` to a parameter resolve against the declaration that arrived alongside it. Each is carried on its own, because each is authored on its own: a rule asserts over a parameter of the same document, a condition may reference no parameter at all, and CloudFormation does not permit a parameter reference inside a mapping.

One word covers two different places here, and only the first of them is yours. The `Metadata` in the list above is the template's own **top-level section**, a map of names you chose. An individual resource also carries a `Metadata` **attribute** of its own, and that is where the build writes provenance — under a single reserved `aggrega.ai/` key, added alongside anything you wrote there rather than replacing it. So a provenance entry appearing inside a resource is not something you authored and not something the top-level section carried.

**`Parameters`, `Mappings`, `Conditions` and `Rules` name their entries with a logical ID.** Because the provider carries a name exactly as you wrote it, the alphabet a logical ID admits reaches these sections too: a name in one of the four carrying anything but letters and digits halts the build — see [A carried section name outside the alphabet halts](#a-carried-section-name-outside-the-alphabet-halts). The provider does not hold the top-level `Metadata` section's names to that alphabet: they name information you are storing rather than anything the template addresses.

Two components declaring different names in one of these sections both land. Two declaring one name with identical content merge into a single entry and the build proceeds. Two declaring one name with **different** content halt the build, naming the section, the name, and both components — because one of the two bodies would otherwise be discarded, leaving the component that wrote it with a declaration the stack does not carry. That is the same reconciliation the resource and output names follow, and renaming either one clears it.

**Named rather than carried.** `Description` is a single statement about a whole template rather than a map of names you chose, so an assembly drawing on several components has no answer for it: two descriptions are two answers to one question and neither is the stack's. `Hooks` is read only by the `AWS::CodeDeployBlueGreen` transform, which the assembled stack never carries (see below). The assembled stack therefore carries neither, and every component that authored one gets a warning naming the component and the section. So does a component that writes `Globals` without declaring the `AWS::Serverless-2016-10-31` transform that reads it. The warning is advisory and out-of-band: the emitted template is byte-for-byte what it would be without it, and `--no-unsupported-field-warnings` silences it along with the rest of that class.

**`Transform` is built from every component's.** A transform is a macro CloudFormation runs over the whole template before it deploys anything, so the assembled stack's `Transform` is the union of the transforms its components declare — a sourced template's and a fragment's alike — in the order CloudFormation documents: a macro your account defines before the transforms CloudFormation hosts, and `AWS::LanguageExtensions` before `AWS::Serverless-2016-10-31`. Each component's own order is kept, and two transforms nothing orders run in the order the components first declare them, so the same components give the same stack. One transform is written as a string and several as a list. A stack with only one component, which declares its `Transform` in one template or fragment, keeps it exactly as it was written wherever the table below carries it, and a stack whose components declare none carries none. A component's transform raises no warning: it is carried, or the build halts naming it.

Because a transform processes the whole template, carrying one changes how every other component's content deploys unless what it does is confined to content written for it. So each transform takes the disposition CloudFormation's own documentation of it supports, and a combination the stack cannot carry halts the build, naming the transform and every component in the stack:

| transform | in the assembled stack |
| --- | --- |
| `AWS::Serverless-2016-10-31` | carried, with the `Globals` of the component declaring it. It halts where those `Globals` would reach another component's serverless resources, and where one of its resources' event sources names a resource another component declares, because the transform rewrites the resource an event names. |
| `AWS::LanguageExtensions` | carried alone, or beside `AWS::Serverless-2016-10-31` from the same component. It halts beside another component's serverless content, because the serverless transform names what it generates differently once language extensions have resolved its values. |
| `AWS::SecretsManager-2020-07-23`, `AWS::SecretsManager-2024-09-16` | carried: they process only the rotation schedules that ask for them. |
| `AWS::ServiceCatalog` | carried for a stack with only one component. Beside any other it halts, because it substitutes its reference pattern anywhere in the template. |
| `AWS::CodeDeployBlueGreen` | halts, even alone: CloudFormation refuses `Outputs` and `Fn::ImportValue` anywhere in a template declaring it, and the assembled stack carries the outputs its components publish. |
| `AWS::Include` | halts, even alone: it inserts content fetched from S3 when the stack deploys, which the build cannot read. |
| a macro your account defines | carried for a stack with only one component. Beside any other it halts, because what it does to the rest of the template is unknown to the build. |

Two components declaring one pair of transforms in opposite orders halt the build too, naming both orders and both components, since the stack runs them in one order. A component that needs a transform the stack cannot carry goes in a boundary of its own.

## Names in the assembled stack

A CloudFormation logical ID is unique within one template and admits only letters and digits, and every component assembling into that template shares its names — including components from a second boundary, when both resolve to the same output directory. So each name the stack addresses something by has to be distinct across every component that contributed it, and the set of contributors is not always a single boundary.

**Resource logical IDs come from the Recipe.** The provider emits them exactly as authored and rewrites none of them, so the name you read in the assembled template is the name the Recipe wrote. The standard-library CloudFormation Recipes derive it from the component instance's own name, reading that name's separators as word boundaries: instance `payments-db` names its resource `PaymentsDb`. Two instances of the same type therefore describe two resources rather than competing for one.

**Output names are scoped by the component that published them.** Each `provides` entry surfaces as an output named for the publishing component and the entry together — component `payments-db` publishing `host` surfaces as `paymentsXzhdbXXhost` — so two components publishing the same entry reach two separate outputs, and an output's meaning does not change when another component joins the stack. A cross-stack consumer imports by the export name rather than by this one, so the export name is unaffected.

#### How an output name is built

A logical ID admits no separator character, so a name built from something you wrote has to carry your separators across somehow. **Dropping them would be lossy**: `payments-db` and `payments_db` are two components, and a name that dropped the punctuation would identify neither. So the provider **encodes** what the alphabet refuses instead, spelling each refused character out in characters the alphabet does admit.

The scheme reserves one character to open an escape with — an uppercase `X` — and writes everything else as you typed it, capitals included. Only the capital is reserved, so the lowercase `x` of a name like `nginx-proxy` is carried through as you wrote it:

| what you wrote | what it becomes | why |
| --- | --- | --- |
| a letter or digit, `X` excepted | itself | the alphabet admits it |
| `-` | `Xzh` | the alphabet refuses a hyphen |
| `_` | `Xzu` | the alphabet refuses an underscore |
| `.` | `Xzd` | the alphabet refuses a full stop |
| `/` | `Xzs` | the alphabet refuses a solidus, which a nested component identity carries |
| `X` | `Xzx000058` | reserved to open an escape, so it is spelled out by code point |
| anything else | `Xzx` and the character's code point | one rule covers every remaining character |
| the two halves meeting | `XX` | two openers in a row, which neither half can contain |

Reading it back is unambiguous, and that is the point rather than a nicety. An `X` is kept as itself only when the character after it is one the alphabet admits, so an encoded half never ends with one and never carries two in a row — which leaves `XX` free to mean the join, and only the join.

So three names that differ only in where their punctuation sits stay apart:

```
component payments-db  publishing host      →  paymentsXzhdbXXhost
component payments_db  publishing host      →  paymentsXzudbXXhost
component payments     publishing db-host   →  paymentsXXdbXzhhost
```

**The names are longer and less immediately readable than the component name you wrote, and that is the trade.** A name that identifies exactly one entry is worth more than a shorter one that identifies neither of two — and you address an output through the export name rather than by typing this one, so what it costs is a second glance when reading an emitted template.

**Resource logical IDs are a different rule**, because the provider does not build them: it emits what the Recipe wrote. The standard-library CloudFormation Recipes derive one by reading the instance name's separators as word boundaries — instance `payments-db` names its resource `PaymentsDb` — and **that derivation drops the separators**, so two instance names differing only in punctuation, or only in a letter's case, still derive one resource name. The build halts, naming every instance that arrived at the name along with the name they landed on, rather than emitting one resource where two components were declared. Every one of them is named rather than some, because nothing about a collision makes one instance's derivation the intended one. Renaming all but one of them clears it.

### A resource logical ID outside the alphabet halts

Uniqueness and the alphabet are two separate requirements, and a set of names can satisfy the first and fail the second. Because the provider emits a resource logical ID exactly as the Recipe wrote it, the ID a Recipe authors has to be one a CloudFormation template can hold on its own: letters and digits, and nothing else.

This is where a derived name and a passed-through one part company. An output name is built by the provider, which encodes the publishing component and the entry, so an output name lies inside the alphabet however you spell either half. A resource logical ID is passed through, so whatever the Recipe wrote is what the template gets.

That makes it a constraint on component names too, whenever a Recipe writes a component instance's name straight into the logical ID. A component name may carry a hyphen or an underscore; a logical ID may not. **A component you target at this provider through such a Recipe is therefore named in letters and digits alone** — `paymentsdb` rather than `payments-db` — and anything else halts the build.

The halt names the contributor whose Recipe authored the ID, the ID itself, and each character in it which cannot be there, and it says what you may write instead. Two things clear it, and the first is the one always available to you:

- Have the Recipe author a logical ID of its own rather than passing a name straight through. The standard-library CloudFormation Recipes take this route — they read the instance name's separators as word boundaries, so instance `payments-db` names its resource `PaymentsDb` and you keep the component name you chose. Deriving an ID that way trades this halt for the collision rule above: two instance names differing only in punctuation derive one resource name.
- Where a Recipe does pass a name straight through, rename whatever it passes in letters and digits alone. For a component's own Recipe that is the component name. A Feature attached to a component names its resources from its own FeatureRecipe, so renaming the host component does not reach them — the ID that Recipe writes is what has to change.

**The provider refuses; it does not quietly repair.** Rewriting the ID on your behalf would look like the helpful thing to do, and it is not. A logical ID is how CloudFormation identifies a resource across updates, so changing one is not a rename — it addresses a different resource. An ID the provider substituted would point somewhere other than the resource already deployed under the ID you wrote, and the substitution is one you never asked for and would have to discover from the emitted template. A build that stops names the problem while it is still yours to fix.

### A carried section name outside the alphabet halts

Resource logical IDs are not the only names the provider carries exactly as you wrote them. `Parameters`, `Mappings`, `Conditions` and `Rules` name their entries with a logical ID too, and each of the four reaches the assembled stack under the name its author chose. So the requirement is the same one, on four more surfaces: the name has to be one a CloudFormation template can hold on its own — letters and digits, and nothing else — and anything else halts the build.

There is one consequence beyond the section that carries the name, and it is the reason this halts rather than warns. These names are what a resource's `Condition:`, an `Fn::FindInMap`, or a `Ref` to a parameter resolves against. A name the alphabet does not admit therefore takes the reference pointing at it out of the deployable template alongside the declaration itself, so a single authored name puts both out of reach at once — and without the halt that is discovered at deploy time, by whoever is deploying rather than whoever wrote the name.

The halt names the contributor whose Recipe wrote the name, the section it was written in, the name itself, and each character in it which cannot be there. **The section is the term to search your Recipes for**: these names are carried under exactly the section you wrote them in, so it is the one word that appears both in the message and in your own files. Renaming the entry in letters and digits alone clears it, and that is the whole of the remedy — a resource logical ID offers the alternative of having the Recipe derive an ID instead of passing a name through, and here there is nothing to derive, because the name in the section *is* what you wrote.

**Only a section's own names are held to the alphabet, never the keys inside an entry.** A mapping's second-level keys are yours to choose freely — `us-east-1` under a `RegionCidr` map is the ordinary case, and it reaches the emitted template untouched. The keys inside a parameter's, a condition's or a rule's body name attributes, assertions and intrinsics rather than anything the stack addresses: a rule's `Assertions`, and an `Fn::Contains` written inside it, are keys of that kind. None of them is a logical ID, and none is checked.

### Two entry names you wrote apart stay apart

Three kinds of entry name sit close enough to meet at a single output name, and none of them is exotic. Because the two halves are encoded rather than folded, and meet at a sequence neither half can contain, all three reach names of their own:

- Entries differing only in punctuation. A component publishing both `db-host` and `db_host` reaches `dbXzhhost` and `dbXzuhost`.
- Entries differing only in a letter's case. `host` and `Host` reach `host` and `Host`, because a letter is carried in the case you wrote it in.
- Entries that meet across the join. Component `payments-db` publishing `host` reaches `paymentsXzhdbXXhost`; component `payments` publishing `db-host` reaches `paymentsXXdbXzhhost`.

**Two entries still meet where they genuinely name one thing.** The output name is built from the publishing component and the entry, so anything sharing both reaches one name however it is encoded. The case you are most likely to meet is one Feature attached twice to a single component: an attachment publishes under its **host**, so two attachments of one Feature on one component both publish `alarm-id` from `payments-db`, and there is nothing in the pair to tell apart. **The build halts rather than emit one output where two were written**, naming the component and the attachment key each side was carrying, so both ends are searchable in your own files. Either attach the Feature once, or use a Feature whose published entry names read as that attachment's own.

This holds whether or not the two entries carry the same value. Two entries with the same value still describe two outputs an author asked for, so merging them into one would leave one of the two written-down outputs absent from the stack.

#### A name a Recipe composes in a template is not covered by this

The encoding above is the provider's, and it applies to the output names the **provider** builds. **It is not available to you inside a Recipe template, and a name your template composes therefore carries none of its guarantees.** Saying so plainly matters because the hazard is invisible from inside the template: the fold available there reads its argument as words and drops everything between them, so joining two values *before* folding loses the join along with the punctuation.

A FeatureRecipe naming a resource from an instance and an attachment key, joined by a space and then folded, is the shape to watch — `app` with `cache` and `app-cache` with nothing both fold to `AppCache`, and the two collide before any property of the fold applies. Two things keep such a name distinct, and both are yours rather than the provider's:

- **Keep the composed parts in letters and digits**, so nothing is dropped and nothing has to be told apart.
- **Do not join two values that can each contain the other's separator.** Where a name must carry two parts, make one of them a fixed literal the other cannot contain.

Where a composed name does collide, it collides as a resource logical ID rather than as an output name, so the halt you meet is the resource-name one above.

### A key written twice in one mapping halts

A CloudFormation fragment is read as a mapping, and a mapping holds one value per key, so a key written twice would keep whichever body came last and discard the other. Where the mapping is a `Resources` or `Outputs` block, the discarded body is a resource or an output that was written and would simply not be in the stack.

The build halts instead, naming the repeated key and both lines it was written at. This is a whole-fragment rule rather than a rule about the stack's names: it applies to any mapping in the fragment, including a resource's `Properties`. The commonest way to reach it is a Recipe deriving a logical ID from an authored value, where two authored values differ only in punctuation — `app-cache` and `app_cache` both derive `AppCache`, so the fragment writes `AppCache` twice.

A key name recurring at different places in the document is ordinary and untouched: `Type` appears once per resource, and `Value` once per output, however many resources and outputs the fragment carries. Only a repeat inside one mapping loses a body.

**A single component can claim one name twice.** A Recipe contributes several fragments — several `artifacts:` entries, or a sourced directory holding several templates — and every one of them assembles into the same stack, so a component's own fragments share the stack's names with each other exactly as they share them across components. Two fragments that give one name two different bodies halt the build, and the halt names the key space the name sits in — resource logical IDs or output names — along with the component and the name itself. Both spaces are reachable this way: two fragments can author one resource logical ID over different resources, and a component reaches its output names through two routes, an explicit `Outputs:` block and its `provides:` entries, so an entry from each carrying one name meets there too.

Restating a name is not itself a conflict. A name written more than once with identical content addresses one thing either way, so the restatements merge into a single entry and the build proceeds — an ordinary repeat costs nothing. What halts is the case that loses content: one of the two bodies would have to be discarded, and the resource or output the Recipe declared would then be missing from the stack. Renaming either one clears it.

## Structural input validation

A sourced CloudFormation template is structurally validated before it renders: the provider parses the template and normalizes its intrinsics, halting the build with a clear message that names the offending node when a template is malformed. The parse checks shape, not semantics — it does not contact AWS, resolve references, or evaluate intrinsics.

**A template that parses is not thereby carried whole.** The parse says the document is well formed; what reaches the assembled stack is decided separately and per section, under [Top-level sections in the assembled stack](#top-level-sections-in-the-assembled-stack) — a sourced template goes through the same accounting a fragment does.

Nor does the parse ask whether the template's references resolve. Whether a `Ref` names a parameter, or an `Fn::FindInMap` a map, is a question about the assembled stack rather than about any one input document, and it is CloudFormation's to answer at deploy time. The build states what it did not carry instead of judging what the result refers to. The references it does judge are the ones the build itself made dangle: one to a parameter a sourced template's binding filled, which the next section covers, and one to a resource an `omits:` entry left out of the template, which the section after it covers.

## Values for a sourced template's parameters

A sourced template takes values the way CloudFormation itself gives a template values: through the `Parameters` it declares. The `valuesMapping` of whatever sources it — a component's Recipe, or the FeatureRecipe of an attached Feature — writes one key per parameter it fills, and the provider binds each one in every template of the source — every `Ref` to the parameter in `Resources`, `Outputs`, `Conditions`, `Rules` and SAM's `Globals` becomes the value, every `Fn::Sub` naming the parameter as a variable receives the value through its variable map, and the parameter leaves the `Parameters` of every template declaring it. A parameter no key names is left exactly as the template wrote it, for a value passed when the stack deploys or for its `Default`.

**The source is the unit that declares a parameter.** A directory source's templates assemble into one stack, so one template may reference a parameter another template of the same source declares. Filling the parameter fills it there too: a template that only references it receives the value as the first template of the source declaring it converted it, and nothing in the source is left referencing a parameter whose declaration the binding removed.

**Another component cannot reference a filled parameter.** Content outside the source — another component's fragment or sourced template in the same stack — that names a parameter the source's binding filled, through `Ref`, an `Fn::Sub` variable or a rule's `Fn::ValueOf`, would name something the assembled stack no longer declares, which CloudFormation refuses when the stack deploys. So the build stops, naming each component, its template and the parameter, and the component whose `valuesMapping` filled it — a Recipe's, or an attached Feature's FeatureRecipe's; a Feature attached to a component is named by that component, and one attached to a boundary by the identity its resources carry as `aggrega.ai/component-id`, composed from the boundary's path and the attachment's name (`bfr--stack--aux` for an attachment `aux` on boundary `stack`). The fragment of the component a Feature is attached to, or of a component in the boundary it is attached to, that references a parameter the attachment's binding filled stops the build too. A name the stack still declares is not affected: where another component declares a parameter of that name itself, or a resource carries it as its logical ID, its references resolve to that declaration and are left as written. To pass the value on, have the filling component publish it, declare the parameter in the template that references it, or remove the key from the `valuesMapping`.

```yaml
spec:
  capability: cloudformation
  implements: core/delivery-stream:1.0.0
  source:
    kind: git-repository
    url: https://github.com/aws-cloudformation/aws-cloudformation-templates.git
    ref: a0f43bc6d20813052892546f445037cf84c75b54
    module_subdir: DataFirehose
  valuesMapping: |
    CloudWatchLogGroupRetention: {{ .values.retention_days }}
    DestinationBucketName: "{{ .context.inject.env.BUCKET_NAME }}"
```

**Only a `valuesMapping` fills parameters.** The keys it writes are the parameter names you meant for the template, so each has to name a parameter some template of the source declares: a key naming none stops the build, naming the key and the parameters each template does declare — the failure CloudFormation would report for an unknown parameter, reported while it is still yours to fix. A Recipe or FeatureRecipe declaring no `valuesMapping` fills nothing: the component's or the attachment's own values reach the provider under their own names, written for its other inputs, and are left unread.

**What a value is decides what reaches the template.**

- A literal — a string, a number, a boolean, or a list of them — is written into the template, converted the way CloudFormation converts the same value passed for the parameter's `Type` when the stack deploys: a `Number` becomes the string a `Ref` to it yields, so `7` arrives as `"7"`; a `CommaDelimitedList` or a `List<…>` type becomes a list of strings, taking either a list or a comma-separated string whose members are trimmed; every other type takes one string. A literal is checked against the parameter's own `AllowedValues`, `AllowedPattern`, `MinLength`, `MaxLength`, `MinValue` and `MaxValue`, and one they refuse stops the build, naming the parameter and the constraint, so filling a parameter removes no check the template declared. A pattern written in a regular-expression syntax the build cannot read is left for CloudFormation to check when the stack deploys.
- A value that is wholly one CloudFormation intrinsic reaches the reference site as that intrinsic, for CloudFormation to evaluate when the stack deploys: a long-form mapping such as `{"Fn::GetAtt": [Queue, Arn]}`, or a string that is exactly one short form — `!GetAtt Queue.Arn`, `!Ref Bucket`, `!Sub …` and the other forms CloudFormation defines. That is how another component's published reference reaches a parameter: the catalog's CloudFormation Recipes publish such a reference as short-form text, and a `valuesMapping` reading it off the injection context passes it on. **Quote a spliced reference** — `"{{ .context.inject.env.BUCKET_NAME }}"` — because unquoted, the mapping's own YAML reads `!GetAtt Queue.Arn` as a tag and hands on only `Queue.Arn`. A value that only begins with an exclamation mark, or that names no CloudFormation short form, stays text.
- A dynamic reference — `{{resolve:ssm:…}}`, `{{resolve:ssm-secure:…}}` or `{{resolve:secretsmanager:…}}` — reaches the reference site as written, for CloudFormation to resolve when the stack deploys, so the value it names is never in the template.
- A value another component publishes from a different stack reaches the template as a cross-stack reference, the same `Fn::ImportValue` or `Fn::GetStackOutput` a fragment receives (see [Cross-stack wiring](#cross-stack-wiring)), at every place the template referenced the parameter.

A parameter whose type CloudFormation reads from Parameter Store — `AWS::SSM::Parameter::Value<…>` — has no literal that reproduces what CloudFormation would do with it, so a literal bound to one stops the build; bind a `{{resolve:ssm:…}}` reference or an intrinsic, or leave it unbound. A list bound to a parameter the template names as an `Fn::Sub` variable stops the build too, because a variable substitutes one string.

**A rule that reads a parameter by name keeps it unbound.** `Fn::ValueOf` in a template's `Rules` names a declared parameter by its logical ID rather than through `Ref`, and filling the parameter removes its declaration, so binding one a rule reads that way stops the build, naming the rule and the parameter.

**A literal that may carry a secret is refused; an intrinsic is written as given.** A value that is written into the template is readable by anyone who can read the stack's template:

- A parameter the template declares `NoEcho` takes a dynamic reference or an intrinsic, and a literal bound to it stops the build.
- Where the `valuesMapping` reads a value an author declared sensitive, none of its output can be traced back to the value it came from, so every literal it binds stops the build. A dynamic reference and an intrinsic it binds are written as given — the text inside an intrinsic included. A secret the mapping splices into the text of an `Fn::Sub`, say, therefore reaches the template as that text: only a dynamic reference keeps the secret itself out of the template.
- A dynamic reference stops the build where its parameter is referenced in a resource's `UserData` property, in `AWS::CloudFormation::Init` metadata, or in `Outputs`: CloudFormation does not resolve a dynamic reference in EC2 user data or in that metadata, and shows `Outputs` to whoever reads the stack.

Every such refusal names the parameters, and quotes no value.

## Leaving resources out of a sourced template

A sourced template's resources are its own: values reach it only through the parameters it declares, so a template fetched from a git repository that declares a resource the Release must not create — a bucket the operator already provides, a key the platform manages elsewhere — cannot be changed by a value. That is what the [`omits:`](../entities/recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source) entries of a Recipe or a FeatureRecipe are for. This provider honours them on a sourced template and on nothing else: the fragments an `artifacts:` entry authors render without them.

```yaml
spec:
  capability: cloudformation
  implements: core/store:1.0.0
  source:
    kind: git-repository
    url: https://git.example.com/platform/templates.git
    ref: v3.2.0
    module_subdir: store
  omits:
    # The template bundles an access-log bucket; this Release logs elsewhere.
    - kind: AWS::S3::Bucket
      name: StoreLogs
```

**An entry names one resource by its `Type` and its logical ID.** The entry's `kind` is the resource's `Type`, such as `AWS::S3::Bucket`, and its `name` is the resource's logical ID, its key under `Resources`; both are compared exactly as written, and both have to match, so an entry whose `Type` is right and whose logical ID is not leaves nothing out. A template has no namespaces, so an entry carrying a `namespace` stops the build when the component renders, naming the entry; every entry is checked before anything is left out.

**Every template of the source is matched.** A single-file source has one template. A directory source — a source fetched from a git repository is always one — has every file ending `.yaml`, `.yml`, `.json` or `.template`, and an entry leaves out every resource it names in any of them; a file carried alongside the templates is never read. The provider reports how many resources each entry left out across all of them, and an entry that left none out stops the build; see [An omits entry left out nothing the source rendered](../errors/fatal-halts.md#an-omits-entry-left-out-nothing-the-source-rendered).

**A resource left out is gone before anything else reads the template.** It is not stamped with provenance, not counted among the names the stack carries — so another component may contribute a resource under the same logical ID without the two meeting — and it never reaches the assembled stack. Everything else in the template is written exactly as it would be had the template been authored without the resource, and a template every resource of which is left out keeps an empty `Resources` section.

**A resource left out must not stay named by what remains**, because CloudFormation refuses a template that names a resource it does not declare. Once the resources are removed, every reference the remaining templates still make to one of them stops the build, and the message names the template, the resource, how the reference names it, and where the reference sits as a path from the template's root — `/Resources/Store/Properties/LoggingConfiguration/DestinationBucketName`, say. A reference is what CloudFormation's template reference defines as naming a resource by its logical ID, read in every resource's body — its properties, its metadata and its policies included — and in every output:

- `Ref`, with the logical ID as its argument;
- `Fn::GetAtt`, as a list whose first item is the logical ID, or as one string — `!GetAtt StoreLogs.Arn` — whose text before the first dot is;
- a resource's `DependsOn`, as one logical ID or a list of them;
- each variable of `Fn::Sub`, in its string form and in its list form: `${StoreLogs}` and `${StoreLogs.Arn}` both name `StoreLogs`.

Some values only look like references and are not read as one. `${!StoreLogs}` is literal text, and a variable the list form's map names is that map's value. A resource's `Condition` and the first argument of `Fn::If` name a condition, `Fn::FindInMap` names a mapping, `Fn::ImportValue` an export of another stack, and `Fn::GetAZs` a region. The `Conditions`, `Mappings`, `Parameters` and `Rules` sections cannot name a resource, and the template's own top-level `Metadata` section is information CloudFormation stores rather than reads, so none of them is checked. A `Ref` or an `Fn::GetAtt` whose logical ID is itself written as an intrinsic function is valid only under the `AWS::LanguageExtensions` transform, which resolves it when the stack deploys (see [Top-level sections in the assembled stack](#top-level-sections-in-the-assembled-stack)), so it names no resource the check can read and is left as it is; so is a reference to a resource the source never declared.

**The check reads the declaring Recipe's or FeatureRecipe's own templates, together.** They assemble into one stack, so a reference to a logical ID another of those templates still declares is not stopped. Nothing else is read: a reference to a left-out resource stops the build even where another component declares a resource of that logical ID, and a reference made by anything else that assembles into the stack — another component, an attached Feature, or the Recipe's own `artifacts:` entries — is not one this check sees, so CloudFormation refuses the stack when it is deployed. To keep a reference, keep the resource. A value bound to a parameter replaces only a reference to that parameter, so a reference to a resource is the template's own and cannot be changed by one: leave out the resource making it as well, or remove the entry. An output is not a resource and no entry names one, so a resource the template's `Outputs` name cannot be left out of it: leaving it out stops the build.

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
