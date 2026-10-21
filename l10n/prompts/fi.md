# Suomi

Translate into Finnish. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Finnish software documentation is written: precise, with no emphasis the source does not have.
- Where the English says "you", prefer the passive and impersonal forms ("voidaan", "on määritettävä"); use the second person singular only where a sentence cannot do without it.
- Headings take sentence case: a capital on the first word and on proper nouns only.

## Quotation marks

- A quoted phrase takes ”näin”, and a quotation inside it takes ’näin’.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, as the glossary writes them, capital letter included, never given a case ending. Where the sentence needs one, join the term to a Finnish noun with a hyphen and give that noun the ending: Component-entiteetin, Release-entiteetissä.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path; a case ending on one of them follows a colon: `values`:n, CLI:n.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: yhteiskuntasopimus.
- `best practice`: hyvä käytäntö, hyvät käytännöt; never "sääntö" or "vaatimus".
- `escape hatch`: pakotie; never "porsaanreikä", which reads as a loophole, nor "takaovi", which reads as a back door.
- `convention`: konventio, as in "nimeämiskonventiot"; never "sääntö".
- `unopinionated`: ilman omia näkemyksiä; "mathematically unopinionated" is "matemaattisesti ilman omia näkemyksiä".
- `content-neutral`: sisältöneutraali.
- `agnostic to`: agnostinen suhteessa, as in "agnostinen suhteessa konventioihin".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
