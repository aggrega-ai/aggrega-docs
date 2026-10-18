# Deutsch

Translate into German. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as German software documentation is written: precise, with no emphasis the source does not have.
- Address the reader as "Sie" wherever the English says "you"; elsewhere prefer impersonal and passive forms.
- Headings follow German capitalization: a capital on the first word and on every noun.
- Use an established German compound where one exists (Konfigurationsdatei), and join a kept English term to a German word with a hyphen (Release-Datei, Component-Typ).

## Quotation marks

- A quoted phrase takes „so“, and a quotation inside it takes ‚so‘.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, as the glossary writes them, capital letter included, with these genders: das Aggregate, die Component, das Feature, das FeatureRecipe, das Recipe, das Manifest, das Release, der Provider, das Plugin, die Workload, die SchemaLibrary, die MappingLibrary, die ArtifactLibrary, die WorkloadLibrary.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: Gesellschaftsvertrag, in the sense of an agreement the people who use something uphold; never a company's articles, and never "Vertrag" alone.
- `best practice`: Best Practice, kept in English, die Best Practice; never "Regel" or "Pflicht".
- `escape hatch`: Ausweg; never "Hintertür", which reads as a back door, nor "Notausgang", which reads as an emergency.
- `convention`: Konvention; never "Regel" or "Vorschrift".
- `unopinionated`: meinungslos; "mathematically unopinionated" is "mathematisch meinungslos".
- `content-neutral`: inhaltsneutral.
- `agnostic to`: agnostisch gegenüber, as in "agnostisch gegenüber Konventionen".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
