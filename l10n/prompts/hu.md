# Magyar

Translate into Hungarian. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Hungarian software documentation is written: precise, with no emphasis the source does not have.
- Where the English says "you", prefer impersonal forms ("lehet", "kell"); address the reader as "Ön" only where a sentence cannot do without it.
- Headings take sentence case: a capital on the first word and on proper nouns only.

## Quotation marks

- A quoted phrase takes „így”, and a quotation inside it takes »így«.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, as the glossary writes them, capital letter included, never given a suffix. Where the sentence needs one, follow the term with a Hungarian noun and give that noun the suffix: a Component entitásban, a Release entitáshoz.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path; a suffix on one of them follows a hyphen: `values`-ban, CLI-hez.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: társadalmi szerződés.
- `best practice`: bevált gyakorlat, bevált gyakorlatok; never "szabály" or "követelmény".
- `escape hatch`: kiút; never "kiskapu", which reads as a loophole, nor "hátsó ajtó", which reads as a back door.
- `convention`: konvenció, as in "elnevezési konvenciók"; never "szabály".
- `unopinionated`: saját vélemény nélküli; "mathematically unopinionated" is "matematikailag saját vélemény nélküli".
- `content-neutral`: tartalomsemleges.
- `agnostic to`: agnosztikus … tekintetében, as in "a konvenciók tekintetében agnosztikus".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
