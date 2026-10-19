/**
 * config.mjs — The project configuration: discovery, validation, and the
 * resolution of every path it names.
 *
 * READS the configuration file (`l10n.config.json`) and, when its `locales` key
 * is a path, the locale declaration that path names. WRITES nothing.
 *
 * The configuration is the only place a project states its own rules. Every
 * command loads it through `loadConfig` FIRST — before it reads content, the
 * memory or the glossary, and before any translation backend exists — so a
 * malformed file stops the command with the offending key named, and nothing
 * downstream runs on a guess.
 *
 * PATHS. The project root is the directory holding the configuration file, and
 * every relative path in it resolves against that root. No path is derived from
 * where this package is installed. A path containing `{lang}` is a per-locale
 * pattern, expanded by `expandLang`.
 *
 * THE LOCALE SET is not copied into the configuration: `locales` names the
 * project's own declaration file (`{ "source": …, "targets": […] }`), which is
 * read here, or states the set inline for a project that keeps no such file.
 *
 * THE API KEY. The configuration names the environment variable that holds the
 * key (`backend.apiKeyEnv`, default `ANTHROPIC_API_KEY`); the value itself is
 * read from the environment by the client factory (`client.mjs`) at build or CI
 * time and never appears here. A name beginning `VITE_` is refused, because Vite
 * inlines every `VITE_`-prefixed variable into the client bundle it builds.
 *
 * THE TRANSLATION SETTINGS — the model, its reasoning settings, the attempt
 * limit and the token budgets — have their defaults in ONE place,
 * `translationSettings`, so a configuration that omits them parses to the same
 * value it states, and every reader sees the same defaults.
 *
 * THE CI SETTINGS — `ci.branch`, the branch that holds the machine layer and
 * the pending file, and the optional `ci.dispatch` (`workflow`, `ref`) — have no
 * defaults and are read by the CI command, the deploy-time overlay and the sync
 * (`ci.mjs`, `sync.mjs`); the optional `ci.workflow`, the translation
 * workflow's file name, is read by `doctor` alone, which applies its default,
 * `DEFAULT_WORKFLOW_FILE`. A configuration without `ci` runs every other
 * command unchanged.
 *
 * THE SYNC SETTINGS — `sync.commands` and `sync.paths`, the derived commands and
 * the derived paths, `sync.tokenEnv`, the variable holding the watcher's
 * read-only token, and `sync.intervalSeconds`, the watcher's poll interval —
 * have their defaults in ONE place, `syncSettings`. `sync` needs `ci`. The token
 * variable's name is refused when it begins `VITE_`, as the API key's is.
 *
 * THE MODE — `mode`, `"ci"` or `"local"` — says where a project translates.
 * Absent, it is `"ci"` (`modeOf`, the one place the default is applied), so a
 * configuration written before the key existed means what it meant. A
 * local-mode project translates on the developer's machine with `l10n local`
 * and checks a push with `l10n prepush`; its settings — `local.commands`, the
 * derived commands run after a collection, `local.paths`, what the developer
 * commits, and `local.pollSeconds`, how often the batch is polled — have their
 * defaults in ONE place, `localSettings`. The schema refuses `ci` or `sync` in
 * a local-mode configuration and `local` in a CI-mode one, naming the key.
 *
 * THE KEY DOCUMENTATION. Every key of `ConfigSchema` carries its sentence, the
 * commands that read it and any default applied outside the schema (`doc`,
 * `keyDoc`); `config-reference.mjs` generates the README's configuration
 * reference from them, and refuses a key that carries none.
 */

import nodeFs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** The file name searched for when no explicit path is given. */
export const CONFIG_FILE_NAME = 'l10n.config.json';

/** The environment variable holding the API key when the configuration names none. */
export const DEFAULT_API_KEY_ENV = 'ANTHROPIC_API_KEY';

/** The environment variable holding the watcher's read-only repository token when the configuration names none. */
export const DEFAULT_SYNC_TOKEN_ENV = 'L10N_GIT_READ_TOKEN';

/** The defaults of the sync settings `syncSettings` resolves: the watcher polls every five minutes. */
export const SYNC_DEFAULTS = Object.freeze({ intervalSeconds: 300 });

/** The translation workflow's file name, in `.github/workflows/`, when the configuration names none (`ci.workflow`). */
export const DEFAULT_WORKFLOW_FILE = 'l10n.yml';

/** The two modes a project translates in: in CI (`l10n ci`), or on the developer's machine (`l10n local`). */
export const MODES = Object.freeze(['ci', 'local']);

/** The mode of a configuration with no `mode` key. */
export const DEFAULT_MODE = 'ci';

/** The defaults of the local settings `localSettings` resolves: the batch is polled every 30 seconds. */
export const LOCAL_DEFAULTS = Object.freeze({ pollSeconds: 30 });

/** The placeholder a per-locale path pattern carries. */
export const LANG_PLACEHOLDER = '{lang}';

/** The model used when neither the glossary nor the configuration names one. */
export const DEFAULT_MODEL = 'claude-opus-5-5';

/** The directory of the prompt files — per language, and the optional general one — relative to the memory directory, when `promptsDir` is absent. */
export const DEFAULT_PROMPTS_SUBDIR = 'prompts';

/**
 * The defaults of the translation settings `translationSettings` resolves. The
 * token figures are in the estimator's unit (`tokens.mjs`), an upper bound on
 * the tokens the API counts.
 */
export const TRANSLATION_DEFAULTS = Object.freeze({
  attempts: 3,
  sectionTokens: 8000,
  submission: Object.freeze({ inputTokens: 2_000_000, outputTokens: 500_000 }),
});

/** A configuration that cannot be found, read, parsed or validated. */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const CLIENT_EXPOSED_PREFIX = /^vite_/i;

/** The shape of an environment-variable name the configuration accepts for a secret. */
export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The reason an environment-variable name may not hold a secret, or null when it
 * may. The one rule: a name beginning `VITE_` (in any case) is refused, because
 * Vite inlines such a variable into the client JavaScript it builds, and a secret
 * there is published with the site.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function clientExposedNameProblem(name) {
  if (typeof name === 'string' && CLIENT_EXPOSED_PREFIX.test(name)) {
    return (
      `"${name}" begins with VITE_. Refused by the rule that a secret's variable name never ` +
      'carries the VITE_ prefix: Vite inlines every VITE_-prefixed variable into the client bundle.'
    );
  }
  return null;
}

/**
 * Throws a ConfigError when `name` may not hold a secret (see
 * `clientExposedNameProblem`). `where` names the setting in the message.
 */
export function assertServerOnlyEnvName(name, where = 'apiKeyEnv') {
  const problem = clientExposedNameProblem(name);
  if (problem) throw new ConfigError(`${where}: ${problem}`);
}

/** Expands every `{lang}` in a path pattern. */
export function expandLang(pattern, lang) {
  return String(pattern).split(LANG_PLACEHOLDER).join(lang);
}

// -- Key documentation ---------------------------------------------------------
//
// Every key of the schema carries its documentation on the schema itself: the
// sentence the reference states, the commands that read it, and — where the
// default is applied outside the schema, by `translationSettings`,
// `syncSettings`, `createProject` or a command — that default. The
// configuration reference in the package README is generated from these
// (`config-reference.mjs`), so the reference and the schema have one source.

