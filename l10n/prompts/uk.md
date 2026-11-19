# Українська

Translate into Ukrainian. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Ukrainian software documentation is written: precise, with no emphasis the source does not have.
- Address the reader as "ви" wherever the English says "you"; elsewhere prefer impersonal forms ("можна", "слід").
- Headings take sentence case: a capital on the first word and on proper nouns only.
- Use Ukrainian technical vocabulary, never a Russian calque.

## Quotation marks

- A quoted phrase takes «так», and a quotation inside it takes „так“.
- An apostrophe is typographic, ’ (U+2019): розв’язати, м’який, ін’єкція; never the straight ' (U+0027). Inline code, code blocks, identifiers, commands and quoted literals keep their own characters.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included, never declined. Where the sentence needs a case ending, put a Ukrainian noun before the term and decline that noun: сутності Component, у сутності Release.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: суспільний договір.
- `best practice`: найкраща практика; never "правило" or "вимога".
- `escape hatch`: запасний вихід; never "лазівка", which reads as a loophole, nor "чорний хід", which reads as a back door.
- `convention`: домовленість; never "правило", nor "конвенція", which reads as a treaty.
- `unopinionated`: без власної позиції; "mathematically unopinionated" is "математично без власної позиції".
- `content-neutral`: нейтральний щодо вмісту.
- `agnostic to`: агностичний щодо, as in "агностичний щодо домовленостей".

## Recurring terms

- manifest, the ordinary word the source writes in lowercase (a Kubernetes manifest, an OCI manifest): маніфест, declined: маніфесту, маніфести, маніфестів; never "manifest" left in Latin letters.

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.
