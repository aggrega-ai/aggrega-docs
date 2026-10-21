# Latviešu

Translate into Latvian. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Latvian software documentation is written: precise, with no emphasis the source does not have.
- Where the English says "you", prefer impersonal forms ("var", "jā…"); address the reader as "jūs" only where a sentence cannot do without it.
- Headings take sentence case: a capital on the first word and on proper nouns only.

## Quotation marks

- A quoted phrase takes «tā», and a quotation inside it takes „tā“.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, as the glossary writes them, capital letter included, never declined. Where the sentence needs a case ending, put a Latvian noun before the term and decline that noun: entītijas Component, entītijā Release.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: sabiedriskais līgums.
- `best practice`: labā prakse, labās prakses; never "noteikums" or "prasība".
- `escape hatch`: rezerves izeja; never "robs", which reads as a loophole, nor "sētas durvis", which reads as a back door.
- `convention`: konvencija, as in "nosaukumu konvencijas"; never "noteikums".
- `unopinionated`: bez sava viedokļa; "mathematically unopinionated" is "matemātiski bez sava viedokļa".
- `content-neutral`: neitrāls attiecībā uz saturu.
- `agnostic to`: agnostisks attiecībā uz, as in "agnostisks attiecībā uz konvencijām".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