/** The marker of a key every command reads. */
export const EVERY_COMMAND = '*';

const KEY_DOCS = new WeakMap();
const TYPE_NAMES = new WeakMap();

/**
 * Attaches a key's documentation to its schema and returns the schema to place
 * in the shape: `text` (Markdown), `readBy` (command names, or `EVERY_COMMAND`)
 * and, for a default the schema does not apply itself, `default` (Markdown).
 */
export function doc(schema, meta) {
  const described = schema.describe(meta.text);
  KEY_DOCS.set(described, Object.freeze({ ...meta }));
  if (TYPE_NAMES.has(schema)) TYPE_NAMES.set(described, TYPE_NAMES.get(schema));
  return described;
}

/**
 * Gives a reusable value schema the name the reference prints as its type, and
 * the sentence that defines the name there.
 */
function named(schema, name, text) {
  TYPE_NAMES.set(schema, Object.freeze({ name, text }));
  return schema;
}

/** The documentation `doc` attached to a key's schema, or undefined. */
export function keyDoc(schema) {
  return KEY_DOCS.get(schema);
}

/** The `{ name, text }` that `named` gave a value schema, or undefined. */
export function typeName(schema) {
  return TYPE_NAMES.get(schema);
}

// -- Schema --------------------------------------------------------------------

const nonEmpty = z.string().min(1);
const langPattern = named(
  nonEmpty.refine((s) => s.includes(LANG_PLACEHOLDER), {
    message: `must contain the ${LANG_PLACEHOLDER} placeholder`,
  }),
  'LocalePath',
  `a path, relative to the project root, containing \`${LANG_PLACEHOLDER}\`, which each command expands with a locale.`
);

/** The commands that read the source side of an adapter: its files, its pages and its catalogue. */
const READS_SOURCES = ['extract', 'translate', 'pipeline', 'submit', 'ci', 'local', 'prepush'];
/** The commands that read what an adapter writes or compares, beside the source side. */
const READS_TARGETS = ['generate', 'materialize', 'verify-drift', 'seed', 'prepush'];
/** The commands that call a translation model, or build its requests. */
const TRANSLATES = ['translate', 'pipeline', 'submit', 'ci', 'local'];

/** The characters a locale code may hold: it names prompt files and directories, so letters, digits and inner hyphens alone. */
const LOCALE_CHARS = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

/**
 * Whether a string is a locale code the package accepts: a well-formed BCP 47
 * language tag (`Intl.getCanonicalLocales` accepts it) written in letters,
 * digits and hyphens — `it`, `pt`, `pt-BR`, `zh-Hans`, `zh-Hant`. The code is
 * used as written: in file names, directories, paths and request identifiers.
 *
 * @param {*} code
 * @returns {boolean}
 */
export function isLocaleCode(code) {
  if (typeof code !== 'string' || !LOCALE_CHARS.test(code)) return false;
  try {
    return Intl.getCanonicalLocales(code).length === 1;
  } catch {
    return false;
  }
}

const LocaleCodeSchema = named(
  nonEmpty.refine(isLocaleCode, { message: 'must be a BCP 47 language tag of letters, digits and hyphens, such as "en", "pt-BR" or "zh-Hans"' }),
  'LocaleCode',
  'a BCP 47 language tag written in letters, digits and hyphens, used as written in file names and paths: `it`, `pt`, `pt-BR`, `zh-Hans`, `zh-Hant`.'
);

/** The shape of a locale declaration, before its codes are checked against each other. */
const localeSetShape = {
  source: LocaleCodeSchema,
  targets: z.array(LocaleCodeSchema),
};

/** The one rule between a declaration's codes: each target once, and the source not among them. */
function refineLocaleSet(set, ctx) {
  const seen = new Set();
  set.targets.forEach((lang, index) => {
    if (lang === set.source) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targets', index], message: `"${lang}" is the source locale; a target is another locale` });
    } else if (seen.has(lang)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targets', index], message: `"${lang}" is listed twice` });
    }
    seen.add(lang);
  });
}

/** A locale declaration: the editable locale and the generated ones, each once, the source not among the targets. */
export const LocaleSetSchema = z.object(localeSetShape).superRefine(refineLocaleSet);

/** The same declaration stated inline in the configuration, where an unknown key is refused like any other. */
const InlineLocaleSetSchema = z.object(localeSetShape).strict().superRefine(refineLocaleSet);

const LocalesSchema = z.union([nonEmpty, InlineLocaleSetSchema], {
  errorMap: (issue, ctx) =>
    issue.code === z.ZodIssueCode.invalid_union
      ? { message: 'expected a path to a locale declaration, or an inline { "source": string, "targets": string[] }' }
      : { message: ctx.defaultError },
});

/** A per-locale directory tree: where the source locale is read and each target written. */
const ContentTreeSchema = z
  .object({
    source: doc(langPattern, {
      text: 'The per-locale directory of the content files; with `{lang}` the source locale, where they are read.',
      readBy: [...READS_SOURCES, ...READS_TARGETS, 'doctor'],
    }),
    target: doc(langPattern, {
      text: 'Where `materialize` writes each target locale’s content files, and what `verify-drift`, `seed` and `prepush` read there.',
      readBy: ['materialize', 'verify-drift', 'seed', 'prepush'],
    }),
    staging: doc(langPattern, {
      text: 'Where `generate` writes each target locale’s content files, and what `verify-drift --scope staging` reads.',
      readBy: ['generate', 'pipeline', 'verify-drift'],
    }),
    usageLabel: doc(nonEmpty.optional(), {
      text: 'The prefix the catalogue’s usages and the request pages carry, with `{lang}` the source locale.',
      readBy: READS_SOURCES,
      default: 'the source directory, relative to the root',
    }),
  })
  .strict();

/** A per-locale dictionary file, with the same four roles. */
const DictionaryFileSchema = z
  .object({
    source: doc(langPattern, {
      text: 'The per-locale UI dictionary file; with `{lang}` the source locale, where it is read.',
      readBy: [...READS_SOURCES, ...READS_TARGETS, 'doctor'],
    }),
    target: doc(langPattern, {
      text: 'Where `materialize` writes each target locale’s UI dictionary, and what `verify-drift`, `seed` and `prepush` read there.',
      readBy: ['materialize', 'verify-drift', 'seed', 'prepush'],
    }),
    staging: doc(langPattern, {
      text: 'Where `generate` writes each target locale’s UI dictionary, and what `verify-drift --scope staging` reads.',
      readBy: ['generate', 'pipeline', 'verify-drift'],
    }),
    usageLabel: doc(nonEmpty.optional(), {
      text: 'The label the UI dictionary’s catalogue usages and its request page carry.',
      readBy: READS_SOURCES,
      default: 'the source file, relative to the root',
    }),
    nested: doc(z.boolean().optional(), {
      text:
        'Whether the dictionary is nested: `false`, a flat map whose top-level string values are its entries; `true`, every string at any depth of ' +
        'its objects and lists, keyed by its path (`menu.home`, `items[0]`), the generated dictionaries keeping the source’s shape.',
      readBy: [...READS_SOURCES, ...READS_TARGETS],
      default: '`false`',
    }),
  })
  .strict();

/** The commands that apply the translatable-field rules. */
const READS_FIELDS = [...READS_SOURCES, ...READS_TARGETS];

