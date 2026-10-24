# Aggrega Documentation

User-facing documentation for the Aggrega language and compiler, written in English and translated into every other language the site offers.

## About Aggrega

Aggrega is an open-source language, ecosystem, and compiler for defining and rendering enterprise architectures, featuring a standard library highly specialized for AI applications. It serves as a bridge between abstract developer intent (including cognitive AI frameworks like LangGraph or CrewAI) and secure, physical cloud-native reality.

Rather than manually writing complex infrastructure-as-code or hardcoding network ports, developers simply declare *what* their application needs to survive. The Aggrega compiler deterministically generates the physical infrastructure configurations (Helm charts, Kubernetes manifests, Docker Compose) required to run it. It translates abstract requests into the exact static artifacts required for the target environment to establish hardware-enforced security, zero-trust network boundaries, and L7 data-plane proxies.

The ecosystem is built on four pillars:

1. **The Separation Model (OAM-Inspired):** A strict architecture that enforces Conway's Law, cleanly separating Developer Intent (the abstract "What" and "How much") from Platform Ops physical reality (the physical "How" and "Where").
2. **The Semantic DSL & Operational Ontology:** Developers map their architecture using a closed set of universal cloud primitives (e.g., `server`, `worker`, `stateful-server`) on Aggrega's reserved `component.aggrega.ai/type` label. All advanced context—such as AI agent autonomy, generative capabilities, or data compliance—is layered on top via static Duck-Typing labels, and a catalog classifying components on an axis of its own adds a label key of its own.
3. **Programmable Policies & Validation:** The core Go compiler is mathematically unopinionated. Corporate governance is driven entirely by industry standards and pluggable WebAssembly: JSON Schema 2020-12 (authored via a compact YAML-shaped shorthand or full JSON Schema YAML) for catalog validation, the governance socket's `label-transform` role for dynamic topology tagging, and its verdict roles for evaluating architectural security boundaries.
4. **The AOT Compiler & Execution Handoff:** A strict compilation pipeline translates the DSL into a capability-agnostic Intermediate Representation (IR) graph. The IR captures the topology of components and the `uses` edges between them (who uses whom); the compiler passes this graph to the WebAssembly (Wasm) governance socket to detect transitive trust vulnerabilities, then executes Wasm rendering plugins to generate the precise proxy and guardrail configurations. Aggrega writes these artifacts to disk and hands off physical deployment to other tools like CI/CD pipelines or runtime orchestrators.

## Install

`curl -fsSL https://aggrega.ai/install.sh | sh` on Linux and macOS, or `irm https://aggrega.ai/install.ps1 | iex` in PowerShell on Windows, installs the `aggrega` binary for the current user. [Setup](authoring/setup.md#install-the-binary) covers what the command does, the manual download, and connecting an AI assistant.

## Architecture

[architecture/](architecture/README.md) — the "why" of Aggrega. Vision, positioning, mental model, compiler pipeline at conceptual level, enterprise governance, catalog, extensibility, design choices. Follow the numbered chapters 01 through 16 in order for first-time reading.

## Authoring Guide

[authoring/](authoring/README.md) — the "how to sit down and author" of Aggrega. The authoring loop, the four collaborating roles, the kind-to-role map, and how to connect an AI assistant through the Model Context Protocol server. Start with [Getting Started](authoring/getting-started.md); to have your AI assistant install and set up Aggrega itself, paste the prompt in [Use Aggrega from your AI assistant](authoring/ai-assistant.md).

## Language Reference

[language-reference/](language-reference/README.md) — the "what" and "how to use" of Aggrega. Start with [Status of the Language](language-reference/10-status.md) for the current state of readiness, then follow the numbered chapters 01 through 09 in order for first-time reading. Unnumbered subdirectories (entities/, vocabulary/, templates/, providers/, cli/, errors/, examples/) are reference catalogs — jump to specific items as needed.
