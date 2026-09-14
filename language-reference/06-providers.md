# Providers Overview

A provider renders a Recipe's input kinds into provider-native manifest files. Provider rendering is served by a Plugin with `pluginType: provider`: the Plugin lists the provider name(s) it renders in `spec.provider.capabilities` and carries its provider-socket metadata in that same `spec.provider` block. Aggrega's standard library ships five providers — `helm`, `helm-chart`, `compose`, `terraform`, `cloudformation` — and each one declares its own contract: what input kinds it accepts, what output files it emits, which boundary annotations it consumes, and how the Workload kind translates into its native shape when the synthesized input kind is used. This chapter set covers those contracts from the Recipe author's perspective.

The chapter organises into two clusters. **Architecture and shared contracts** cover what every provider has in common — the plugin-socket architecture that binds Go compiler to Wasm provider plugin, the boundary annotations every provider reads to configure placement and networking, and an index routing you to the right per-provider page. **Per-provider references** cover the specifics: per-provider authoring quirks, per-provider output-directory layout, and per-provider translation semantics for the Workload and artifacts mechanisms. Which provider accepts which input kind is answered by the capability matrix in [../architecture/16-recipe-input-composition.md](../architecture/16-recipe-input-composition.md), which is the authoritative grid.

## Architecture and shared contracts

- [Provider architecture](providers/architecture.md) — the plugin-socket architecture, the provider-rendering Plugin's role in the compilation pipeline, and per-provider dispatch.
- [Well-known annotations](providers/well-known-annotations.md) — the platform-reserved `aggrega.ai/` boundary annotations that providers consume for placement, registry prefixes, networking, security, and packaging metadata.
- [Provider reference index](providers/reference-matrix.md) — what each standard-library provider produces, and which page answers which question. For which input kinds a provider accepts, read the capability matrix in [../architecture/16-recipe-input-composition.md](../architecture/16-recipe-input-composition.md).

## Per-provider reference

- [`helm`](providers/helm.md) — the core Kubernetes provider. Helm SDK rendering in sourced mode.
- [`helm-chart`](providers/helm-chart.md) — the umbrella-chart composition provider. Packages multiple components into a single Helm chart per boundary.
- [`compose`](providers/compose.md) — the Docker Compose provider. Per-boundary `docker-compose.yaml` output.
- [`terraform`](providers/terraform.md) — the Terraform provider. One root configuration per boundary, with each component a module block sourcing that component's own sub-directory.
- [`cloudformation`](providers/cloudformation.md) — the CloudFormation provider. One stack template per boundary, emitted as pure JSON.