/** A key pattern: `*` any run of characters, `?` one character, nothing else special. */
const keyPattern = nonEmpty;

/** Where an identifier string sits under its key: as the key's own value, as an element of the list that is its value, or either. */
export const IDENTIFIER_PLACES = Object.freeze(['value', 'list', 'any']);

const IdentifierStringsSchema = z
  .object({
    keys: z.array(nonEmpty).min(1),
    where: z.enum(IDENTIFIER_PLACES),
  })
  .strict();

const SkipInParentSchema = z
  .object({
    key: nonEmpty,
    parentKey: z.array(nonEmpty).min(1).optional(),
    parentHas: z.array(nonEmpty).min(1).optional(),
    parentOnly: z.array(nonEmpty).min(1).optional(),
  })
  .strict()
  .refine((rule) => rule.parentKey || rule.parentHas || rule.parentOnly, {
    message: 'names no parent: give at least one of parentKey, parentHas, parentOnly',
  });

const FieldsSchema = z
  .object({
    denylistKeys: doc(z.array(nonEmpty), {
      text: 'Keys whose whole subtree is never translated, matched case-insensitively: assets, references, style tokens.',
      readBy: READS_FIELDS,
    }),
    pageFields: doc(z.record(nonEmpty, z.array(nonEmpty)), {
      text: 'The page-level fields translated, per sibling object of `blocks`, for example `{ "seo": ["title", "description"] }`; no other page-level field is.',
      readBy: READS_FIELDS,
    }),
    valueGuards: z
      .object({
        refPrefixes: doc(z.array(nonEmpty), {
          text: 'A string beginning with one of these — a path, a URL, an anchor — is not translated.',
          readBy: READS_FIELDS,
        }),
        assetExtensions: doc(
          z.array(z.string().regex(/^[A-Za-z0-9]+$/, 'must be a bare file extension such as "png"')),
          {
            text: 'A string ending in one of these file extensions, written without the dot and optionally followed by a query string, is not translated.',
            readBy: READS_FIELDS,
          }
        ),
        excludeNumbers: doc(z.boolean(), {
          text: 'Whether a string holding a bare number is left untranslated.',
          readBy: READS_FIELDS,
        }),
        excludeBooleans: doc(z.boolean(), {
          text: 'Whether a string holding `true` or `false` is left untranslated.',
          readBy: READS_FIELDS,
        }),
      })
      .strict(),
    denylistKeyPatterns: doc(z.array(keyPattern).optional(), {
      text:
        'Key patterns whose whole subtree is never translated, at any depth, matched case-insensitively like `denylistKeys`: `*` stands for any run of ' +
        'characters and `?` for one, so `_*` excludes every key that begins with an underscore.',
      readBy: READS_FIELDS,
      default: '`[]`',
    }),
    identifierStrings: doc(z.array(IdentifierStringsSchema).optional(), {
      text:
        'Keys whose string values are identifiers, not text, while their object values are content: `{ "keys": [...], "where": "value" | "list" | "any" }`. ' +
        '`value` skips a string that is the key’s own value, `list` a string element of a list that is the key’s value, `any` both; an object, or an ' +
        'object in such a list, is walked as content. Keys match case-insensitively.',
      readBy: READS_FIELDS,
      default: '`[]`',
    }),
    skipInParent: doc(z.array(SkipInParentSchema).optional(), {
      text:
        'A key whose string value is skipped only inside a given parent object: `{ "key", "parentKey"?, "parentHas"?, "parentOnly"? }`, at least one ' +
        'selector. `parentKey` names the keys the parent object sits under (an element of a list sits under the list’s key), `parentHas` keys the ' +
        'parent holds, and `parentOnly` the keys it may hold, besides those `denylistKeyPatterns` matches. Every selector given must hold; keys match ' +
        'case-insensitively.',
      readBy: READS_FIELDS,
      default: '`[]`',
    }),
  })
  .strict();

/** How a content file is walked: as a block-composed page, as a whole document, or each file by its shape. */
export const DOCUMENT_WALKS = Object.freeze(['blocks', 'whole', 'auto']);

const DocumentSchema = z
  .object({
    walk: doc(z.enum(DOCUMENT_WALKS).optional(), {
      text:
        'How a content file is walked: `blocks`, the page-level fields and each `blocks[].data`; `whole`, every key of the file, under the same field rules, ' +
        'with leaf paths relative to the file; `auto`, a file holding a `blocks` array as `blocks` and any other file as `whole`.',
      readBy: READS_FIELDS,
      default: '`"blocks"`',
    }),
    contextKey: doc(nonEmpty.optional(), {
      text:
        'For a file walked whole, the top-level key whose string or number value names the advisory context of its leaves (`<value>:<key>`), as a ' +
        'block’s `name` does for a block’s leaves; without it, or without that key in the file, the context is `document:<key>`.',
      readBy: READS_FIELDS,
      default: 'none',
    }),
  })
  .strict();

/** Where a target page's `path` comes from: the source path under the locale prefix, or the source path unchanged. */
export const OUTPUT_PATHS = Object.freeze(['prefixed', 'neutral']);
/** How a generated file's keys are ordered: alphabetically at every level, or as in its source file. */
export const OUTPUT_KEY_ORDERS = Object.freeze(['sorted', 'source']);
/** Which source pages have a page in a target locale: every one, or only those the language map pairs. */
export const OUTPUT_PAIRS = Object.freeze(['all', 'langMap']);
/** How a generated content file is named: as its source file, or after its target path. */
export const OUTPUT_FILE_NAMES = Object.freeze(['source', 'path']);
/** What `materialize` may write: every generated file, or only files that lose nothing and carry no source fallback. */
export const MATERIALIZE_POLICIES = Object.freeze(['replace', 'safe']);

const READS_OUTPUT = ['generate', 'materialize', 'pipeline', 'verify-drift', 'seed', 'prepush'];

const OutputSchema = z
  .object({
    path: doc(z.enum(OUTPUT_PATHS).optional(), {
      text:
        'A target page’s `path`: `prefixed`, the source path under the locale prefix (`/servizi/` → `/en/servizi/`); `neutral`, the source path unchanged, ' +
        'for a site that adds the prefix itself. A pair in the language map wins in both. A file with no string `path` gets none.',
      readBy: READS_OUTPUT,
      default: '`"prefixed"`',
    }),
    langField: doc(z.boolean().optional(), {
      text: 'Whether a generated page carries `lang` set to its locale. With `false` a page carries `lang` only where its source does, set to the target locale.',
      readBy: READS_OUTPUT,
      default: '`true`',
    }),
    keyOrder: doc(z.enum(OUTPUT_KEY_ORDERS).optional(), {
      text: 'The key order of every generated file, content and UI dictionary: `sorted`, alphabetical at every level; `source`, the source file’s.',
      readBy: READS_OUTPUT,
      default: '`"sorted"`',
    }),
    pairs: doc(z.enum(OUTPUT_PAIRS).optional(), {
      text:
        'Which source pages have a page in a target locale: `all`, every one; `langMap`, only a page whose `path` the language map pairs with that ' +
        'locale. An unpaired page is never generated, materialized, compared or seeded; it is still extracted and translated.',
      readBy: READS_OUTPUT,
      default: '`"all"`',
    }),
    fileName: doc(z.enum(OUTPUT_FILE_NAMES).optional(), {
      text:
        'A generated content file’s name: `source`, the source file’s; `path`, its target `path` with the outer slashes removed and every other `/` ' +
        'written `-` (`/collezioni/self-levelling/` → `collezioni-self-levelling.json`, `/` → `index.json`), or the source file’s for a file with no `path`.',
      readBy: READS_OUTPUT,
      default: '`"source"`',
    }),
    materialize: doc(z.enum(MATERIALIZE_POLICIES).optional(), {
      text:
        'What `materialize` writes: `replace`, every generated file; `safe`, a file only when none of its leaves falls back to the source text and, when ' +
        'the file exists, none of the leaves it would replace or remove is hand-edited (see [Materializing safely](#materializing-safely)).',
      readBy: ['materialize'],
      default: '`"replace"`',
    }),
  })
  .strict();

