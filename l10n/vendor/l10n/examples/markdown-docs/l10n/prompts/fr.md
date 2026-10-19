# Français

Translate into French. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as French software documentation is written: precise, with no emphasis the source does not have.
- Address the reader as "vous" wherever the English says "you"; elsewhere prefer impersonal forms ("il est possible de").
- Headings take sentence case: a capital on the first word and on proper nouns only.
- Keep the source's order of condition and consequence; split a long sentence only where French needs it.

## Quotation marks

- A quoted phrase takes guillemets with a narrow no-break space (U+202F) inside them, « ainsi », and a quotation inside it takes “ainsi”.
- Put a narrow no-break space before ":", ";", "!" and "?", as French typography does, except inside inline code.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, as the glossary writes them, capital letter included, with these genders: l’Aggregate (masculine), le Component, la Feature, la FeatureRecipe, la Recipe, le Manifest, la Release, le Provider, le Plugin, le Workload, la SchemaLibrary, la MappingLibrary, l’ArtifactLibrary (feminine), la WorkloadLibrary.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: contrat social.
- `best practice`: bonne pratique, the established French term with the same force, les bonnes pratiques; never "règle" or "obligation".
- `escape hatch`: porte de sortie; never "échappatoire", which reads as an evasion.
- `convention`: convention; never "règle" or "norme".
- `unopinionated`: sans parti pris; "mathematically unopinionated" is "mathématiquement sans parti pris".
- `content-neutral`: neutre vis-à-vis du contenu.
- `agnostic to`: agnostique vis-à-vis de, as in "agnostique vis-à-vis des conventions".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
