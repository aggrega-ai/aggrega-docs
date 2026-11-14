---
example:
  level: start
  tier: importers
  position: 9
  products: [core/ai-agent/crewai, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import a CrewAI project — a crew of two agents

The agent and task declarations of a CrewAI project in the classic layout —
two agents on one OpenAI model, one task each — drafted into Aggrega files by
`aggrega import`, with the image the crew's program runs in answered once in an
answers file, and built for Docker Compose.

[Import a CrewAI project](../../../authoring/import/crewai.md) walks it step
by step: the command, what it asks for, the files it writes and why each line
is there, the build, and the crew running. This folder holds each stage of that
walkthrough:

| folder or file | what it holds |
|---|---|
| `source/` | the project's declarations, `src/support_brief/config/agents.yaml` and `tasks.yaml`, the `.aggrega-config.yaml` that makes the folder a workspace, and `src/support_brief/import-answers.yaml`, the values no declaration holds: each agent's image, and the name of the Kubernetes Secret a build for Kubernetes reads the OpenAI key from |
| `draft/` | the files `aggrega import src/support_brief --target compose` wrote, unchanged, `release.lock` included, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

The declarations are written for this example. The crew's program is not part
of it: the import never reads one, and the Release names the image it runs in.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and validates and builds what the
import wrote. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Scaffold the example

You can run this example's import with the commands below, or
[have your AI assistant run it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega scaffold --example import-crewai
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-crewai
```

## Build

The import drafts the Aggrega files beside the project, in `source/`. It weighs
the project against the standard-library catalog, which the workspace's default
registry publishes as a signed snapshot: the first import fetches it, verifies
it, keeps it in the workspace's content cache and names it by its digest in the
record it writes beside the drafts. A workspace that names its own catalog
folders — in `AGGREGA_CATALOG_DIRS`, or under `workspace.catalog_dirs` —
imports against those instead. The import reads the images from
`src/support_brief/import-answers.yaml`, then pulls what the drafted Release
depends on, so the build follows at once:

```sh
cd source
aggrega import src/support_brief --target compose
aggrega build --release release.yaml
```

The image the example names stands for one you build from your project;
building it and running the stack are in the walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-crewai` folder yet, call the `scaffold` tool once with `example` set to `import-crewai` and no `dir`: it writes the example into a new `import-crewai` folder, whose `source` folder holds what this example imports. Then call the `import` tool with `workspace_root` set to `import-crewai/source`, `source` set to `src/support_brief` and `target` set to `compose`: it reads the answers it needs from `import-answers.yaml` inside the `src/support_brief` folder, writes its drafts into `import-crewai/source` and pulls what they need. Then call the `validate` tool with `workspace_root` set to `import-crewai/source` and `release` set to `release.yaml`, and the `build` tool with `workspace_root` set to `import-crewai/source`, `release` set to `release.yaml` and `write` set to true. Tell me which files the build wrote; they are under `import-crewai/source/dist/`.

## Test it

With the stack running as the walkthrough runs it, one request reaches the
crew. The route below is the walkthrough's own program's, a small HTTP server
on port 8000; your own program decides its own. The services publish no port,
so the request comes from a container on the stack's network:

```sh
docker run --rm --network support-brief_compose curlimages/curl:8.11.1 -sS -X POST \
  http://researcher:8000/kickoff -H 'Content-Type: application/json' \
  -d '{"question": "Which support plan covers a weekend outage, and what does it cost?"}'
```

```text
{
  "error": "the crew failed: AuthenticationError: Error code: 401 - {'error': {'message': 'Incorrect API key provided: sk-place************-key. [… omitted: where to find an API key, and the error's type and code]"
}
```

The run's key was a placeholder, so the answer is OpenAI's refusal of it. On
Kubernetes, forward a local port to the Deployment, which has no Service, and
send the same request to it from another terminal:

```sh
kubectl port-forward deploy/researcher 8000:8000
```

```sh
curl -sS -X POST http://127.0.0.1:8000/kickoff -H 'Content-Type: application/json' \
  -d '{"question": "Which support plan covers a weekend outage, and what does it cost?"}'
```

The answer is the same.
