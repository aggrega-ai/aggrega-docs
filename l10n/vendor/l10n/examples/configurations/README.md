# Configurations for two JSON-content site shapes

Two configurations, each for a shape of JSON-content site the adapter's
[document, field and output keys](../../README.md#the-json-content-adapter)
fit with no code of the site's own. Neither is a runnable project: copy the
one whose shape matches, then adjust the paths, the field rules and the locale
set. The package's tests validate both against the schema.

## `hand-written-targets.l10n.config.json`

An Italian site whose English pages were written by hand before the site was
translated, and do not match the Italian ones one to one:

- `output.pairs: "langMap"` — only a page the language map
  (`src/data_build/lang-map.json`, `{ "pairs": [{ "it": "/cataloghi/", "en": "/catalogues/" }] }`)
  pairs has an English page; an Italian page with no pair is translated but
  never generated, and an English page with no Italian source is never touched;
- `output.fileName: "path"` — each English file is named after its English
  path (`/catalogues/` → `catalogues.json`), as the hand-written files are;
- `output.langField: false` and `output.keyOrder: "source"` — the generated
  files have the hand-written files' shape: no `lang`, the Italian file's key
  order;
- `output.materialize: "safe"` — `materialize` writes an English file only when
  every leaf of it is translated and the write loses no leaf the memory does
  not hold: an English page that diverges from the Italian one stays as it was
  written until its text is in the human layer.

## `whole-documents.l10n.config.json`

An Italian site whose content files are pages (`tipo: "pagina"`, with
`blocks`) and also collections and shared data with keys of their own, whose
routes add the locale prefix themselves, translated on the developer's machine
on a Claude subscription:

- `document.walk: "auto"` and `document.contextKey: "tipo"` — a file holding
  `blocks` is a page, any other file is walked whole, its leaves' context named
  by its `tipo`;
- `output.path: "neutral"`, `output.langField: false`, `output.keyOrder: "source"` —
  a target file keeps the source path, carries no `lang` and keeps the source
  file's key order;
- `fields.denylistKeyPatterns: ["_*"]` — every marker key, at any depth;
- `fields.identifierStrings` — the strings of the `aree`, `fasi`, `prodotti` and
  `usi` lists are identifiers and codes, their objects content; a string `fase`
  is an identifier, an object `fase` content;
- `fields.skipInParent` — `categoria` inside an image reference (an object with
  a `slug` and only the image keys) is a folder name; elsewhere it is text;
- `adapter.ui.nested: true` — a nested UI dictionary, keyed by path;
- seven target locales, `zh-Hans` and `zh-Hant` among them, each needing its
  `i18n/prompts/<locale>.md`;
- `"backend": { "kind": "claude-code", "login": "allowed" }` with
  `"mode": "local"` — `l10n local` translates through Claude Code with the
  developer's login, no API key and no batch.
