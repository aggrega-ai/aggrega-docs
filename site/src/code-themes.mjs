import { theme as brandTheme } from "@aggrega-ai/brand";

// The syntax highlighting themes for code blocks, one per site theme, built
// from the brand's code-surface and syntax role tokens. No colour is written
// here: each theme reads its values from the brand package's constants, which
// carry the same values as the --color-code-* custom properties, and the brand's
// own test holds every syntax role at 4.5:1 or more on its code surface.
//
// Each syntax role is bound to the TextMate scopes it colours. Where a more
// specific scope must win over a broader one (a JSON property name is also a
// support.type; a string's quotes are also punctuation), the more specific
// selector is listed, and the highlighter prefers it by specificity.
const scopesByRole = {
  codeComment: ["comment", "punctuation.definition.comment"],
  codeKeyword: [
    "keyword",
    "storage",
    "storage.type",
    "storage.modifier",
    "keyword.control",
    "entity.name.function",
    "support.function",
    "entity.name.command",
  ],
  codeString: [
    "string",
    "punctuation.definition.string",
    "string.unquoted.plain.out.yaml",
    "string.unquoted.plain.in.yaml",
    "markup.inline.raw",
  ],
  codeNumber: [
    "constant.numeric",
    "constant.language",
    "constant.character",
    "constant.other",
    "variable.other.constant",
  ],
  codeProperty: [
    "entity.name.tag",
    "entity.name.tag.yaml",
    "support.type.property-name",
    "meta.object-literal.key",
    "variable.other.property",
    "variable.other.object.property",
    "entity.other.attribute-name",
    "variable.other.normal.shell",
    "variable.other.readwrite",
  ],
  codeType: [
    "entity.name.type",
    "entity.name.class",
    "support.type",
    "support.class",
    "entity.other.inherited-class",
    "storage.type.tag-handle.yaml",
    "entity.name.type.anchor.yaml",
    "variable.other.alias.yaml",
  ],
  codePunctuation: [
    "punctuation",
    "meta.brace",
    "keyword.operator",
    "punctuation.separator.key-value",
    "punctuation.definition.block.sequence.item.yaml",
  ],
};

function codeTheme(type) {
  const roles = brandTheme[type];
  return {
    name: `aggrega-code-${type}`,
    type,
    colors: {
      "editor.background": roles.codeSurface,
      "editor.foreground": roles.codeText,
      "editorGroupHeader.tabsBackground": roles.codeFrame,
      "editorGroupHeader.tabsBorder": roles.codeFrame,
      "titleBar.activeBackground": roles.codeFrame,
      "titleBar.activeForeground": roles.codeText,
      "titleBar.border": roles.codeFrame,
      "tab.activeBackground": roles.codeSurface,
      "tab.activeForeground": roles.codeText,
      "tab.activeBorder": roles.codeSurface,
      "tab.activeBorderTop": roles.codeFrame,
    },
    tokenColors: [
      { settings: { foreground: roles.codeText, background: roles.codeSurface } },
      ...Object.entries(scopesByRole).map(([role, scope]) => ({
        scope,
        settings: { foreground: roles[role] },
      })),
    ],
  };
}

// Dark first, light second: with one theme of each type, Starlight switches the
// code theme together with the site theme.
export const codeThemes = [codeTheme("dark"), codeTheme("light")];