const JsonContentAdapterSchema = z
  .object({
    kind: z.literal('json-content'),
    content: ContentTreeSchema,
    ui: DictionaryFileSchema.optional(),
    langMap: doc(nonEmpty.optional(), {
      text:
        'The language map, `{ "pairs": [{ "<source>": "/a/", "<target>": "/b/" }] }`: a pair names a source page’s path in a target locale, and with ' +
        '`output.pairs: "langMap"` which pages have one. Without it, a target path follows `output.path`.',
      readBy: READS_OUTPUT,
    }),
    document: DocumentSchema.optional(),
    output: OutputSchema.optional(),
    fields: FieldsSchema,
  })
  .strict();

/** What a Markdown policy does with the text it matches: translate it, or copy the source bytes. */
const MarkdownPolicySchema = z.enum(['translate', 'keep']);

/**
 * The Markdown adapter: the files `include` selects under `sourceDir`, less
 * `exclude`, written per target locale under `outDir`; see
 * `adapters/markdown/index.mjs`.
 */
const MarkdownAdapterSchema = z
  .object({
    kind: z.literal('markdown'),
    sourceDir: doc(nonEmpty, {
      text: 'The corpus root.',
      readBy: [...READS_SOURCES, 'generate', 'doctor'],
    }),
    include: doc(z.array(nonEmpty).min(1), {
      text: 'Globs, relative to `sourceDir`, selecting the source files. At least one.',
      readBy: [...READS_SOURCES, 'generate', 'doctor'],
    }),
    exclude: doc(z.array(nonEmpty).default([]), {
      text: 'Globs removing files from that selection. Neither a file the adapter writes nor one under the memory directory is ever read as a source.',
      readBy: [...READS_SOURCES, 'generate'],
    }),
    outDir: doc(nonEmpty, {
      text: 'Where the target locales are written: every source file, in every target locale, at `<outDir>/<locale>/<relative path>`.',
      readBy: [...READS_SOURCES, 'generate'],
    }),
    frontmatterKeys: doc(z.array(nonEmpty).default([]), {
      text: 'The frontmatter keys whose values are translated.',
      readBy: [...READS_SOURCES, 'generate'],
    }),
    policies: z
      .object({
        paths: doc(z.array(z.object({ glob: nonEmpty, policy: MarkdownPolicySchema }).strict()).default([]), {
          text: 'An ordered list of `{ "glob", "policy" }`; the last entry whose glob matches a file’s relative path decides, and a file no entry matches is translated.',
          readBy: [...READS_SOURCES, 'generate'],
        }),
        regions: doc(z.record(nonEmpty, MarkdownPolicySchema).default({}), {
          text: 'A map from a generated section’s name to `translate` or `keep`; a section it does not name is translated.',
          readBy: [...READS_SOURCES, 'generate'],
        }),
      })
      .strict()
      .default({}),
  })
  .strict();

/** The name of an environment variable that holds a secret: a variable name, never one beginning `VITE_`. */
const SecretEnvNameSchema = named(
  z
    .string()
    .regex(ENV_NAME_PATTERN, 'must be an environment-variable name')
    .superRefine((name, ctx) => {
      const problem = clientExposedNameProblem(name);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    }),
  'SecretName',
  'an environment-variable name (letters, digits and `_`, not starting with a digit) that does not begin `VITE_` in any case.'
);

const ApiKeyEnvSchema = SecretEnvNameSchema.default(DEFAULT_API_KEY_ENV);

/**
 * A reasoning setting, passed to the Messages API's `thinking` parameter
 * unchanged on a request to the primary model, and not sent on a request to the
 * fallback model. The four shapes are the SDK's `ThinkingConfigParam` union; which
 * one a model accepts is the model's rule, stated in the package README.
 */
const ThinkingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('adaptive'), display: z.enum(['summarized', 'omitted']).optional() }).strict(),
  z.object({ type: z.literal('disabled') }).strict(),
  z.object({ type: z.literal('between_tools') }).strict(),
  z
    .object({
      type: z.literal('enabled'),
      budget_tokens: z.number().int().min(1024),
      display: z.enum(['summarized', 'omitted']).optional(),
    })
    .strict(),
]);

/** The model: an id, or an id with its reasoning settings and a fallback for a refused request. */
const ModelSchema = z.union(
  [
    nonEmpty,
    z
      .object({
        id: nonEmpty,
        thinking: ThinkingSchema.optional(),
        effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
        fallbackId: nonEmpty.optional(),
      })
      .strict(),
  ],
  {
    errorMap: (issue, ctx) =>
      issue.code === z.ZodIssueCode.invalid_union
        ? { message: 'expected a model id, or { "id", "thinking"?, "effort"?, "fallbackId"? }' }
        : { message: ctx.defaultError },
  }
);

const positiveInt = named(z.number().int().positive(), 'PositiveInteger', 'an integer greater than 0.');

/** The variable the Claude Code backend reads its OAuth token from when the configuration names none. */
export const DEFAULT_CLAUDE_CODE_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN';

/** The defaults of the Claude Code backend's own settings (`backends/claude-code.mjs`, `claudeCodeSettings`). */
export const CLAUDE_CODE_DEFAULTS = Object.freeze({
  command: 'claude',
  tokenEnv: DEFAULT_CLAUDE_CODE_TOKEN_ENV,
  login: 'never',
  safeMode: true,
  maxPromptBytes: 100 * 1024,
  timeoutSeconds: 600,
  concurrency: 1,
});

/** The backends a configuration can name. */
export const BACKEND_KINDS = Object.freeze(['anthropic', 'claude-code']);

/** The commands that build requests for the synchronous transport, which both backends have. */
const TRANSLATES_SYNC = ['translate', 'pipeline', 'local', 'prepush'];

const attemptsDoc = (readBy) =>
  doc(positiveInt.optional(), {
    text: 'Requests per segment before it stays untranslated.',
    readBy,
    default: `\`${TRANSLATION_DEFAULTS.attempts}\``,
  });
const sectionTokensDoc = (readBy) =>
  doc(positiveInt.optional(), {
    text:
      'A page whose estimated source exceeds this is translated one top-level section per request, a section itself above it divided at its ' +
      'own headings and then into runs of segments, each request given its own section, the sections immediately before and after it and ' +
      'the page’s heading outline as context (see [A request is a page](#a-request-is-a-page)).',
    readBy,
    default: `\`${TRANSLATION_DEFAULTS.sectionTokens}\``,
  });

