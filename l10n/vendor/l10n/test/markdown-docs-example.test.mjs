/**
 * markdown-docs-example.test.mjs — The Markdown example, `examples/markdown-docs/`:
 * the translation configuration of the Aggrega documentation corpus, checked as
 * the package reads it.
 *
 * READS the example's configuration, glossary and prompt files. WRITES only the
 * temporary directories it creates: a copy of the example with a two-page corpus
 * beside it, against which the real command line runs with a fake SDK client, so
 * no request leaves the process.
 */

import './no-network.mjs';
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from '../src/config.mjs';
import { GENERAL_PROMPT_FILE, loadGeneralPrompt, loadLanguagePrompts } from '../src/requests.mjs';
import { validateTranslations } from '../src/validate.mjs';
import { doNotTranslateOf, generalRules } from '../src/translator-prompt.mjs';
import { keyOf } from '../src/normalize.mjs';
import { runCli } from '../src/cli.mjs';
import { EXAMPLES, capture, copyExample, fakeAnthropic, requestBody } from './helpers.mjs';

const EXAMPLE = path.join(EXAMPLES, 'markdown-docs');
const CONFIG = path.join(EXAMPLE, 'l10n', 'l10n.config.json');
const PROMPTS = path.join(EXAMPLE, 'l10n', 'prompts');

const TARGETS = ['it', 'de', 'fr', 'es', 'pt-BR', 'zh-CN', 'ja', 'ko', 'pl', 'tr', 'uk', 'id', 'vi', 'ru'];

/**
 * The generated-section names of the corpus: the census of `BEGIN GENERATED:
 * <name>` over the Aggrega documentation repository at its commit `fe7aca7`,
 * the whole tree but the `site/`, `dist/` and `node_modules/` directories,
 * taken on 2026-10-17 and calibrated by a planted needle. A section added to the
 * corpus is added here and to the configuration together.
 */
const CENSUS = [
  'advisory-short-codes', 'cli-auth', 'cli-build', 'cli-cache', 'cli-config', 'cli-deprecate',
  'cli-edit-document', 'cli-explain', 'cli-get-schema', 'cli-import', 'cli-inspect', 'cli-lint',
  'cli-login', 'cli-logout', 'cli-mcp', 'cli-pin', 'cli-plugin', 'cli-pull', 'cli-push',
  'cli-push-artifact', 'cli-registry', 'cli-scaffold', 'cli-search', 'cli-serve', 'cli-sign',
  'cli-validate', 'cli-version', 'command-list', 'condition-short-codes', 'error-identities',
  'global-flags', 'halt-condition-sentences', 'provider-capability-matrix',
  'well-known-annotation-boundary-scope', 'well-known-annotation-support',
];

/**
 * The product nouns, each with its English plural where it has one. The
 * validation never finds a term inside a longer word of its own script, so a plural
 * is a term of its own, and the glossary lists it right after its singular.
 */
const PRODUCT_NOUNS = [
  ['Aggrega'], ['Aggregate', 'Aggregates'], ['Component', 'Components'], ['Feature', 'Features'],
  ['FeatureRecipe', 'FeatureRecipes'], ['Recipe', 'Recipes'], ['Manifest', 'Manifests'],
  ['Release', 'Releases'], ['Provider', 'Providers'], ['Plugin', 'Plugins'],
  ['SchemaLibrary', 'SchemaLibraries'], ['MappingLibrary', 'MappingLibraries'],
  ['ArtifactLibrary', 'ArtifactLibraries'], ['WorkloadLibrary', 'WorkloadLibraries'],
  ['Workload', 'Workloads'], ['Wasm'], ['Studio', 'Studios'],
];

/** Every do-not-translate term, in the glossary's order. */
const DO_NOT_TRANSLATE = PRODUCT_NOUNS.flat();

const QUALIFIERS = [
  'social contract', 'best practice', 'escape hatch', 'convention',
  'unopinionated', 'content-neutral', 'agnostic to',
];

const LOCALE_HEADINGS = ['Register', 'Quotation marks', 'English terms kept as they are', 'The qualifiers'];
const GENERAL_HEADINGS = ['What the corpus is and who reads it', 'What stays exactly as written', 'The qualifiers', 'The Markdown'];
const INVITATION = 'A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.';

