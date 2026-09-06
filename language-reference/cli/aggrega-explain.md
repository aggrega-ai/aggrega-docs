# aggrega explain

Explain the halting condition a code names

<!-- BEGIN GENERATED: cli-explain -->
**Synopsis**

```
aggrega explain <code>
```
<!-- END GENERATED: cli-explain -->

## What it does

A build that stops prints a bracketed head naming the category the failure is attributable to and the condition's **short code** — the letter `E` and four digits:

```
[CATALOG_ERROR E0209] Recipe: valuesMapping requires source ...
```

`aggrega explain E0209` turns that code into the condition it names and the walk-through of the authoring fix:

```bash
aggrega explain E0209
```

The reply opens with both of the condition's identifiers and the fixed sentence its diagnostics begin with, and then reproduces the entry that explains what causes the condition and what to change — the same entry published in [fatal-halts.md](../errors/fatal-halts.md).

## The code to pass

Either of the condition's two codes is accepted, because each of them reaches you on a different surface.

**The short code** is the one a terminal shows you, and it is the one to reach for when all you have is printed output. A number is handed out once and then fixed, so a short code you pasted into a report a year ago still names the condition it named then.

**The descriptive code** is the qualified, hyphenated one a structured diagnostic carries as a field of its own, and which a program branches on. If that is what you are holding, pass that instead — the condition above is registered under `validator/recipe-values-mapping-requires-source`:

```bash
aggrega explain validator/recipe-values-mapping-requires-source
```

A condition's two codes name the same condition, so both spellings answer identically. The short code is matched without regard to case, since it is a value you read off a screen and type back in.

[sentinels.md](../errors/sentinels.md) teaches the three identifiers a condition carries and when to reach for each.

## Where the answer comes from

**Most conditions are answered from the binary.** Their two codes and the sentence their diagnostics open with are declared inside the compiler, so that much needs no network, no cache and no configuration.

**A provider's own conditions are answered from the published reference.** A provider declares the conditions it can report, and it declares them inside itself rather than in the compiler that loads it — so their codes resolve against [sentinels.md](../errors/sentinels.md), which lists every condition the product declares.

**The walk-through is published documentation** too, read from [fatal-halts.md](../errors/fatal-halts.md). Both pages come from the documentation bundle cached for your workspace; when the workspace has no copy, the command acquires one, once, and reads from the cache afterwards. The same bundle serves the documentation an assistant reads through [`aggrega mcp`](aggrega-mcp.md).

Three replies are worth recognising, because each asks something different of you.

**A condition with no entry yet.** The codes and the sentence are reported, and a note says the halting-conditions page carries no walk-through for that condition. Every condition is still listed in [sentinels.md](../errors/sentinels.md).

**No documentation available.** For a condition the compiler declares, the codes and the sentence are still reported and a note names the bundle and the version that could not be read. For a provider's own condition there is nothing left to answer with, so the code is refused — and the refusal says the reference was not consulted, because without it a code the compiler does not declare cannot be told apart from a typo. A workspace pinned offline, or one that has never reached its registry, is the usual cause.

**A retired number.** A number that named a condition and no longer does is answered as retired, with what it named, rather than as a code that never existed — and it is never answered with a different condition, because a retired number is not handed out again.

## Examples

Explain a code straight out of a failed build:

```bash
aggrega build --release release.yaml || aggrega explain E0209
```

Explain a code a program matched on:

```bash
aggrega explain compiler-renderer-compose/unsupported-compose-port-protocol
```

## The same answer from an assistant

An AI assistant connected through [`aggrega mcp`](aggrega-mcp.md) reaches the same declarations through the `explain-error` tool: hand it the diagnostic text and it returns the diagnostic together with the condition its short code names, so the assistant can branch on the descriptive code rather than on the wording of a message.
