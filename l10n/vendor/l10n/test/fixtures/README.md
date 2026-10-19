# Test fixtures

`project/` is a minimal consuming project: a configuration file, a locale
declaration, source and hand-written target content, a UI dictionary, a glossary,
a human memory layer and the per-language prompt file of its one target locale
(`memory/prompts/en.md`, the default location). Tests copy it to a temporary
directory before running a command against it, so no test writes inside the
package.

`markdown/` is a minimal documentation corpus for the Markdown adapter: a
configuration file and, under `docs/`, pages that plant every structure the
adapter segments, protects or leaves alone — lists, a blockquote, a table with
cells that are and are not segments, code, HTML, links and images, references,
a footnote, frontmatter, duplicate headings, a kept path, a kept and a translated
generated section, and an excluded draft; and the prompt files of its two target
locales under `memory/prompts/`. Tests copy it the same way.