/** The Claude Code backend's model: an id or alias, or one with its effort and a fallback for a refused request. */
const ClaudeCodeModelSchema = z.union(
  [
    nonEmpty,
    z
      .object({
        id: nonEmpty,
        effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
        fallbackId: nonEmpty.optional(),
      })
      .strict(),
  ],
  {
    errorMap: (issue, ctx) =>
      issue.code === z.ZodIssueCode.invalid_union
        ? { message: 'expected a model id or alias, or { "id", "effort"?, "fallbackId"? }' }
        : { message: ctx.defaultError },
  }
);

/**
 * The Claude Code backend (`backends/claude-code.mjs`): one headless `claude -p`
 * process per request, on a Claude subscription. No default is applied here:
 * `claudeCodeSettings` holds them.
 */
const ClaudeCodeBackendSchema = z
  .object({
    kind: z.literal('claude-code'),
    model: doc(ClaudeCodeModelSchema.optional(), {
      text:
        'The model, passed to the CLI as `--model`: an id or an alias the CLI accepts (`opus`, `sonnet`), or `{ "id", "effort"?, "fallbackId"? }`, ' +
        '`effort` passed as `--effort` and `fallbackId` the model a refused request is resubmitted on once. The glossary’s `model`, when set, replaces the id only.',
      readBy: TRANSLATES_SYNC,
      default: `\`"${DEFAULT_MODEL}"\``,
    }),
    tokenEnv: doc(SecretEnvNameSchema.optional(), {
      text:
        'The environment variable holding the OAuth token `claude setup-token` prints, handed to the CLI as `CLAUDE_CODE_OAUTH_TOKEN` in its environment ' +
        'alone. A name beginning `VITE_` is refused, as for `backend.apiKeyEnv`.',
      readBy: ['translate', 'pipeline', 'local', 'doctor'],
      default: `\`"${DEFAULT_CLAUDE_CODE_TOKEN_ENV}"\``,
    }),
    login: doc(z.enum(['never', 'allowed']).optional(), {
      text:
        'Whether the CLI’s own login is used when the token variable is unset: `never`, the run fails before any process starts; `allowed`, for a ' +
        'developer’s machine. `L10N_CLAUDE_CODE_LOGIN=1` allows it for one run.',
      readBy: ['translate', 'pipeline', 'local'],
      default: '`"never"`',
    }),
    command: doc(nonEmpty.optional(), {
      text: 'The Claude Code command, found on the `PATH` or given as a path.',
      readBy: ['translate', 'pipeline', 'local'],
      default: '`"claude"`',
    }),
    safeMode: doc(z.boolean().optional(), {
      text:
        'Whether the CLI runs with `--safe-mode`, so no instruction file, skill, plugin, hook or MCP server of the machine reaches the translator; ' +
        '`false` for a CLI that predates the flag. Each process runs in an empty temporary directory either way.',
      readBy: ['translate', 'pipeline', 'local'],
      default: '`true`',
    }),
    maxPromptBytes: doc(positiveInt.optional(), {
      text:
        'A request whose system prompt and user message together exceed this many UTF-8 bytes is split in two by its requested segments, each half ' +
        'given the same context, until a part fits or asks for one segment.',
      readBy: ['translate', 'pipeline', 'local'],
      default: `\`${CLAUDE_CODE_DEFAULTS.maxPromptBytes}\``,
    }),
    timeoutSeconds: doc(positiveInt.optional(), {
      text: 'How long one process may run before it is stopped and its request retried as a transient failure.',
      readBy: ['translate', 'pipeline', 'local'],
      default: `\`${CLAUDE_CODE_DEFAULTS.timeoutSeconds}\``,
    }),
    concurrency: doc(positiveInt.optional(), {
      text: 'How many processes run at once; `--conc` overrides it for one run.',
      readBy: ['translate', 'pipeline', 'local'],
      default: `\`${CLAUDE_CODE_DEFAULTS.concurrency}\``,
    }),
    attempts: attemptsDoc(['translate', 'pipeline', 'local']),
    sectionTokens: sectionTokensDoc(TRANSLATES_SYNC),
  })
  .strict();

