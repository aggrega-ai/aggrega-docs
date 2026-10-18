# Русский

Translate into Russian. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Russian software documentation is written: precise, with no emphasis the source does not have.
- Address the reader as "вы" wherever the English says "you"; elsewhere prefer impersonal forms ("можно", "следует").
- Headings take sentence case: a capital on the first word and on proper nouns only.

## Quotation marks

- A quoted phrase takes «так», and a quotation inside it takes „так“.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included, never declined. Where the sentence needs a case ending, put a Russian noun before the term and decline that noun: сущности Component, для сущности Release.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: общественный договор.
- `best practice`: лучшая практика; never "правило" or "требование".
- `escape hatch`: запасной выход; never "лазейка", which reads as a loophole, nor "чёрный ход", which reads as a back door.
- `convention`: соглашение, as in "соглашения об именовании"; never "правило".
- `unopinionated`: без собственного мнения; "mathematically unopinionated" is "математически без собственного мнения".
- `mathematically blind`: математически слепой.
- `dumb`: тупой, in the sense of "тупой терминал": it does what it is given and nothing more; never "простой".
- `blind to`: слеп к, as in "слеп к соглашениям".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
