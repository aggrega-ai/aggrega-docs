# Embedded plugins

_Generated reference. Do not edit by hand — regenerate from the CLI's plugin listing._

Aggrega ships a set of Wasm plugins compiled directly into the CLI binary. These embedded built-ins resolve with no filesystem, cache, or network access, so a fresh binary has a working plugin set with nothing to install. Each row's Type is the socket the plugin implements, and its Capabilities are what it serves within that socket — the render targets a provider renders, or the source formats a parser reads, written `parse:<format>`. A socket that carries no capability axis, such as the linter and governance sockets, serves none and shows an em dash. Run `aggrega plugin list` to see this set in your own binary, or `aggrega plugin list -o json` for the full per-plugin detail.

| Type | Name | Capabilities | Version |
| --- | --- | --- | --- |
| governance | `governance/cel` | — | `0.9.0-rc.3 (commit 3eccd4b55)` |
| governance | `governance/label-injector` | — | `0.9.0-rc.3 (commit 3eccd4b55)` |
| governance | `governance/rego` | — | `0.9.0-rc.3 (commit 3eccd4b55)` |
| governance | `governance/selector-tagger` | — | `0.9.0-rc.3 (commit 3eccd4b55)` |
| linter | `linter/publishing` | — | `0.9.0-rc.3 (commit 3eccd4b55)` |
| parser | `parser/hcl` | parse:hcl | `0.9.0-rc.3 (commit 3eccd4b55)` |
| parser | `parser/json` | parse:json | `0.9.0-rc.3 (commit 3eccd4b55)` |
| parser | `parser/jsonc` | parse:jsonc | `0.9.0-rc.3 (commit 3eccd4b55)` |
| parser | `parser/toml` | parse:toml | `0.9.0-rc.3 (commit 3eccd4b55)` |
| parser | `parser/yaml` | parse:yaml | `0.9.0-rc.3 (commit 3eccd4b55)` |
| provider | `provider/cloudformation` | cloudformation | `0.9.0-rc.3 (commit 3eccd4b55)` |
| provider | `provider/compose` | compose | `0.9.0-rc.3 (commit 3eccd4b55)` |
| provider | `provider/helm` | helm | `0.9.0-rc.3 (commit 3eccd4b55)` |
| provider | `provider/helm-chart` | helm-chart | `0.9.0-rc.3 (commit 3eccd4b55)` |
| provider | `provider/terraform` | terraform | `0.9.0-rc.3 (commit 3eccd4b55)` |
