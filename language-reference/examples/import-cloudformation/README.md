---
example:
  level: advanced
  tier: importers
  position: 12
  products: [core/datastore/postgres]
  shows: [import, cloud-infrastructure, connections]
---

# Import a CloudFormation template — a PostgreSQL instance and a mail configuration set

An AWS CloudFormation template that declares the AWS Serverless Application
Model transform — an RDS PostgreSQL instance reading two exports of another stack,
and an Amazon SES configuration set — drafted into Aggrega files by
`aggrega import`: the instance mapped to the standard library's PostgreSQL
Component, the configuration set, which no catalog Component stands for, drafted
from the template. The build writes one CloudFormation stack template. Every
Recipe the build uses writes its resources itself, so the example runs with no
network beyond the catalog.

[Import a CloudFormation or SAM template](../../../authoring/import/cloudformation.md)
walks it step by step: the command, the files it writes and why each line is
there, the values the draft leaves for you, the build, and the template it
writes. This folder holds each stage of that walkthrough:

| folder or file | what it holds |
|---|---|
| `source/` | the `.aggrega-config.yaml` that makes the folder a workspace, and `orders/`, the template `template.yaml` |
| `draft/` | the files `aggrega import orders` wrote, unchanged, `release.lock` left out, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error. The drafted Release validates and builds as it is |

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and validates and builds the drafted
Release. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Draft the example

You can run this example's import with the commands below, or
[have your AI assistant run it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega draft --example import-cloudformation
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-cloudformation
```

## Build

The import drafts the Aggrega files beside the template, in `source/`. It
weighs the template against the standard-library catalog and drafts for the
`cloudformation` target, the importer's default, so the Release names the
Manifest it needs. It then pulls what the drafted Release depends on:

```sh
cd source
aggrega import orders
```

The drafted Release validates and builds as it is:

```sh
aggrega build --release release.yaml --auto-pull
```

The build writes `dist/cloudformation/cloudformation-stack.json`; deploying it
is in the walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-cloudformation` folder yet, call the `draft` tool once with `example` set to `import-cloudformation` and no `dir`: it writes the example into a new `import-cloudformation` folder. Then call the `import` tool with `workspace_root` set to `import-cloudformation/source` and `source` set to `orders`: it writes its drafts into `import-cloudformation/source` and pulls what they need. Then call the `build` tool with `workspace_root` set to `import-cloudformation/source`, `release` set to `release.yaml`, `auto_pull` set to true and `write` set to true. Tell me which files the build wrote; they are under `import-cloudformation/source/dist/`.
