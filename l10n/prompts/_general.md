# The Aggrega documentation

These instructions hold for every language. The language guide after them refines register, quotation marks and wording for one language, and its renderings are the ones to use.

## What the corpus is and who reads it

The pages are the documentation of Aggrega, a language and an ahead-of-time compiler for defining and rendering enterprise architectures: its architecture chapters, its authoring guide and its language reference. Engineers read them, in three roles:

- engineers authoring entity YAML: an Aggregate, a Component, a Recipe, a Release, and the other entity kinds;
- plugin authors, who write WebAssembly plugins against the interface the compiler gives them;
- integration authors, who build on the published Go, Rust and TypeScript packages.

Write for an engineer reading in their own language: precise, plain and technical. A sentence that teaches how something works teaches the same thing in the translation, with every condition, limit and exception the source states.

## What stays exactly as written

- YAML keys, CLI commands and flags, entity kinds, file paths, and every word inside inline code stay exactly as the source writes them, in the same spelling and case: `values`, `parameters`, `provides`, `--output`, `Aggregate`, `language-reference/schema/`.
- A YAML key, a flag, an entity kind or a path that a sentence names outside inline code stays as written too.
- The glossary's do-not-translate terms are the product's nouns, and each one is a term only as the glossary writes it, capital letter included: keep it in English wherever it occurs so, even where the language has a word for it. The same word in lower case — a component, a release, a provider — is an ordinary word: translate it like any other.
- An error message — the text a diagnostic of the compiler prints, and the name of an error wherever the documentation gives one: a heading on an error page, a link to it, a message quoted in a sentence or a table — is written as the original English message first, then its translation in parentheses, in every language: `[The provider does not support omits (Il provider non supporta omits)](../errors/fatal-halts.md#the-provider-does-not-support-omits)`. A reader searches for an error by the English text the compiler prints, so the English stays and comes first. Inside inline code or a code block the message stays exactly as written, with no translation added.

## The qualifiers

The documentation uses a small set of words to say what the compiler does and does not do: `social contract`, `best practice`, `escape hatch`, `convention`, `unopinionated`, `content-neutral` and `agnostic to`. They carry the compiler's stance. What the documentation calls a social contract, a best practice or a convention is upheld by the people and the catalogs that follow it, and the compiler does not enforce it; an escape hatch is a way out of such a default that the design provides on purpose; and the compiler is content-neutral, unopinionated and agnostic to what the values it routes mean, by design.

- Translate each with the rendering the language guide gives, every time it occurs and on every page, so that a reader meets one word for one stance.
- Translate each faithfully: never render the compiler's neutrality as a deficiency or an insult; and never strengthen one, so that a convention or a best practice never becomes a rule, a requirement or a guarantee.
- Keep each qualifier where the source puts it. Never drop one, move it to another clause, or add one the source does not have.

## The Markdown

The output keeps every Markdown construct the source has: emphasis and strong emphasis, inline code, links and images with their destinations, references, footnote references, line breaks, HTML tags and comments, and the cells of a table. Translate the text inside a construct and leave the construct itself as the source writes it. Never add a construct the source does not have, and never remove one.