/** A Markdown file's `##` sections: heading → body text, in order. */
function sections(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^## (.+)$/.exec(line);
    if (m) out.push({ heading: m[1], body: [] });
    else if (out.length) out[out.length - 1].body.push(line);
  }
  return out.map((s) => ({ heading: s.heading, body: s.body.join('\n') }));
}

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the configuration', () => {
  const project = loadConfig({ configPath: CONFIG });
  const { config } = project;

  it('validates through the loader and names the corpus, its 14 targets and its model', () => {
    expect(project.locales).toEqual({ source: 'en', targets: TARGETS });
    expect(config.adapter.kind).toBe('markdown');
    expect(project.resolve(config.adapter.sourceDir)).toBe(path.resolve(EXAMPLE));
    expect(config.adapter.include).toEqual(['README.md', 'architecture/**/*.md', 'authoring/**/*.md', 'language-reference/**/*.md']);
    expect(config.adapter.exclude).toEqual(['**/.aggrega/**', '**/examples/**/charts/**', '**/examples/**/dist/**']);
    expect(project.resolve(config.adapter.outDir)).toBe(path.join(EXAMPLE, 'l10n'));
    expect(project.memoryDir).toBe(path.join(EXAMPLE, 'l10n', 'memory'));
    expect(project.promptsDir).toBe(PROMPTS);
    expect(project.glossaryPath).toBe(path.join(EXAMPLE, 'l10n', 'glossary.json'));
    expect(config.backend).toEqual({
      kind: 'anthropic',
      model: { id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, effort: 'low', fallbackId: 'claude-opus-5-5' },
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      submission: { inputTokens: 7_500_000, outputTokens: 900_000 },
    });
    expect(config.ci).toEqual({ branch: 'l10n-memory', collector: 'l10n-collect.yml' });
  });

  it('translates the generated reference paths explicitly', () => {
    expect(config.adapter.policies.paths).toEqual([
      { glob: 'language-reference/schema/**', policy: 'translate' },
      { glob: 'language-reference/plugins/embedded-plugins.md', policy: 'translate' },
    ]);
  });

  it('names every generated section of the corpus census with the policy translate, and no other section', () => {
    const regions = config.adapter.policies.regions;
    const named = Object.keys(regions);
    expect(CENSUS.filter((name) => !named.includes(name))).toEqual([]);
    expect(named.filter((name) => !CENSUS.includes(name))).toEqual([]);
    expect(Object.entries(regions).filter(([, policy]) => policy !== 'translate')).toEqual([]);
  });
});

