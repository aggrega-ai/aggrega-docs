# The import answers file

Some values no source can hold: the image of an application built from your own code, the email of an owner account, a model the source does not name, the name of a Kubernetes Secret. [`aggrega import`](cli/aggrega-import.md) drafts each such value as an empty string, under a comment saying what it is, and takes it from you once — from the answers file, or from a question at a terminal. The answers are kept in the answers file, `import-answers.yaml`, so every later import of the same source reads them from there and asks nothing.

This page describes where the file lives, what it holds, how the values get into it, and what an import does when a value is still missing. What an import is for, and walkthroughs from a source to a build, are in [Import](../authoring/import/README.md).

## Which values are owed

After drafting, the import reads every drafted document against its own schema, and against the catalog schema of each Component, Feature and connection the document declares. A value is **owed** when it is still empty where that schema requires one, or where the schema declares the key and nothing supplied it. Each owed value is described by the schema's own description of its key; where the schema gives none, by the comment the draft writes above the key.

While any value is owed, the import does not pull the drafted Release's dependencies; it pulls them once every value is answered (see [Re-running and `--sync`](#re-running-and---sync)).

## Where the file lives

| The source is | The answers file is |
|---|---|
| a file | `import-answers.yaml` in the same directory as the source file |
| a directory | `import-answers.yaml` inside the source directory |

`--answers <file>` names another file. A relative path resolves against the directory you run the command in. Where the drafts owe values and the answers file is not the default one beside the source, the record the import writes beside the drafts, `.aggrega-import.json`, names it, so a later `aggrega import --sync` into the same directory reads it without being told again. The record never holds an answer.

A secret's answer is the name of where the secret comes from, never the secret itself (see [Secrets](#secrets)), so the answers file can be kept with the source in version control.

## What it holds

The file is YAML. Its top-level keys are the drafted files, by the path each is drafted at. Beneath each, a key is the dotted key path of an owed value inside that document, and its value is the answer. The schema's description of the key is written as a comment above it. A key-path segment that is empty, or holds a full stop, whitespace or a quotation mark, is written in double quotes. A file that does not read as this shape stops the import, naming the file and why, and nothing is written.

For example, the [Google ADK import](../authoring/import/google-adk.md) drafted with `--target helm` owes two values in its Release: the image of the agent you build from your project, and where the agent's Gemini API key comes from. With both answered, the answers file inside the source directory `support_agent/` reads:

```yaml
# Values the import could not draft from the source, keyed by the drafted file and the key path inside
# it. Write each one beside its key; an import of the same source, and a sync, read them from here and
# ask nothing. A secret is never written here: its key asks where the secret comes from — a variable
# name, ${NAME}, or the name of a Kubernetes Secret.
release.yaml:
  # Container image running the application built on ADK, serving its API on infra.port on every
  # interface.
  spec.components.support-agent.infra.image: "ghcr.io/example/support-agent:1.0.0"
  # The origin of the secret value, written by the operator in the Release. Read exactly as
  # values.origin is. Write it here or in values.origin, never in both. A secret: name where it comes
  # from, never the value.
  spec.components.support-agent.uses.model.gemini-2-5-flash.features.credential.infra.origin: "google-api-key"
```

Both answers are yours: `ghcr.io/example/support-agent:1.0.0` stands for the image you build and push, and `google-api-key` for the name of the Kubernetes Secret holding the key in the namespace you deploy to.

Each answer is one value, and the import writes it into the draft as a string, in place of the empty one, changing nothing else in the draft. An answer written into a drafted Aggregate reads back exactly as you typed it, `{{` included. An empty answer leaves the value owed.

## How the values get in

The import answers each owed value from the answers file first. For each value the file leaves unanswered, it asks you, one question at a time — but only where standard input and standard output are both a terminal, and `--dry-run` is not given:

- each question names the drafted file and the key path, and is worded from the schema's description;
- the questions are written to standard error, so standard output carries only the import's result;
- pressing Enter leaves the value for later, and ending the input stops the asking.

Every answer you give is written into the drafts and into the answers file, and the answers file is named among the files written. A run that changes nothing in the answers file does not write it again.

## Secrets

