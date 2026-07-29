# Templates Overview

Recipe and FeatureRecipe authors write Go `text/template` code at specific evaluation sites: `provides` entries, `locals` entries, `valuesMapping` (inline or `$import:`-loaded), `workload:` content (inline or `$import:`-loaded), `artifacts:` entries (inline or per-entry `$import:`-loaded), and FeatureRecipe `injectMapping`. Each site runs at a defined phase of the compilation pipeline and receives a defined view of the pillar context. This chapter set documents the template surface: where templates run, what the context exposes at each site, and which helper functions are available.

Template context shape and evaluation ordering are load-bearing contracts — changes to either break every existing Recipe template. The runtime TemplateContext projection is formally defined in a JSON Schema shipped with the compiler; the per-site evaluation matrix describes which pillars are readable at which site, and the Go template engine ships with the Sprig helper library plus Aggrega-specific extensions. The pipeline stages that anchor these evaluation sites are described at the architectural level in [../architecture/10-compilation-pipeline.md](../architecture/10-compilation-pipeline.md) — inject mapping for FeatureRecipe `injectMapping`, the locals preamble and source resolution for Recipe `.locals` and `.source`, base rendering for base Recipe `valuesMapping`, and feature rendering for FeatureRecipe Resource Generation.

## Per-topic reference

- [Template expansion matrix](templates/expansion-matrix.md) — the authoritative per-site table covering every template evaluation point, which pillars the site reads, and how outputs flow into the IR graph or downstream sub-passes.
- [Template context contract](templates/template-context-contract.md) — the formal shape of the runtime TemplateContext the compiler hands to templates, including the dual-state `.inject` / `.inject_raw` pair and the enriched `.context.uses` JOIN projection.
- [Sprig functions and helpers](templates/sprig-functions.md) — the Sprig helpers available inside Go templates plus Aggrega-specific extensions and safety helpers.
