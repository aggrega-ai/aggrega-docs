# Providers Overview

A provider is a rendering engine that turns a Recipe's input kinds into provider-native manifest files. Provider rendering is served by a Plugin with `pluginType: provider`: the Plugin lists the provider name(s) it renders in `compatibleProviders` and carries its provider-socket metadata in a `spec.provider` block. Aggrega's standard library ships three providers — `helm`, `helm-chart`, `compose` — and each one declares its own contract: what input kinds it accepts, what output files it emits, which boundary annotations it consumes, and how the Workload kind translates into its native shape when the synthesized input kind is used. This chapter set covers those contracts from the Recipe author's perspective.

The chapter organises into two clusters. **Architecture and shared contracts** cover what every provider has in common — the plugin-socket architecture that binds Go compiler to Wasm renderer, the boundary annotations every provider reads to configure placement and networking, and the at-a-glance capability matrix showing which provider supports which input kind. **Per-provider references** cover the specifics: per-provider authoring quirks, per-provider output-directory layout, and per-provider translation semantics for the Workload and artifacts mechanisms. The canonical capability matrix lives in [../architecture/16-recipe-input-composition.md](../architecture/16-recipe-input-composition.md); the `reference-matrix` page here cross-links back to it rather than duplicating.

## Architecture and shared contracts

- [Provider architecture](providers/architecture.md) — the plugin-socket architecture, the provider-rendering Plugin's role in the compilation pipeline, and per-provider dispatch.
- [Well-known annotations](providers/well-known-annotations.md) — the platform-reserved `aggrega.ai/` boundary annotations that providers consume for placement, registry prefixes, networking, security, and packaging metadata.
- [Reference matrix](providers/reference-matrix.md) — at-a-glance summary of which provider supports which input kind, with pointers to per-provider detail pages.

## Per-provider reference

- [`helm`](providers/helm.md) — the core Kubernetes provider. Helm SDK rendering in sourced mode.
- [`helm-chart`](providers/helm-chart.md) — the umbrella-chart composition provider. Packages multiple components into a single Helm chart per boundary.
- [`compose`](providers/compose.md) — the Docker Compose provider. Per-boundary `docker-compose.yaml` output.
