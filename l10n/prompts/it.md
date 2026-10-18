# Italiano

Translate into Italian. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Italian software documentation is written: precise, with no emphasis the source does not have.
- Address the reader with the informal "tu" wherever the English says "you"; elsewhere prefer impersonal forms ("si configura", "è possibile").
- Headings take sentence case: a capital on the first word and on proper nouns only.
- Keep the source's order of condition and consequence; split a long sentence only where Italian needs it.
- `Top-level type`, the line that opens the properties of a generated schema page, is "Tipo di primo livello".

## Quotation marks

- A quoted phrase takes caporali, «così», and a quotation inside it takes “così”.
- An apostrophe is typographic: l’entità, dell’Aggregate.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, as the glossary writes them, capital letter included, with these genders: l’Aggregate, il Component, la Feature, la FeatureRecipe, la Recipe, il Manifest, la Release, il Provider, il Plugin, il Workload, la SchemaLibrary, la MappingLibrary, l’ArtifactLibrary, la WorkloadLibrary.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: contratto sociale.
- `best practice`: best practice, kept in English and feminine, la best practice, le best practice; never "regola" or "obbligo".
- `escape hatch`: via d’uscita; never "scappatoia", which reads as a loophole.
- `convention`: convenzione; never "regola" or "norma".
- `unopinionated`: privo di opinioni; "mathematically unopinionated" is "matematicamente privo di opinioni".
- `mathematically blind`: matematicamente cieco.
- `dumb`: stupido, in the sense of "terminale stupido": it does what it is given and nothing more; never "semplice" or "ingenuo".
- `blind to`: cieco a, as in "cieco alle convenzioni".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
