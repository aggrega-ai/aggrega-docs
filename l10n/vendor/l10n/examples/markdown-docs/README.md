# Example: the Aggrega documentation, translated from English

This directory is the translation configuration of the Aggrega documentation
corpus, laid out as it sits at the root of that corpus's repository. Copied
there, it translates the corpus from English into every target language its
configuration lists, with the Markdown adapter (see the package README, "The
Markdown adapter"). The configuration states those languages, and everything
else below that it names; this page says what each setting is for, and
[`INTEGRATION.md`](INTEGRATION.md) what the corpus's maintainers do to adopt it.

```text
.github/workflows/l10n.yml          the translation workflow
.github/workflows/l10n-collect.yml  its collector
l10n/l10n.config.json               the configuration
l10n/glossary.json                  the do-not-translate product nouns, matched as written, and the language names
l10n/prompts/_general.md            the instructions for every language
l10n/prompts/<locale>.md            one file per target language
```

## The configuration

- **Source and targets.** `en` is the source, and `locales.targets` lists the
  target languages, each with its prompt file under `l10n/prompts/`.
- **The corpus.** `sourceDir` is `..`, the repository root, and `include` and
  `exclude` hold the same globs as the documentation site's content collection
  (`site/src/content.config.ts`). The two are matched by different libraries —
  this package by Node's `fs.globSync` and `path.matchesGlob` — so a change to
  either list is made in both.
- **Where it writes.** Every page in every locale is written under
  `l10n/<locale>/` (`outDir: "."`), the memory lives under `l10n/memory/`, and
  neither is ever read as a source.
- **The model.** Claude Sonnet 5.5 with `thinking: {"type": "between_tools"}`,
  its setting with no extended thinking, at effort `low`. A refused request is
  resubmitted once on Claude Opus 5.5 (`fallbackId`), at effort `low` and with
  no thinking setting: Claude Sonnet 5.5 alone accepts `between_tools`, and
  Claude Opus 5.5 cannot turn thinking off, so `effort` alone sets how much it
  reasons. The API key is read from `ANTHROPIC_API_KEY`.
- **The budgets.** `backend.submission` sets the per-submission budgets;
  [Cost planning](#cost-planning) states them, the most one submission can
  spend, and how many submissions the first pass over the corpus takes.
- **The product nouns match as written.** The glossary lists the entity kinds
  and the product's names as do-not-translate and sets
  `do_not_translate_case: "sensitive"`, the matching the Aggrega project's own
  do-not-translate list defines: `Component`, the entity kind, stays in English
  in every language, and `component`, the ordinary word, is translated. Rule 1
  of every request's instructions states the mode, and the validation requires
  a noun verbatim only where the source has it in its own casing. The plural
  forms are listed explicitly, each after its singular (`Components` after
  `Component`), because the validation never finds a term inside a longer word
  of its own script: `Components` holds no `Component`, so a plural without its own
  entry could be translated while its singular stays in English. `Aggrega` and
  `Wasm` have no plural.
- **Generated content is translated, explicitly.** The generated reference
  pages (`policies.paths`) and every generated section the corpus holds, by name
  (`policies.regions`), have the policy `translate`, so switching any of them to
  `keep` is a one-word change. The package's test of this example holds the
  list of section names the corpus was measured to hold and fails when the
  configuration's list differs from it.
- **Heading identifiers** need no key: the adapter ends every heading outside a
  kept path or section with its source slug (`{#<slug>}`). The documentation
  site reads them once it registers the package's `remarkHeadingIds` plugin
  (see the package README, "The syntax-tree plugin"); without it, a translated
  heading shows the suffix as text.
- **CI.** `ci.branch` is `l10n-memory`. The configuration names no
  `ci.dispatch`: the corpus's own workflow publishes on a release tag, which a
  person pushes, so a collection dispatches nothing.
- **The sync.** `sync.commands` is `npx --no l10n generate`, which cannot
  install anything, run in `l10n/`, and `sync.paths` names each target
  locale's directory under `l10n/`, which that command writes. Adding a target
  locale adds its directory here.

### Before switching a generated section to `keep`

A kept section is copied byte for byte, headings included, so its headings
carry no explicit identifier and the site's own slugger assigns their ids. That
slugger numbers a duplicate heading only among the headings without an explicit
identifier, so a kept heading that repeats an earlier heading's text can be
numbered differently from the source page, and a link written against the
source page can then miss it.

Of the generated sections, only `error-identities`, in
`language-reference/errors/sentinels.md`, holds headings: 31, counted as the
headings the adapter segments inside the section, in the corpus at its commit
`fe7aca7`. Switching it to `keep` puts every one of them in that position;
build the translated page and check its anchors before relying on them.

## The prompts

The method is the one the FastAPI documentation uses for its translations
(<https://fastapi.tiangolo.com/translations/>): a general prompt, and a short
prompt per language that a native speaker improves by editing it, so that a
correction is made once rather than page by page.

- `_general.md` holds what every language shares: what the corpus is and who
  reads it; the YAML keys, CLI flags, entity kinds, paths and inline code that
  stay exactly as written; the qualifiers that carry the compiler's stance,
  rendered faithfully and consistently; and every Markdown construct kept.
- `<locale>.md` holds, under four headings, the register, the quotation marks,
  the English terms kept as they are and the rendering of each qualifier. Each
  choice in it is a default made without a native speaker's review, and each
  file ends by inviting a native speaker's correction.

The package places `_general.md` after its own rules and the glossary, and
before the language's file, in every request's system prompt.

## The workflows

`.github/workflows/l10n.yml` is the template the corpus's repository installs,
at that path. It runs `npx l10n ci --config l10n/l10n.config.json` on a push to
`main` that touches the source files, the human layer of the memory or the
prompt files, and by hand; it has no schedule. Its collector,
`.github/workflows/l10n-collect.yml`, which the configuration names as
`ci.collector`, runs the same command every 10 minutes while a batch is
pending: `l10n ci` switches it on and off. Their comments list what they
assume, and the package README ("Running in CI") states the rules they hold.
From the corpus's root, `npx l10n doctor --config l10n/l10n.config.json`
checks the configuration, the prompt files, the glossary, both workflows, the
CI branch and the sync, and passes every check.

## Trying it without spending

With the API key unset, these two commands read the corpus and write only the
memory directory. The second builds every request, takes those that fit the
per-submission budgets in their stable order, as a submission would, and prints,
per locale, their page count and estimated input and output tokens, the input
with its cached and uncached shares; it creates no client and no batch:

```sh
npx l10n extract --config l10n/l10n.config.json
npx l10n submit --dry-run --config l10n/l10n.config.json
```

The estimate is the package's offline upper bound of one token per UTF-8 byte
(see the package README, "The budget, and the estimate it is counted in"). A
page above `backend.sectionTokens` is sent one section per request, each given
its own section, the sections immediately before and after it and the page's
outline of headings, never the rest of the page. Only the system prompt, shared
by every request of a locale, is marked for caching, and the dry run counts it
in the cached share. The budgets count the whole input all the same, since
caching inside a batch is best-effort. The budgets this configuration sets in
`backend.submission` hold a small part of this corpus's first full translation,
which therefore spans many submissions, and they set the most one submission
can spend (see [Cost planning](#cost-planning)).

## Cost planning

The figures below were measured on 2026-10-17 by translating a 20-page sample
of this corpus, at its commit `fe7aca7`, into `it`, `de` and `ja` with this
configuration's model, glossary and prompts, through `submit` and `collect`.
The tokens are those the API reported for each request, priced at the Message
Batches rates Anthropic published that day for Claude Sonnet 5.5, per million
tokens: input USD 1, one-hour cache write USD 2, cache read USD 0.05, output
USD 5.

### Output per source token

| Locale | Output tokens per source token | Output tokens per source byte |
|---|---:|---:|
| `it` | 1.459 | 0.525 |
| `de` | 1.710 | 0.616 |
| `ja` | 1.483 | 0.531 |

Measured over the first request of every segment of the sample: 1,961
segments, 533,678 bytes of English source, per locale. The source tokens are
those bytes converted at the rate the API counted for the same requests' input,
0.358 to 0.360 tokens per byte. The output is the whole reply, the JSON around
each segment's identifier included, not the translated text alone.

### The whole corpus, per language

The first pass over the whole corpus on Claude Sonnet 5.5:

| | Low | Low, with resubmissions | High | High, with resubmissions |
|---|---:|---:|---:|---:|
| One language | USD 18.40 | USD 21.99 | USD 26.96 | USD 32.22 |
| The 14 configured languages | USD 257.57 | USD 307.89 | USD 377.38 | USD 451.09 |

Each figure is the package's offline estimate of the corpus at its commit
`fe7aca7` — 16,058 requests, 467,756,102 input and 55,071,548 output tokens —
converted at the sample's measured ratios of billed to estimated tokens.
**Low:** every request reads its language's system prompt from the cache,
except one write per language. **High:** no request reads the cache, so every
cache-marked token is billed as a one-hour write. **With resubmissions:** plus
the sample's measured cost of resubmitting the segments its replies failed,
0.195 of its first pass. Every language is taken to cost the mean of `it`,
`de` and `ja`; languages in other scripts are not measured, and the corpus
holds sections far larger than any in the sample.

### The budgets, and how many submissions the first pass takes

`backend.submission` allows 7,500,000 estimated input tokens and 900,000 output
tokens per submission. They are set so that the most one submission can spend,
by the package's bounds — every estimated input token billed as a one-hour
cache write, every `max_tokens` token as output — is at most USD 20 at Claude
Sonnet 5.5's batch rates: 7.5 × 2 + 0.9 × 5 = USD 19.50. A refused request
resubmitted on Claude Opus 5.5 is billed at twice those rates. At the sample's
measured ratios, one submission of the first pass is expected to spend USD 2.27
to 4.28, USD 3.72 on average.

At these budgets the first pass over the whole corpus takes **91
submissions**: the package's selection, which takes requests in their stable
order while both budgets hold, applied to the 21,126 requests — 588,585,951
estimated input and 77,384,020 output tokens — of a `submit --dry-run` with no
translation in the memory, at the corpus's commit `1f32324`, on 2026-10-18, with
a section above `backend.sectionTokens` divided at its own headings and a
`max_tokens` of at least 1,024. By the bound above, each of them can spend USD
6.53 to 19.41. The cost table above was converted from the request shape the
sample measured, in which such a section was one request; its figures are not
re-measured for the divided sections. Resubmissions are not counted. A real translation takes at least as
many submissions: each later submission also carries the segments queued for
resubmission, ahead of the rest, and a request whose neighbouring sections are
already translated carries those translations as context, so it is larger than
with no translation in the memory.
