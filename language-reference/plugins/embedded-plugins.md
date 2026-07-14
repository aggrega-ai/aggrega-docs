# Embedded plugins

_Generated reference. Do not edit by hand — regenerate from the CLI's plugin listing._

Aggrega ships a set of provider and linter Wasm plugins compiled directly into the CLI binary. These embedded built-ins resolve with no filesystem, cache, or network access, so a fresh binary renders and lints out of the box. Each provider serves one or more render capabilities; a linter is cross-cutting and serves none. Run `aggrega plugin list` to see this set in your own binary, or `aggrega plugin list --json` for the full per-plugin detail.

| Type | Name | Capabilities | Version |
| --- | --- | --- | --- |
| linter | `linter/publishing` | — | 0.4.0-98-g3a7f314 (commit 3a7f314) |
| provider | `provider/cloudformation` | cloudformation | 0.4.0-98-g3a7f314 (commit 3a7f314) |
| provider | `provider/compose` | compose | 0.4.0-98-g3a7f314 (commit 3a7f314) |
| provider | `provider/helm` | helm | 0.4.0-98-g3a7f314 (commit 3a7f314) |
| provider | `provider/helm-chart` | helm-chart | 0.4.0-98-g3a7f314 (commit 3a7f314) |
| provider | `provider/terraform` | terraform | 0.4.0-98-g3a7f314 (commit 3a7f314) |
