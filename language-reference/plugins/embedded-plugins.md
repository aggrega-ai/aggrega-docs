# Embedded plugins

_Generated reference. Do not edit by hand — regenerate from the CLI's plugin listing._

Aggrega ships a set of provider and linter Wasm plugins compiled directly into the CLI binary. These embedded built-ins resolve with no filesystem, cache, or network access, so a fresh binary renders and lints out of the box. Each provider serves one or more render capabilities; a linter is cross-cutting and serves none. Run `aggrega plugin list` to see this set in your own binary, or `aggrega plugin list -o json` for the full per-plugin detail.

| Type | Name | Capabilities | Version |
| --- | --- | --- | --- |
| governance | `governance/label-injector` | — | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| governance | `governance/selector-tagger` | — | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| linter | `linter/publishing` | — | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| parser | `parser/hcl` | parse:hcl | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| parser | `parser/json` | parse:json | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| parser | `parser/toml` | parse:toml | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| parser | `parser/yaml` | parse:yaml | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| provider | `provider/cloudformation` | cloudformation | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| provider | `provider/compose` | compose | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| provider | `provider/helm` | helm | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| provider | `provider/helm-chart` | helm-chart | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
| provider | `provider/terraform` | terraform | 0.6.1-12-gef5ad3a7 (commit ef5ad3a7) |
