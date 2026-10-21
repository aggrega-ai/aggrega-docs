# Hrvatski

Translate into Croatian. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Croatian software documentation is written: precise, with no emphasis the source does not have.
- Address the reader as "vi" wherever the English says "you"; elsewhere prefer impersonal forms ("može se", "potrebno je").
- Headings take sentence case: a capital on the first word and on proper nouns only.
- Use Croatian technical vocabulary, never a Serbian or Bosnian variant.

## Quotation marks

- A quoted phrase takes „ovako”, and a quotation inside it takes ‘ovako’.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, as the glossary writes them, capital letter included, never declined. Where the sentence needs a case ending, put a Croatian noun before the term and decline that noun: entiteta Component, u entitetu Release.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: društveni ugovor.
- `best practice`: dobra praksa, dobre prakse; never "pravilo" or "zahtjev".
- `escape hatch`: pričuvni izlaz; never "rupa", which reads as a loophole, nor "stražnja vrata", which reads as a back door.
- `convention`: konvencija, as in "konvencije imenovanja"; never "pravilo" or "propis".
- `unopinionated`: bez vlastitog mišljenja; "mathematically unopinionated" is "matematički bez vlastitog mišljenja".
- `content-neutral`: neutralan prema sadržaju.
- `agnostic to`: agnostičan prema, as in "agnostičan prema konvencijama".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