describe('the glossary', () => {
  const glossary = JSON.parse(fs.readFileSync(path.join(EXAMPLE, 'l10n', 'glossary.json'), 'utf8'));
  const source = `${DO_NOT_TRANSLATE.join(', ')} are the product's nouns.`;
  const item = { srcHash: keyOf(source), source, format: 'markdown', protected: [] };
  const translate = (drop) => `${DO_NOT_TRANSLATE.map((noun) => (noun === drop ? 'parola' : noun)).join(', ')} sono i nomi del prodotto.`;
  const { terms, caseSensitive } = doNotTranslateOf(glossary);
  const check = (text, unit = item) =>
    validateTranslations({ items: [unit], entries: [{ id: unit.srcHash, text }], doNotTranslate: terms, caseSensitive });

  it('holds exactly the product nouns as do-not-translate, and names every target language', () => {
    expect(DO_NOT_TRANSLATE.filter((term) => !glossary.do_not_translate.includes(term))).toEqual([]);
    expect(glossary.do_not_translate.filter((term) => !DO_NOT_TRANSLATE.includes(term))).toEqual([]);
    expect(glossary.do_not_translate).toEqual(DO_NOT_TRANSLATE);
    expect(Object.keys(glossary.target_lang_names).sort()).toEqual(['en', ...TARGETS].sort());
  });

  it('a translation keeping every noun passes the validation', () => {
    expect(check(translate(null))).toEqual({ accepted: { [item.srcHash]: translate(null) }, rejected: {}, dropped: [] });
  });

  for (const noun of DO_NOT_TRANSLATE) {
    it(`a translation that drops ${noun} is rejected, naming it`, () => {
      const { accepted, rejected } = check(translate(noun));
      expect(accepted).toEqual({});
      expect(rejected[item.srcHash]).toBe(`the do-not-translate term "${noun}" is missing; keep it verbatim`);
    });
  }

  for (const [singular, plural] of PRODUCT_NOUNS.filter((forms) => forms.length === 2)) {
    it(`${plural} is a term of its own: a translation keeping it beside ${singular} is accepted, one writing ${singular} for it is rejected, naming ${plural}`, () => {
      const source = `Two ${plural} and one ${singular}.`;
      const unit = { srcHash: keyOf(source), source, format: 'markdown', protected: [] };
      const keeps = `Due ${plural} e un ${singular}.`;
      expect(check(keeps, unit)).toEqual({ accepted: { [unit.srcHash]: keeps }, rejected: {}, dropped: [] });
      const { accepted, rejected } = check(`Due ${singular} e un ${singular}.`, unit);
      expect(accepted).toEqual({});
      expect(rejected[unit.srcHash]).toBe(`the do-not-translate term "${plural}" is missing; keep it verbatim`);
    });
  }

  it('turns the case-sensitive mode on: a translation keeping Component and translating component is accepted, one translating Component is rejected', () => {
    expect(glossary.do_not_translate_case).toBe('sensitive');
    expect(caseSensitive).toBe(true);
    const source = 'Each Component declares the component it provides.';
    const unit = { srcHash: keyOf(source), source, format: 'markdown', protected: [] };
    const keeps = 'Ogni Component dichiara il componente che fornisce.';
    expect(check(keeps, unit)).toEqual({ accepted: { [unit.srcHash]: keeps }, rejected: {}, dropped: [] });
    const { accepted, rejected } = check('Ogni Componente dichiara il componente che fornisce.', unit);
    expect(accepted).toEqual({});
    expect(rejected[unit.srcHash]).toBe('the do-not-translate term "Component" is missing; keep it verbatim');
  });

  it('every locale’s system prompt states the case-sensitive mode in rule 1', () => {
    for (const lang of TARGETS) {
      const rules = generalRules({ lang, sourceLang: 'en', glossary });
      expect(rules).toContain('Match them CASE-SENSITIVELY: a term matches only where it occurs exactly as the glossary section writes it');
      expect(rules).not.toContain('CASE-INSENSITIVELY');
    }
  });
});

