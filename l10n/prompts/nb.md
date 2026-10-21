# Norsk bokmål

Translate into Norwegian Bokmål. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Norwegian software documentation is written: precise, with no emphasis the source does not have.
- Address the reader as "du" wherever the English says "you"; elsewhere prefer impersonal and passive forms.
- Headings take sentence case: a capital on the first word and on proper nouns only.
- Write Bokmål throughout, never Nynorsk forms.

## Quotation marks

- A quoted phrase takes «slik», and a quotation inside it takes ‘slik’.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, as the glossary writes them, capital letter included, never given a definite or plural ending. Where the sentence needs one, join the term to a Norwegian noun with a hyphen and give that noun the ending: Component-entiteten, Release-filen.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path; an ending on one of them follows a hyphen: CLI-en.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: samfunnskontrakt.
- `best practice`: beste praksis; never "regel" or "krav".
- `escape hatch`: utvei; never "smutthull", which reads as a loophole, nor "bakdør", which reads as a back door.
- `convention`: konvensjon, as in "navnekonvensjoner"; never "regel".
- `unopinionated`: uten egne meninger; "mathematically unopinionated" is "matematisk uten egne meninger".
- `content-neutral`: innholdsnøytral.
- `agnostic to`: agnostisk overfor, as in "agnostisk overfor konvensjoner".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
