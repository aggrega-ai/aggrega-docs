<!--
The labels of the sidebar beside every page of the documentation site: the
names of its groups, the links the sidebar names itself rather than by the
page's title, and the badge on the link to the catalog. The site
configuration (astro.config.mjs and src/examples-sidebar.mjs) names each label
by its key, and the build stops on an entry that writes its label in English
or names a key this file lacks. The labels are translated with the
documentation, into every language the translation configuration
(l10n/l10n.config.json) names, and the site shows each language's labels on
that language's pages (sidebarLabels in src/translations.mjs); a label with no
translation shows in English. Each item is a key in inline code, which the
translation keeps, then the label. The keys catalog and examples are written
as in site-nav.md, so one translation serves both menus. The titles of the
Examples section's tiers are not here: they are the headings of
language-reference/examples/by-product-and-capability.md, translated with that
page.
-->

The labels of the sidebar beside every page of the documentation: the names
of its sections and of the groups inside them, the links it names itself, and
the badge on a link that leads to another site:

- `startHere`: Start here
- `whatIsAggrega`: What is Aggrega
- `aiAssistants`: AI assistants
- `install`: Install
- `architecture`: Concepts & Architecture
- `import`: Import
- `visualStudioCode`: Visual Studio Code
- `authoring`: Authoring
- `languageReference`: Language Reference
- `entities`: Entities
- `vocabulary`: Vocabulary
- `templates`: Templates
- `providers`: Providers
- `plugins`: Plugins
- `cliReference`: CLI Reference
- `errors`: Errors
- `examples`: Examples
- `exampleConcepts`: Concepts
- `schemaReference`: Schema Reference
- `pluginSchemas`: Plugin ABI & payload schemas
- `otherSchemas`: Other & workspace schemas
- `changelogAndRoadmap`: Changelog and roadmap
- `changelog`: Changelog
- `roadmap`: Roadmap
- `catalog`: Catalog
- `external`: External
