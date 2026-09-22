# Embedded plugins

_Generated reference. Do not edit by hand — regenerate from the CLI's plugin listing._

Aggrega ships a set of Wasm plugins compiled directly into the CLI binary. These embedded built-ins resolve with no filesystem, cache, or network access, so a fresh binary has a working plugin set with nothing to install. Each row's Type is the socket the plugin implements, and its Capabilities are what it serves within that socket — the render targets a provider renders, or the source formats a parser reads, written `parse:<format>`. A socket that carries no capability axis, such as the linter and governance sockets, serves none and shows an em dash. Run `aggrega plugin list` to see this set in your own binary, or `aggrega plugin list -o json` for the full per-plugin detail.

| Type | Name | Capabilities | Version |
| --- | --- | --- | --- |
| governance | `governance/cel` | — | 0.7.2 (commit d068bb7d) |
| governance | `governance/label-injector` | — | 0.7.2 (commit d068bb7d) |
| governance | `governance/rego` | — | 0.7.2 (commit d068bb7d) |
| governance | `governance/selector-tagger` | — | 0.7.2 (commit d068bb7d) |
| linter | `linter/publishing` | — | 0.7.2 (commit d068bb7d) |
| parser | `parser/hcl` | parse:hcl | 0.7.2 (commit d068bb7d) |
| parser | `parser/json` | parse:json | 0.7.2 (commit d068bb7d) |
| parser | `parser/toml` | parse:toml | 0.7.2 (commit d068bb7d) |
| parser | `parser/yaml` | parse:yaml | 0.7.2 (commit d068bb7d) |
| provider | `provider/cloudformation` | cloudformation | 0.7.2 (commit d068bb7d) |
| provider | `provider/compose` | compose | 0.7.2 (commit d068bb7d) |
| provider | `provider/helm` | helm | 0.7.2 (commit d068bb7d) |
| provider | `provider/helm-chart` | helm-chart | 0.7.2 (commit d068bb7d) |
| provider | `provider/terraform` | terraform | 0.7.2 (commit d068bb7d) |