const AnthropicBackendSchema = z
  .object({
    kind: z.literal('anthropic'),
    model: doc(ModelSchema.optional(), {
      text:
        'The model: an id, or `{ "id", "thinking"?, "effort"?, "fallbackId"? }`. `thinking` (one of the API’s `adaptive`, `disabled`, ' +
        '`between_tools` or `enabled` shapes) and `effort` (`low` to `max`) are sent unchanged to the primary model; `fallbackId` is the ' +
        'model a refused request is resubmitted on once, with `effort` and without `thinking` (see ' +
        '[Replies, and the reasoning settings](#replies-and-the-reasoning-settings)). The glossary’s `model`, when set, replaces the id only.',
      readBy: [...TRANSLATES, 'collect', 'prepush'],
      default: `\`"${DEFAULT_MODEL}"\``,
    }),
    apiKeyEnv: doc(ApiKeyEnvSchema, {
      text: 'The environment variable holding the API key. A name beginning `VITE_` is refused: Vite inlines such a variable into the client bundle.',
      readBy: [...TRANSLATES, 'collect', 'doctor'],
    }),
    attempts: attemptsDoc([...TRANSLATES, 'collect', 'status']),
    sectionTokens: sectionTokensDoc([...TRANSLATES, 'prepush']),
    submission: z
      .object({
        inputTokens: doc(positiveInt, {
          text:
            'The per-submission budget of input tokens, counted in the offline estimate (see [The budget](#the-budget-and-the-estimate-it-is-counted-in)). ' +
            'A `backend.submission` that is stated names both budgets.',
          readBy: ['submit', 'ci', 'local'],
          default: `\`${TRANSLATION_DEFAULTS.submission.inputTokens}\``,
        }),
        outputTokens: doc(positiveInt, {
          text: 'The per-submission budget of output tokens: the sum of the requests’ `max_tokens`.',
          readBy: ['submit', 'ci', 'local'],
          default: `\`${TRANSLATION_DEFAULTS.submission.outputTokens}\``,
        }),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * A git branch name: the characters git admits in a ref, with none of the shapes
 * `git check-ref-format` refuses (a leading `-` or `/`, `..`, `//`, a trailing
 * `/` or `.lock`, `@{`).
 */
const BranchNameSchema = named(
  nonEmpty
    .regex(/^[A-Za-z0-9._/-]+$/, 'must be a git branch name (letters, digits, ".", "_", "-", "/")')
    .refine((s) => !/^[-/]|\.\.|\/\/|\/$|\.lock$|@\{/.test(s), { message: 'is not a valid git branch name' }),
  'BranchName',
  'a git branch name: letters, digits, `.`, `_`, `-` and `/`, with no leading `-` or `/`, no `..`, `//` or `@{`, and no trailing `/` or `.lock`.'
);

/** A workflow file name, as it sits in a repository's `.github/workflows/`. */
const WorkflowFileSchema = named(
  nonEmpty.regex(/^[A-Za-z0-9._-]+\.ya?ml$/, 'must be a workflow file name such as "deploy.yml"'),
  'WorkflowFile',
  'a file name ending `.yml` or `.yaml`, with no directory.'
);

/**
 * The CI command's settings (`cli.mjs`, `ci.mjs`): the branch that holds the
 * machine layer and the pending file, which only `l10n ci` writes, the
 * translation workflow that runs it, which `doctor` checks, the collector
 * workflow it switches on and off, which `doctor` also checks, and the workflow
 * it dispatches, on which ref, after a collection that applied a translation.
 * The CI branch can never be the dispatch ref, which is the project's working
 * branch: CI never writes the working branch.
 */
const CiSchema = z
  .object({
    branch: doc(BranchNameSchema, {
      text: 'The CI branch: the branch holding the machine layer and the pending file, which only `ci` writes; see [Running in CI](#running-in-ci).',
      readBy: ['ci', 'overlay', 'sync', 'watch', 'doctor'],
    }),
    workflow: doc(WorkflowFileSchema.optional(), {
      text: 'The file name, in the repository’s `.github/workflows/`, of the workflow that runs `l10n ci`.',
      readBy: ['doctor'],
      default: `\`"${DEFAULT_WORKFLOW_FILE}"\``,
    }),
    collector: doc(WorkflowFileSchema.optional(), {
      text: 'The file name, in the repository’s `.github/workflows/`, of the collector: the scheduled workflow that runs `l10n ci` while a batch is recorded. `ci` switches it on when it leaves a batch recorded and off when it leaves none; without this key `ci` switches nothing, and a batch is collected by the next push or a manual run. See [The collector](#the-collector).',
      readBy: ['ci', 'doctor'],
    }),
    dispatch: z
      .object({
        workflow: doc(WorkflowFileSchema, {
          text: 'The workflow file `ci` asks GitHub to run after a collection that applied a translation; see [The dispatch](#the-dispatch).',
          readBy: ['ci'],
        }),
        ref: doc(BranchNameSchema, {
          text: 'The branch that workflow runs on: the working branch. The configuration refuses a `ci.branch` equal to it.',
          readBy: ['ci', 'doctor'],
        }),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((ci, ctx) => {
    if (ci.dispatch && ci.dispatch.ref === ci.branch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branch'],
        message: `must differ from ci.dispatch.ref ("${ci.dispatch.ref}"): the CI branch is written by CI alone, never the working branch`,
      });
    }
    const translation = ci.workflow || DEFAULT_WORKFLOW_FILE;
    if (ci.collector && (ci.collector === translation || (ci.dispatch && ci.collector === ci.dispatch.workflow))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['collector'],
        message: `must differ from the translation workflow ("${translation}") and from ci.dispatch.workflow: \`ci\` switches the collector off when no batch is recorded`,
      });
    }
  });

/** A path inside the project: relative to the configuration's directory, with no `..` segment. */
const ProjectPathSchema = named(
  nonEmpty.refine((p) => !path.isAbsolute(p) && !p.split(/[\\/]/).includes('..'), {
    message: 'must be a path inside the project: relative to the configuration file, with no ".." segment',
  }),
  'ProjectPath',
  'a path relative to the project root, with no `..` segment.'
);

/**
 * The sync's settings (`sync.mjs`): the derived commands, run in order in a
 * temporary worktree of HEAD, the derived paths they regenerate, which the sync
 * commits beside the machine layer, the variable holding the watcher's
 * read-only token, and the watcher's poll interval. No default is applied here:
 * `syncSettings` holds them.
 */
const SyncSchema = z
  .object({
    commands: doc(z.array(nonEmpty).optional(), {
      text:
        'The derived commands `sync` runs, in order, each through the shell at the project root of a temporary worktree of `HEAD`; ' +
        'see [Syncing a working branch](#syncing-a-working-branch). `sync` needs `ci`.',
      readBy: ['sync', 'watch', 'doctor'],
      default: '`[]`',
    }),
    paths: doc(z.array(ProjectPathSchema).optional(), {
      text:
        'The derived paths those commands regenerate, relative to the project root, which `sync` commits beside the machine layer. ' +
        'A path outside the repository, or one overlapping the machine layer, stops `sync` with exit 2.',
      readBy: ['sync', 'watch', 'doctor'],
      default: '`[]`',
    }),
    tokenEnv: doc(SecretEnvNameSchema.optional(), {
      text:
        'The environment variable holding the read-only repository token `watch` fetches with, and `sync` when it is set. ' +
        'A name beginning `VITE_` is refused, as for `backend.apiKeyEnv`.',
      readBy: ['sync', 'watch'],
      default: `\`"${DEFAULT_SYNC_TOKEN_ENV}"\``,
    }),
    intervalSeconds: doc(positiveInt.optional(), {
      text: 'How often, in seconds, `watch` polls the CI branch.',
      readBy: ['watch'],
      default: `\`${SYNC_DEFAULTS.intervalSeconds}\``,
    }),
  })
  .strict();

/**
 * The local mode's settings (`local.mjs`, `prepush.mjs`, `doctor.mjs`): the
 * derived commands `l10n local` runs after its last collection, the paths the
 * developer then commits, and how often it polls a batch. No default is applied
 * here: `localSettings` holds them.
 */
const LocalSchema = z
  .object({
    commands: doc(z.array(nonEmpty).optional(), {
      text:
        'The derived commands `local` runs, in order, each through the shell at the project root, after its last collection; ' +
        'see [Translating locally](#translating-locally).',
      readBy: ['local', 'doctor'],
      default: '`[]`',
    }),
    paths: doc(z.array(ProjectPathSchema).optional(), {
      text:
        'What the developer commits after a translation, relative to the project root: the machine layer and the paths those commands regenerate. ' +
        '`local` prints the `git add` of them, and `prepush` names it in a refusal; neither stages anything.',
      readBy: ['local', 'prepush', 'doctor'],
      default: '`[]`',
    }),
    pollSeconds: doc(positiveInt.optional(), {
      text: 'How often, in seconds, `local` polls the batch it waits on.',
      readBy: ['local'],
      default: `\`${LOCAL_DEFAULTS.pollSeconds}\``,
    }),
  })
  .strict();

/**
 * The configuration file's schema. Every object is strict: an unknown key is an
 * error naming the key, never silently ignored, because an ignored key is a rule
 * the author believes is in force and is not. Every key carries its
 * documentation (`doc`), from which the reference in the package README is
 * generated.
 */
export const ConfigSchema = z
  .object({
    locales: doc(LocalesSchema, {
      text:
        'The path of the project’s locale declaration, `{ "source": "it", "targets": ["en"] }`, read on every command; or the same object inline. ' +
        'Each code is a BCP 47 language tag of letters, digits and hyphens (`pt`, `pt-BR`, `zh-Hans`, `zh-Hant`), used as written in file names, ' +
        'paths and request identifiers; each target is listed once, and none is the source.',
      readBy: EVERY_COMMAND,
    }),
    memory: z
      .object({
        dir: doc(nonEmpty, {
          text:
            'The memory directory: the catalogue, the human layer `messages/`, the machine layer `machine/`, the pending file and the job logs; ' +
            'see [The memory](#the-memory-two-layers-one-writer-each).',
          readBy: EVERY_COMMAND,
        }),
      })
      .strict(),
    glossary: doc(nonEmpty.optional(), {
      text:
        'The glossary; see [The shape of the glossary](#the-shape-of-the-glossary). A command that translates runs without one, ' +
        'holding nothing verbatim and pinning no terminology; `doctor` reports its absence.',
      readBy: [...TRANSLATES, 'collect', 'prepush', 'doctor'],
    }),
    promptsDir: doc(nonEmpty.optional(), {
      text:
        'The directory of the prompt files: `<promptsDir>/<locale>.md` for every target locale, and the optional general prompt ' +
        '`<promptsDir>/_general.md`; see [The system prompt](#the-system-prompt).',
      readBy: [...TRANSLATES, 'prepush', 'doctor'],
      default: `\`<memory.dir>/${DEFAULT_PROMPTS_SUBDIR}\``,
    }),
    adapter: doc(z.discriminatedUnion('kind', [JsonContentAdapterSchema, MarkdownAdapterSchema]), {
      text: 'The adapter: `json-content` for a block-composed site’s JSON content, `markdown` for a Markdown corpus. Each takes the keys of its own table below.',
      readBy: [...READS_SOURCES, ...READS_TARGETS, 'doctor'],
    }),
    backend: doc(z.discriminatedUnion('kind', [AnthropicBackendSchema, ClaudeCodeBackendSchema]).default({ kind: 'anthropic' }), {
      text:
        'The translation backend: `anthropic`, the Anthropic Messages API and Message Batches API with an API key; `claude-code`, Claude Code run ' +
        'headless on a Claude subscription, one process per request, which has no batch transport (see [The Claude Code backend](#the-claude-code-backend)). ' +
        '`I18N_BACKEND`, when set, names the backend of one run.',
      readBy: [...TRANSLATES, 'collect', 'doctor'],
    }),
    mode: doc(z.enum(MODES).optional(), {
      text:
        'Where the project translates: `ci`, in CI through `l10n ci` (see [Running in CI](#running-in-ci)), or `local`, on the developer’s machine ' +
        'through `l10n local`, with `l10n prepush` refusing a push until it is translated (see [Translating locally](#translating-locally)). ' +
        'A local-mode configuration carries no `ci` and no `sync`; a CI-mode one carries no `local`.',
      readBy: ['ci', 'overlay', 'sync', 'watch', 'local', 'prepush', 'doctor'],
      default: `\`"${DEFAULT_MODE}"\``,
    }),
    ci: CiSchema.optional(),
    sync: SyncSchema.optional(),
    local: LocalSchema.optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const adapter = config.adapter;
    if (adapter && adapter.kind === 'json-content' && adapter.output && adapter.output.pairs === 'langMap' && !adapter.langMap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adapter', 'output', 'pairs'],
        message: 'is "langMap" but the adapter names no langMap: the pairs are read from the language map',
      });
    }
    if (config.ci && config.backend && config.backend.kind === 'claude-code') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ci'],
        message: '`l10n ci` translates through the Message Batches API, which the claude-code backend does not have: use the anthropic backend in CI, or the local mode',
      });
    }
    if (config.sync && !config.ci) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sync'],
        message: 'needs the "ci" key: the sync reads the branch ci.branch names',
      });
    }
    const mode = config.mode || DEFAULT_MODE;
    if (mode === 'local') {
      for (const key of ['ci', 'sync']) {
        if (config[key] !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `must be absent when mode is "local": a local-mode project translates on the developer's machine, with no CI branch`,
          });
        }
      }
    } else if (config.local !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['local'],
        message: `is read in the local mode only; set mode to "local", or remove the key (mode is "${mode}")`,
      });
    }
  });

