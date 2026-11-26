---
example:
  level: advanced
  tier: importers
  position: 11
  products: [core/messaging/azure-event-hubs, core/compute/server]
  shows: [import, cloud-infrastructure, credentials, connections]
---

# Import an Azure Resource Manager template — an App Service site, its Event Hubs namespace and a static site

An Azure Resource Manager template written in the compiled JSON form a Bicep
build produces — an Event Hubs namespace deployed through the Azure Verified
Modules module, an App Service site running a container, a static web app and
the virtual network the site is meant to join — drafted into Aggrega files by
`aggrega import`: the namespace and the site mapped to the standard library's
Components, the static web app, which no catalog Component stands for, drafted
from the template. The build writes one Azure Resource Manager template. Every
Recipe the build uses writes its resources itself, so the example runs with no
network beyond the catalog.

[Import an Azure Resource Manager template](../../../authoring/import/arm.md)
walks it step by step: the command, the files it writes and why each line is
there, the values the draft leaves for you, the build, and the template it
writes. This folder holds each stage of that walkthrough:

| folder or file | what it holds |
|---|---|
| `source/` | the `.aggrega-config.yaml` that makes the folder a workspace, and `notes/`, the template `main.json` and the parameters file `main.parameters.json` beside it |
| `draft/` | the files `aggrega import notes` wrote, unchanged, `release.lock` left out, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error. Its Release stops at validation, as the walkthrough shows |
| `reviewed/` | the draft with the Release's values the draft leaves for you written: the site's subnet and image, and the namespace's tier, throughput units and region. A workspace that validates and builds |

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, confirms the drafted Release stops
where the walkthrough says it does, and validates and builds `reviewed/`. It
needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Draft the example

You can run this example's import with the commands below, or
[have your AI assistant run it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega draft --example import-arm
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-arm
```

## Build

The import drafts the Aggrega files beside the template, in `source/`. It
weighs the template against the standard-library catalog and drafts for the
`arm` target, the importer's default, so the Release names the Manifest it
needs. It then pulls what the drafted Release depends on:

```sh
cd source
aggrega import notes
```

The draft's Release stops at validation, naming the subnet the site joins, and a
build of it stops there too. `reviewed/` holds the Release with that subnet, the
site's image and the namespace's tier, throughput units and region written, which
builds:

```sh
cd ../reviewed
aggrega pull --release release.yaml
aggrega build --release release.yaml
```

The build writes `dist/arm/arm-template.json`; deploying it is in the
walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-arm` folder yet, call the `draft` tool once with `example` set to `import-arm` and no `dir`: it writes the example into a new `import-arm` folder. Then call the `import` tool with `workspace_root` set to `import-arm/source` and `source` set to `notes`: it writes its drafts into `import-arm/source` and pulls what they need. Then call the `build` tool with `workspace_root` set to `import-arm/reviewed`, `release` set to `release.yaml`, `auto_pull` set to true and `write` set to true. Tell me which files the build wrote; they are under `import-arm/reviewed/dist/`.

## License

`source/notes/main.json` embeds the compiled template of the Azure Verified
Modules module `avm/res/event-hub/namespace` at 0.15.3, as the
Microsoft Container Registry serves it, its content unchanged inside the file's
`ehModule` resource. The module is published by Microsoft from
<https://github.com/Azure/bicep-registry-modules> under the MIT License. The layer is the one of the image
`mcr.microsoft.com/bicep/avm/res/event-hub/namespace:0.15.3`, with the digest
`sha256:04136424c82b44282eb9c80e49751d5cbd94f080ae16c10a9ac64692067fd7a4`:

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
