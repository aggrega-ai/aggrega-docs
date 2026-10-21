# Български

Translate into Bulgarian. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Bulgarian software documentation is written: precise, with no emphasis the source does not have.
- Address the reader as "вие" wherever the English says "you"; elsewhere prefer impersonal forms ("може да", "трябва да").
- Headings take sentence case: a capital on the first word and on proper nouns only.

## Quotation marks

- A quoted phrase takes „така“, and a quotation inside it takes ‚така‘.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included, never given the definite article as a suffix. Where the sentence needs the article, put a Bulgarian noun before the term and give that noun the article: същността Component, за същността Release.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: обществен договор.
- `best practice`: добра практика, добри практики; never "правило" or "изискване".
- `escape hatch`: резервен изход; never "вратичка", which reads as a loophole, nor "задна врата", which reads as a back door.
- `convention`: конвенция, as in "конвенции за именуване"; never "правило".
- `unopinionated`: без собствено мнение; "mathematically unopinionated" is "математически без собствено мнение".
- `content-neutral`: неутрален по отношение на съдържанието.
- `agnostic to`: агностичен по отношение на, as in "агностичен по отношение на конвенциите".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