/** Renders Zod issues as one line per offending key, each naming its full path. */
function formatIssues(issues, file) {
  const lines = [];
  for (const issue of issues) {
    const at = issue.path.join('.');
    if (issue.code === z.ZodIssueCode.unrecognized_keys) {
      for (const key of issue.keys) lines.push(`  ${at ? `${at}.` : ''}${key}: unknown key`);
    } else {
      lines.push(`  ${at || '(root)'}: ${issue.message}`);
    }
  }
  return `${file}: invalid configuration\n${lines.join('\n')}`;
}

/**
 * Validates a configuration value, returning it with defaults applied, or
 * throwing a ConfigError that names every offending key.
 *
 * @param {unknown} value
 * @param {Object} [opts]
 * @param {string} [opts.file]  the file name to cite in the error.
 */
export function parseConfig(value, { file = CONFIG_FILE_NAME } = {}) {
  const result = ConfigSchema.safeParse(value);
  if (!result.success) throw new ConfigError(formatIssues(result.error.issues, file));
  return result.data;
}

/**
 * Locates the configuration file: the explicit path when given, else
 * `L10N_CONFIG`, else the nearest `l10n.config.json` walking up from `cwd`.
 *
 * @returns {string} an absolute path.
 */
export function findConfigPath({ cwd = process.cwd(), env = process.env, explicit, fsImpl = nodeFs } = {}) {
  if (explicit) return path.resolve(cwd, explicit);
  if (env.L10N_CONFIG) return path.resolve(cwd, env.L10N_CONFIG);
  let dir = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(dir, CONFIG_FILE_NAME);
    if (fsImpl.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ConfigError(
    `no ${CONFIG_FILE_NAME} found in ${path.resolve(cwd)} or any directory above it; ` +
      'pass --config <path> or set L10N_CONFIG.'
  );
}

function readJsonFile(file, fsImpl, what) {
  let raw;
  try {
    raw = fsImpl.readFileSync(file, 'utf8');
  } catch (err) {
    throw new ConfigError(`${file}: the ${what} cannot be read (${(err && err.code) || err}).`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`${file}: the ${what} is not valid JSON (${(err && err.message) || err}).`);
  }
}

/** Resolves the `locales` key to `{ source, targets }`, reading the named file when it is a path. */
function resolveLocales(locales, root, fsImpl) {
  if (typeof locales !== 'string') return { source: locales.source, targets: [...locales.targets] };
  const file = path.resolve(root, locales);
  const declared = LocaleSetSchema.safeParse(readJsonFile(file, fsImpl, 'locale declaration'));
  if (!declared.success) {
    const detail = declared.error.issues
      .filter((issue) => issue.code === z.ZodIssueCode.custom)
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(
      `${file}: malformed locale declaration; expected { "source": string, "targets": string[] }` +
        (detail.length ? ` (${detail.join('; ')}).` : '.')
    );
  }
  return { source: declared.data.source, targets: [...declared.data.targets] };
}

/**
 * A loaded project: the validated configuration plus everything resolved from
 * it.
 *
 * @typedef {Object} Project
 * @property {string} configPath     absolute path of the configuration file.
 * @property {string} root           the project root: the configuration file's directory.
 * @property {Object} config         the validated configuration, defaults applied.
 * @property {{source:string, targets:string[]}} locales  the locale set.
 * @property {string} memoryDir      absolute path of the memory directory.
 * @property {string|null} glossaryPath  absolute path of the glossary, or null.
 * @property {string} promptsDir     absolute path of the prompt files, per language and
 *                                   the optional general one (`promptsDir`, else
 *                                   `<memory.dir>/prompts`).
 * @property {(rel:string)=>string} resolve  resolves a configuration path against the root.
 */

/**
 * Builds a Project from an already-validated configuration and its root. Used by
 * `loadConfig`, and directly by a caller that holds the configuration in memory.
 *
 * @returns {Project}
 */
export function createProject({ configPath, root, config, locales }) {
  const resolve = (rel) => path.resolve(root, rel);
  const memoryDir = resolve(config.memory.dir);
  return {
    configPath,
    root,
    config,
    locales,
    memoryDir,
    glossaryPath: config.glossary ? resolve(config.glossary) : null,
    promptsDir: config.promptsDir ? resolve(config.promptsDir) : path.join(memoryDir, DEFAULT_PROMPTS_SUBDIR),
    resolve,
  };
}

/**
 * The resolved translation settings.
 *
 * @typedef {Object} TranslationSettings
 * @property {{id:string, thinking?:Object, effort?:string, fallbackId?:string}} model
 *           the model; `thinking` and `effort` are passed to the API unchanged
 *           — `thinking` on a request to the primary model only — and are
 *           absent when the configuration states neither.
 * @property {string} apiKeyEnv      the environment variable holding the API key.
 * @property {number} attempts       requests per segment before it stays untranslated.
 * @property {number} sectionTokens  a page whose estimated source exceeds this is translated one top-level section per request.
 * @property {{inputTokens:number, outputTokens:number}} submission  the per-submission budgets.
 */

/**
 * Resolves a validated `backend` key, and an optional glossary, to the
 * translation settings, applying every default. The glossary's `model`, when
 * set, replaces the model id only.
 *
 * @param {Object} backend   the validated `backend` key.
 * @param {Object} [glossary]
 * @returns {TranslationSettings}
 */
export function translationSettings(backend = {}, glossary = {}) {
  const declared = typeof backend.model === 'string' ? { id: backend.model } : { ...(backend.model || {}) };
  const id = (glossary && typeof glossary.model === 'string' && glossary.model) || declared.id || DEFAULT_MODEL;
  const model = { ...declared, id };
  return {
    model,
    apiKeyEnv: backend.apiKeyEnv || DEFAULT_API_KEY_ENV,
    attempts: backend.attempts ?? TRANSLATION_DEFAULTS.attempts,
    sectionTokens: backend.sectionTokens ?? TRANSLATION_DEFAULTS.sectionTokens,
    submission: { ...TRANSLATION_DEFAULTS.submission, ...(backend.submission || {}) },
  };
}

/**
 * The defaults of the JSON-content adapter's document, output and UI settings,
 * which `jsonContentSettings` resolves: each one the 1.0.0 behaviour, so a
 * configuration that states none of them generates what it generated then.
 */
export const JSON_CONTENT_DEFAULTS = Object.freeze({
  document: Object.freeze({ walk: 'blocks', contextKey: null }),
  output: Object.freeze({
    path: 'prefixed',
    langField: true,
    keyOrder: 'sorted',
    pairs: 'all',
    fileName: 'source',
    materialize: 'replace',
  }),
  ui: Object.freeze({ nested: false }),
});

/**
 * Resolves a validated JSON-content `adapter` key to its document, output and
 * UI settings, applying every default.
 *
 * @param {Object} [adapter]  the validated `adapter` key.
 * @returns {{document:{walk:string, contextKey:string|null}, output:{path:string, langField:boolean, keyOrder:string, pairs:string, fileName:string, materialize:string}, ui:{nested:boolean}}}
 */
export function jsonContentSettings(adapter = {}) {
  return {
    document: { ...JSON_CONTENT_DEFAULTS.document, ...((adapter && adapter.document) || {}) },
    output: { ...JSON_CONTENT_DEFAULTS.output, ...((adapter && adapter.output) || {}) },
    ui: { nested: Boolean(adapter && adapter.ui && adapter.ui.nested) },
  };
}

/**
 * The resolved sync settings.
 *
 * @typedef {Object} SyncSettings
 * @property {string[]} commands       the derived commands, in order, each run through the shell.
 * @property {string[]} paths          the derived paths, relative to the project root.
 * @property {string} tokenEnv         the environment variable holding the watcher's read-only token.
 * @property {number} intervalSeconds  the watcher's poll interval.
 */

/**
 * Resolves a validated `sync` key, or its absence, to the sync settings,
 * applying every default: no derived command and no derived path, so a sync
 * then commits the machine layer alone.
 *
 * @param {Object} [sync]
 * @returns {SyncSettings}
 */
export function syncSettings(sync = {}) {
  return {
    commands: [...(sync.commands || [])],
    paths: [...(sync.paths || [])],
    tokenEnv: sync.tokenEnv || DEFAULT_SYNC_TOKEN_ENV,
    intervalSeconds: sync.intervalSeconds ?? SYNC_DEFAULTS.intervalSeconds,
  };
}

/**
 * The mode a validated configuration translates in: its `mode`, else
 * `DEFAULT_MODE`.
 *
 * @param {Object} config  the validated configuration.
 * @returns {'ci'|'local'}
 */
export function modeOf(config = {}) {
  return (config && config.mode) || DEFAULT_MODE;
}

/**
 * The resolved local settings.
 *
 * @typedef {Object} LocalSettings
 * @property {string[]} commands   the derived commands, in order, each run through the shell at the project root.
 * @property {string[]} paths      what the developer commits, relative to the project root.
 * @property {number} pollSeconds  how often the batch is polled.
 */

/**
 * Resolves a validated `local` key, or its absence, to the local settings,
 * applying every default: no derived command, no path, a poll every
 * `LOCAL_DEFAULTS.pollSeconds` seconds.
 *
 * @param {Object} [local]
 * @returns {LocalSettings}
 */
export function localSettings(local = {}) {
  return {
    commands: [...(local.commands || [])],
    paths: [...(local.paths || [])],
    pollSeconds: local.pollSeconds ?? LOCAL_DEFAULTS.pollSeconds,
  };
}

/**
 * Reads, validates and resolves a configuration file. Throws a ConfigError on
 * any defect, before anything else in the project has been read.
 *
 * @param {Object} args
 * @param {string} args.configPath   absolute path of the configuration file.
 * @param {typeof nodeFs} [args.fsImpl]
 * @returns {Project}
 */
export function loadConfig({ configPath, fsImpl = nodeFs }) {
  const config = parseConfig(readJsonFile(configPath, fsImpl, 'configuration'), { file: configPath });
  const root = path.dirname(configPath);
  const locales = resolveLocales(config.locales, root, fsImpl);
  return createProject({ configPath, root, config, locales });
}

export default {
  CONFIG_FILE_NAME,
  DEFAULT_API_KEY_ENV,
  DEFAULT_SYNC_TOKEN_ENV,
  DEFAULT_MODEL,
  DEFAULT_WORKFLOW_FILE,
  DEFAULT_MODE,
  MODES,
  BACKEND_KINDS,
  CLAUDE_CODE_DEFAULTS,
  DEFAULT_CLAUDE_CODE_TOKEN_ENV,
  TRANSLATION_DEFAULTS,
  SYNC_DEFAULTS,
  LOCAL_DEFAULTS,
  ENV_NAME_PATTERN,
  EVERY_COMMAND,
  keyDoc,
  typeName,
  translationSettings,
  syncSettings,
  modeOf,
  localSettings,
  jsonContentSettings,
  JSON_CONTENT_DEFAULTS,
  ConfigError,
  ConfigSchema,
  parseConfig,
  findConfigPath,
  loadConfig,
  createProject,
  expandLang,
  isLocaleCode,
  clientExposedNameProblem,
  assertServerOnlyEnvName,
};