A secret's value — one whose schema marks it sensitive — is answered with where the secret comes from, never with the secret itself. Its question asks for that, and the answer is one of these names:

| Answer | Example |
|---|---|
| a variable name | `OPENAI_API_KEY` |
| a reference to a variable | `${OPENAI_API_KEY}` |
| the name of a Kubernetes Secret | `openai-api-key` |

The import checks that the answer has the form of one of these names, and refuses anything else:

- at a terminal, the answer is refused, the reason is shown, and the question is asked again;
- in the answers file, the import stops, naming the answers file, the drafted file and the key — never the answer, which may be the secret itself — and writes nothing.

The check reads the form of the answer, so a secret that happens to look like a name is not told apart from one. The secret itself stays where the name points: in the variable, or in the Secret.

## With no terminal

In continuous integration, through a pipe, from the assistant's import tool (`aggrega mcp`) and from the editor, nothing is asked. An import that still owes values once the answers file is read:

- writes the drafts, each owed value left empty;
- writes the answers file with every owed key present and its answer empty;
- names each owed value on standard error, as a warning naming the drafted file, the key path and its description;
- does not pull the drafted Release's dependencies;
- exits with status 1 and one sentence saying how many values are owed and where to write them:

```text
2 values the drafts leave empty are still owed, listed in the answers file <path>/support_agent/import-answers.yaml: write each beside its key there, then run the import again
```

Write each answer beside its key, then run `aggrega import <source> --sync` into the same directory: it drafts for the target the earlier import was given, writes each answer into the drafts and asks nothing. A plain `aggrega import` into a directory that already holds the drafted Aggregate stops, naming `--sync`, and writes nothing. An import into a fresh output directory reads the answers file too: the default one, or the one `--answers` names.

The assistant's import tool takes the answers file as `answers`, named relative to the workspace root or absolute. A call that still owes values fails with that sentence and carries the import's result, the warnings included, beside it. The editor's import takes the answers file too, and the same sentence closes its diagnostics.

Under `--dry-run` nothing is asked and nothing is written, the answers file included. Each owed value is still named on standard error, and the exit status is the dry run's own.

## Re-running and `--sync`

`aggrega import --sync` reads the same answers file as the import before it: the one `--answers` names, else the one the record beside the drafts names, else the default one beside the source. It writes each answer into the drafts in place of the empty value, and where the answers file answers every owed value it asks nothing.

Once nothing is owed and the workspace is not offline, the import pulls the drafted Release's dependencies as [`aggrega pull`](cli/aggrega-pull.md) does, writing `release.lock`, so `aggrega validate` and `aggrega build` work on the drafts at once. Under `--offline` nothing is pulled, and the import names the `aggrega pull --release <path>` to run next.

## One answers file for several targets

The same source drafted for different targets can owe different values: the Google ADK Release above, drafted with `--target compose`, owes the image alone, and the same Release drafted with `--target helm` also owes where the agent's Gemini API key comes from. One answers file serves both:

- the import adds the keys its drafts owe and sets the answers it is given;
- an answer for a key these drafts do not owe is kept in the file and not applied;
- every other key and comment in the file stays as it is.

The answers file is read only where the drafts owe some value. Where they do, an information line on standard error names each answer kept and not applied — here for the [Flowise import](../authoring/import/flowise.md) drafted with `--target compose`, which owes the owner's email alone, reading an answers file that also names the two Kubernetes Secrets the same import owes with `--target helm`:

```text
info: the answers file <path>/import-answers.yaml also answers spec.components.flowise.features.owner_password.infra.origin in release.yaml, spec.components.flowise.uses.model.chatopenai-0.features.credential.infra.origin in release.yaml, which these drafts do not leave empty; those answers are kept there and not applied
```

Where the drafts owe nothing — the [Langflow import](../authoring/import/langflow.md) drafted with `--target compose`, say, which reads every secret from a variable — the answers file is not read, no such line is printed, and the file is left as it is.

## See also

- [`aggrega import`](cli/aggrega-import.md) — the command's reference, every flag included.
- [Import](../authoring/import/README.md) — what an import drafts, and a walkthrough for each source format.