describe('the prompt files', () => {
  it('are the general prompt and one file per target locale, and nothing else', () => {
    expect(fs.readdirSync(PROMPTS).sort()).toEqual([GENERAL_PROMPT_FILE, ...TARGETS.map((lang) => `${lang}.md`)].sort());
    expect(Object.keys(loadLanguagePrompts({ promptsDir: PROMPTS, targets: TARGETS }))).toEqual(TARGETS);
  });

  it('the general prompt states, in order, the corpus and its readers, what stays as written, the qualifiers, and the Markdown', () => {
    const text = loadGeneralPrompt({ promptsDir: PROMPTS });
    const parts = sections(text);
    expect(parts.map((s) => s.heading)).toEqual(GENERAL_HEADINGS);
    expect(parts[0].body).toMatch(/entity YAML/);
    expect(parts[0].body).toMatch(/plugin authors/);
    expect(parts[0].body).toMatch(/integration authors/);
    for (const phrase of ['YAML keys', 'CLI commands and flags', 'entity kinds', 'file paths', 'inline code']) {
      expect(parts[1].body).toContain(phrase);
    }
    for (const qualifier of QUALIFIERS) expect(parts[2].body).toContain(`\`${qualifier}\``);
    expect(parts[2].body).toMatch(/never render the compiler's neutrality as a deficiency or an insult/);
    expect(parts[2].body).toMatch(/never strengthen/);
    expect(parts[3].body).toMatch(/keeps every Markdown construct the source has/);
  });

  for (const lang of TARGETS) {
    it(`${lang}.md holds the four headings, a rendering of each qualifier, and ends inviting a native speaker's correction`, () => {
      const text = fs.readFileSync(path.join(PROMPTS, `${lang}.md`), 'utf8');
      const parts = sections(text);
      expect(parts.map((s) => s.heading)).toEqual(LOCALE_HEADINGS);
      const renderings = parts[3].body
        .split('\n')
        .filter((line) => line.startsWith('- '))
        .map((line) => /^- `([^`]+)`: \S/.exec(line));
      expect(renderings.every(Boolean)).toBe(true);
      expect(renderings.map((m) => m[1])).toEqual(QUALIFIERS);
      expect(text.trimEnd().split('\n').pop()).toBe(INVITATION);
      expect(text).toMatch(/is a default, made without a native speaker's review/);
    });
  }
});

describe('the example run over a two-page corpus, with a fake client', () => {
  /** A copy of the example with two source pages at its root, extracted. */
  async function corpus() {
    const root = copyExample('markdown-docs');
    dirs.push(root);
    fs.writeFileSync(path.join(root, 'README.md'), '# The corpus\n\nA Component is declared in an Aggregate.\n');
    fs.mkdirSync(path.join(root, 'architecture'));
    fs.writeFileSync(path.join(root, 'architecture', 'pipeline.md'), '# The pipeline\n\nThe compiler is content-neutral by design.\n');
    const io = capture();
    expect(await runCli(['extract', '--config', 'l10n/l10n.config.json'], { cwd: root, env: {}, log: io.log, errlog: io.errlog })).toBe(0);
    expect(io.text()).toContain('extract: 2 files, 4 segments');
    return root;
  }

  it('submit --dry-run prints every locale and creates no client', async () => {
    const root = await corpus();
    const fake = fakeAnthropic();
    const io = capture();
    expect(await runCli(['submit', '--dry-run', '--config', 'l10n/l10n.config.json'], { cwd: root, env: {}, ClientClass: fake.FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(0);
    const perLocale = io.out.filter((line) => /^ {2}\S+: \d+ pages?, /.test(line));
    expect(perLocale.map((line) => line.trim().split(':')[0])).toEqual(TARGETS);
    for (const line of perLocale) expect(line).toMatch(/: 2 pages, 2 requests, estimated input \d+ tokens \(\d+ cached, \d+ uncached\), estimated output \d+ tokens$/);
    expect(io.text()).toContain('submit --dry-run: no batch created, no file written.');
    expect(fake.constructed).toHaveLength(0);
    expect(fs.existsSync(path.join(root, 'l10n', 'memory', 'pending.json'))).toBe(false);
  });

  it('every request carries the general prompt third and its locale’s file last, byte-identical across the two pages of a locale', async () => {
    const root = await corpus();
    const fake = fakeAnthropic();
    const io = capture();
    expect(await runCli(['submit', '--config', 'l10n/l10n.config.json'], { cwd: root, env: { ANTHROPIC_API_KEY: 'k' }, ClientClass: fake.FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(0);
    const general = fs.readFileSync(path.join(PROMPTS, GENERAL_PROMPT_FILE), 'utf8');
    const requests = fake.calls.batchCreate[0].requests.map((r) => r.params);
    expect(requests).toHaveLength(2 * TARGETS.length);
    for (const lang of TARGETS) {
      const mine = requests.filter((params) => params.system[3].text === fs.readFileSync(path.join(PROMPTS, `${lang}.md`), 'utf8'));
      expect(mine.map((params) => requestBody(params).page).sort()).toEqual(['README.md', 'architecture/pipeline.md']);
      const [a, b] = mine.map((params) => JSON.stringify(params.system));
      expect(a).toBe(b);
      expect(mine[0].system).toHaveLength(4);
      expect(mine[0].system[2].text).toBe(general);
      expect(mine[0].system.map((block) => block.cache_control)).toEqual([undefined, undefined, undefined, { type: 'ephemeral', ttl: '1h' }]);
    }
    for (const params of requests) {
      expect(params.model).toBe('claude-sonnet-5-5');
      expect(params.thinking).toEqual({ type: 'between_tools' });
      expect(params.output_config.effort).toBe('low');
    }
  });
});

describe('the prompt rules from the Italian review and the plural nouns, in the files the system prompt reads', () => {
  const general = loadGeneralPrompt({ promptsDir: PROMPTS });
  const languages = loadLanguagePrompts({ promptsDir: PROMPTS, targets: TARGETS });

  it('the general prompt writes an error message as the original English first, then its translation, in every language', () => {
    expect(general).toContain('is written as the original English message first, then its translation in parentheses, in every language');
  });

  it('the Italian prompt renders Top-level type as "Tipo di primo livello"', () => {
    expect(languages.it).toContain('- `Top-level type`, the line that opens the properties of a generated schema page, is "Tipo di primo livello".');
  });

  for (const lang of TARGETS) {
    it(`the ${lang} prompt makes a kept term’s singular and plural two distinct terms, written as the source writes them`, () => {
      expect(languages[lang]).toContain("- A kept term's singular and plural are two distinct terms: `Component` and `Components`");
      expect(languages[lang]).toContain('Write the form the source writes');
    });
  }
});
