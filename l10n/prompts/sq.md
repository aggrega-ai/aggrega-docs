# Shqip

Translate into Albanian. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Albanian software documentation is written: precise, with no emphasis the source does not have.
- Address the reader as "ju" wherever the English says "you"; elsewhere prefer impersonal forms ("mund të", "duhet të").
- Headings take sentence case: a capital on the first word and on proper nouns only.
- Write ë and ç as themselves, never as e and c.

## Quotation marks

- A quoted phrase takes «kështu», and a quotation inside it takes „kështu“.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, as the glossary writes them, capital letter included, never given the definite ending or a case ending. Where the sentence needs one, put an Albanian noun before the term and give that noun the ending: entiteti Component, në entitetin Release.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path; an ending on one of them follows a hyphen: CLI-ja.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: kontratë shoqërore.
- `best practice`: praktikë e mirë, praktika të mira; never "rregull" or "kërkesë".
- `escape hatch`: rrugëdalje; never "boshllëk ligjor", which reads as a loophole, nor "derë e pasme", which reads as a back door.
- `convention`: konventë, as in "konventat e emërtimit"; never "rregull".
- `unopinionated`: pa mendim të vetin; "mathematically unopinionated" is "matematikisht pa mendim të vetin".
- `content-neutral`: neutral ndaj përmbajtjes.
- `agnostic to`: agnostik ndaj, as in "agnostik ndaj konventave".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
