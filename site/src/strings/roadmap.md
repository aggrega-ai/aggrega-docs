<!--
The words screen readers say for the marks beside the items of the roadmap page
(roadmap.md): an item written `- [x]` shows a green mark and is read as done, an
item written `- [ ]` shows an empty box and is read as not done
(src/plugins/roadmap-marks.mjs). The words are translated with the
documentation, into every language the translation configuration
(l10n/l10n.config.json) names, and each language's roadmap page says that
language's words (roadmapLabels in src/translations.mjs); a word with no
translation is said in English. Each item is a key in inline code, which the
translation keeps, then the word: the site reads the words by their keys.
-->

The words a screen reader says for the mark beside each item of the roadmap,
which tells whether the work the item describes is finished:

- `done`: Done
- `notDone`: Not done
