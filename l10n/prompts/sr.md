# Српски

Translate into Serbian, written in the Cyrillic script. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it, the script included.

## Register

- Technical and plain, as Serbian software documentation is written: precise, with no emphasis the source does not have.
- Address the reader as "ви" wherever the English says "you"; elsewhere prefer impersonal forms ("може се", "потребно је").
- Headings take sentence case: a capital on the first word and on proper nouns only.
- Write in Cyrillic, ekavian; the kept terms, inline code and everything else kept as written stay in Latin letters.

## Quotation marks

- A quoted phrase takes „овако“, and a quotation inside it takes ‚овако‘.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included, never declined. Where the sentence needs a case ending, put a Serbian noun before the term and decline that noun: ентитета Component, у ентитету Release.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: друштвени уговор.
- `best practice`: добра пракса, добре праксе; never "правило" or "захтев".
- `escape hatch`: резервни излаз; never "рупа", which reads as a loophole, nor "задња врата", which reads as a back door.
- `convention`: конвенција, as in "конвенције именовања"; never "правило" or "пропис".
- `unopinionated`: без сопственог мишљења; "mathematically unopinionated" is "математички без сопственог мишљења".
- `content-neutral`: неутралан према садржају.
- `agnostic to`: агностичан према, as in "агностичан према конвенцијама".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
