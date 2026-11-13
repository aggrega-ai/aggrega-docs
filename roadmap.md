# Aggrega roadmap

Where Aggrega has come from and where it is going, in large steps. Milestones 0 to 3 describe what the
compiler and its catalog do today; Milestone 4 and the directions after it describe the work ahead. This page gives
no dates. What works today, surface by surface, is on
[Status of the Language](language-reference/10-status.md).

## Milestone 0 — A prototype

A first prototype compiled YAML documents through an intermediate graph into Helm output and showed that
the approach holds. The compiler that followed was written around the entity model below.

## Milestone 1 — The compiler core

- **The entity model.** Developers describe an application in an Aggregate. Platform teams supply the
  Components and Features it uses and the Recipes and FeatureRecipes that realize them on a target; a
  Manifest maps each type to its Recipe, and a Release places the Aggregate in one environment.
- **The compilation pipeline.** Resolution, topology construction, graph finalization, static analysis and
  rendering turn the documents into an intermediate graph of components and the `uses` connections
  between them, and then into files.
- **The injection contract.** A component publishes its connection values through `provides`, and the
  compiler pipes them into each consumer through `inject`, across namespaces, without the developer
  writing a host name.
- **Per-environment parameters.** An Aggregate exposes parameters, and each Release fills them in for its
  environment.
- **Kubernetes manifests and Helm charts**, written per boundary, with `aggrega build` and `aggrega inspect`.

## Milestone 2 — A complete pipeline

- **Features that render resources, and credentials as Features.** An attached Feature can render
  resources of its own, and a credential is a Feature like any other, delivered to its component as an
  environment variable or a file.
- **Docker Compose**, with a bridge that relays connections between Compose networks.
- **Three ways to write a Recipe, which combine:** wrap an existing chart, module or file (`source:`),
  describe a container once as a Workload for the target to synthesize (`workload:`), or emit files of
  your own (`artifacts:`).
- **Deterministic output.** Author order is kept everywhere, so identical input gives byte-identical
  output.
- **One schema language.** JSON Schema 2020-12, with a compact YAML shorthand, reusable schema and mapping
  libraries, typed parameter contracts and cross-field assertions.
- **Features attached by annotation.** A Release or an Aggregate attaches a Feature by writing an
  annotation the Manifest binds, with the same output as attaching it explicitly.
- **`aggrega build --trace`**, which writes each component's intermediate state for debugging.

## Milestone 3 — Ready for public use

Everything from Milestone 2 up to the public release:

- **Five targets, rendered by plugins.** Kubernetes manifests, Helm charts, Docker Compose, Terraform and
  CloudFormation are each written by a WebAssembly provider plugin built into the binary, so a fresh
  install renders offline; the compiler writes the files and never runs the tools. A Workload's `form`
  chooses the controller it becomes: stateless, stateful, daemon, scheduled or a one-off task.
- **Plugins for everything domain-specific.** Providers, policies, importers, pipeline steps and
  command-line extensions are WebAssembly plugins, written with the plugin kits for Go, Rust and
  TypeScript. Host and plugin exchange data through one versioned interface encoded in CBOR, generated
  from a single schema for all three languages.
- **Governance.** A policy plugin attached to a workspace checks every build: it rejects a graph or a
  rendered file that breaks a rule, saying what to fix, or supplies labels and annotations a developer
  never types.
- **Registries, lockfiles and signing.** Catalog entities, Aggregates included, are published to and pulled
  from OCI registries by name and version; `aggrega pull` pins every dependency in a lockfile, and
  artifacts are signed at publication and verified at pull.
- **The standard-library catalog and its public hub.** Components for agents, models, gateways,
  datastores, messaging, observability, security and storage, organized by type, category and capability
  labels and served from `hub.aggrega.ai`.
- **`aggrega import`.** Importer plugins draft Aggrega files from Langflow, Flowise, n8n, Dify, CrewAI,
  LangGraph, Google ADK, Microsoft Agent Framework, MCP and Docker Compose projects, scoring each mapping
  against the catalog; `--sync` keeps the drafts in step with their source.
- **A gentle start.** A Release or an Aggregate with a single scope needs no boundaries or subsystems, and
  `aggrega scaffold`, `aggrega edit-document`, `aggrega validate`, `aggrega lint` and `aggrega explain`
  support the authoring loop.
- **The editor and the assistant.** The Visual Studio Code extension brings validation, navigation, hover,
  completion and a topology graph to Aggrega YAML through `aggrega serve`; `aggrega mcp` and the Aggrega
  skill give an AI assistant the same tools.
- **Installation** with one command on Linux, macOS and Windows, or through Homebrew, Scoop and winget.

## Milestone 4 — Users adoption, more clouds and a larger catalog

- **Users adoption.** What users tell us once Aggrega is public decides the order of the work: whatever
  makes it easier to adopt comes first.
- **Azure and Google Cloud providers.**
- **A larger catalog.** More components, and Recipes for every target, Terraform and CloudFormation
  realizations of the base components included.
- **A formally verified core.** The compiler's core properties proved as theorems in Lean: identical input
  gives identical output, nothing is emitted that was not declared, and every connection value reaches
  exactly the consumers its `uses` connections name. Property-based tests cover the built-in plugins.

## Further directions

- **A live view of your architecture.** The editor's topology graph and `--ir-graph` already show the graph
  the compiler resolved; a streaming mode would send that graph as it changes, so a frontend follows each
  edit as it happens.
- **Workloads on managed container services** *(proposal)*. A Workload described once is synthesized for
  the managed container services of the cloud targets, such as Amazon ECS and Fargate, Google Cloud Run
  and Azure Container Apps.
- **More formats to import** *(proposal)*. OpenAPI specifications, for an API an application calls or
  serves, and Score workload files.
- **A Recipe drafted from its Component** *(proposal)*. A starter Recipe that already reads the
  Component's values and delivers its connection values, for the platform team to complete.
- **Templates that change a document's shape per environment** *(proposal)*. A key present in one
  environment and absent in another, by evaluating templates before a document is parsed.
- **Policy findings in the editor** *(proposal)*. A governance plugin's findings shown in the editor as
  the files change, beside the validation it shows today.
