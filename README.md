# Aggrega Documentation

Aggrega is an open-source compiler for AI-era architecture. Describe the components of an application and how they connect; Aggrega turns them, deterministically, into the deployment files that run it.

- **Use the languages you know.** A compiler for the languages you already use: YAML in; Helm charts, Kubernetes manifests and Compose, Terraform or CloudFormation files out.
- **Developers describe, Ops implement.** Developers declare components, their features and who uses whom; the platform team decides how and where each one runs.
- **One application, many platforms.** The same application runs on Docker Compose on a laptop and on Kubernetes in production: changing target changes a mapping, not your code.
- **Reproducible and governed.** Same input, same output, with every dependency pinned in a lockfile. Your policies plug into the compiler and stop a build that breaks them, saying what to fix.

User-facing documentation for the Aggrega language and compiler, written in English and translated into every other language the site offers.

## Install

`curl -fsSL https://aggrega.ai/install.sh | sh` on Linux and macOS, or `irm https://aggrega.ai/install.ps1 | iex` in PowerShell on Windows, installs the `aggrega` binary for the current user. [Setup](authoring/setup.md#install-the-binary) covers what the command does, the manual download, and connecting an AI assistant.

An AI assistant that can run commands on your machine can install and set up Aggrega for you from one prompt you paste into it: [Use Aggrega from your AI assistant](authoring/ai-assistant.md) gives the prompt. The [Aggrega extension for Visual Studio Code](https://github.com/aggrega-ai/aggrega-vscode-extension) brings validation, navigation, hover and completion to Aggrega YAML, backed by the `aggrega` binary.

## Architecture

[architecture/](architecture/README.md) — the "why" of Aggrega. Vision, positioning, mental model, compiler pipeline at conceptual level, enterprise governance, catalog, extensibility, design choices. Follow the numbered chapters 01 through 16 in order for first-time reading.

## Authoring Guide

[authoring/](authoring/README.md) — the "how to sit down and author" of Aggrega. The authoring loop, the four collaborating roles, the kind-to-role map, and how to connect an AI assistant through the Model Context Protocol server. Start with [Getting Started](authoring/getting-started.md); to have your AI assistant install and set up Aggrega itself, paste the prompt in [Use Aggrega from your AI assistant](authoring/ai-assistant.md).

## Language Reference

[language-reference/](language-reference/README.md) — the "what" and "how to use" of Aggrega. Start with [Status of the Language](language-reference/10-status.md) for the current state of readiness, then follow the numbered chapters 01 through 09 in order for first-time reading. Unnumbered subdirectories (entities/, vocabulary/, templates/, providers/, plugins/, schema/, cli/, errors/, examples/) are reference catalogs — jump to specific items as needed.

## About Aggrega

The ecosystem is built on four pillars:

1. **The Separation Model (OAM-Inspired):** Design guidance that separates Developer Intent (the abstract "What" and "How much") from Platform Ops physical reality (the physical "How" and "Where"). The compiler does not enforce the split: it accepts any authoring pattern that passes schema validation.
2. **The Semantic DSL & Operational Ontology:** Developers map their architecture using a closed set of universal cloud primitives (e.g., `server`, `worker`, `stateful-server`) on Aggrega's reserved `component.aggrega.ai/type` label. All advanced context—such as AI agent autonomy, generative capabilities, or data compliance—is layered on top via static Duck-Typing labels, and a catalog classifying components on an axis of its own adds a label key of its own.
3. **Programmable Policies & Validation:** The core Go compiler is unopinionated. Corporate governance is driven entirely by industry standards and pluggable WebAssembly: JSON Schema 2020-12 (authored via a compact YAML-shaped shorthand or full JSON Schema YAML) for catalog validation, the governance socket's `label-transform` role for dynamic topology tagging, and its verdict roles for evaluating architectural security boundaries.
4. **The AOT Compiler & Execution Handoff:** A strict compilation pipeline translates the DSL into a capability-agnostic Intermediate Representation (IR) graph. The IR captures the topology of components and the `uses` edges between them (who uses whom); the compiler passes this graph to the WebAssembly (Wasm) governance socket to detect transitive trust vulnerabilities, then executes Wasm rendering plugins to generate the precise proxy and guardrail configurations. Aggrega writes these artifacts to disk and hands them off to other tools, like CI/CD pipelines or runtime orchestrators, which deploy them.
