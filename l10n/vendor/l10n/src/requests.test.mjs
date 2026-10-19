import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  GENERAL_PROMPT_FILE,
  HEADING_CONTEXT,
  OUTPUT_SCHEMA,
  SYSTEM_CACHE_CONTROL,
  buildMessageParams,
  buildSystem,
  buildUserMessage,
  loadGeneralPrompt,
  loadLanguagePrompts,
  pagesFromCatalog,
  planRequests,
} from './requests.mjs';
import { MIN_OUTPUT_TOKENS, PER_ID_OUTPUT_TOKENS, REASONING_OUTPUT_TOKENS } from './tokens.mjs';
import { generalRules, glossaryRules } from './translator-prompt.mjs';
import { computeWorklist } from './gate.mjs';
import { ConfigError, loadConfig, translationSettings } from './config.mjs';
import { createEngine } from './engine.mjs';
import { createJsonContentAdapter } from './adapters/json-content/index.mjs';
import { createMarkdownAdapter } from './adapters/markdown/index.mjs';
import { keyOf } from './normalize.mjs';
import { copyFixtureProject, copyMarkdownFixture } from '../test/helpers.mjs';

const GLOSSARY = { target_lang_names: { en: 'English' }, do_not_translate: ['Cognitio'], glossary: { en: { Contatti: 'Contact' } } };
const PROMPT = '# English\n\nUse a neutral register.\n';
const GENERAL = '# The corpus\n\nEngineers read these pages. Keep every YAML key as written.\n';
const MODEL = { id: 'claude-opus-5-5', effort: 'low' };

/** A catalogue and a lookup view over the given sources, `translated` holding the ones the memory carries. */
function memoryOf(sources, translated = {}) {
  const units = {};
  for (const s of sources) units[keyOf(s)] = { source: s, format: 'text', usages: [] };
  const tm = {};
  for (const [s, text] of Object.entries(translated)) tm[keyOf(s)] = { text, status: 'seed', srcHash: keyOf(s) };
  const catalog = { source_lang: 'it', units };
  return { catalog, tmByLang: { en: tm }, worklist: computeWorklist(catalog, { targets: ['en'], tmByLang: { en: tm } }) };
}

/** A page from a list of sources, each in the section `section`, or in a section per segment when `section` is a function. */
function pageOf(id, sources, section = () => 'main') {
  return { id, segments: sources.map((s, i) => ({ key: keyOf(s), source: s, format: 'text', section: section(s, i) })) };
}

const plan = (pages, memory, extra = {}) =>
  planRequests({ pages, worklist: memory.worklist, tmByLang: memory.tmByLang, targets: ['en'], sectionTokens: 8000, attemptLimit: 3, ...extra });

/** The user message's two JSON parts, the page and what the request asks for, read as one object. */
const bodyOf = (spec) => Object.assign({}, ...buildUserMessage(spec).map((block) => JSON.parse(block.text)));

describe('one request translates one page: the three parts', () => {
  it('carries the page’s segments in order with their identifiers, the other segments’ translations as fixed context, and only the changed identifier to translate', () => {
    const sources = ['Chi siamo', 'Il nostro lavoro è cambiato.', 'Contatti'];
    const memory = memoryOf(sources, { 'Chi siamo': 'About us', Contatti: 'Contact' });
    const { specs } = plan([pageOf('content/it/chi-siamo.json', sources)], memory);
    expect(specs).toHaveLength(1);
    const body = bodyOf(specs[0]);
    // 1. the source segments, in page order, with their identifiers
    expect(body.segments.map((s) => [s.id, s.source])).toEqual(sources.map((s) => [keyOf(s), s]));
    // 2. the existing translations of the other segments, as fixed context — and none on the changed one
    expect(body.segments.map((s) => s.translation)).toEqual(['About us', undefined, 'Contact']);
    // 3. the identifiers to translate: only the changed one
    expect(body.translate).toEqual([keyOf('Il nostro lavoro è cambiato.')]);
    expect(body.page).toBe('content/it/chi-siamo.json');
    expect(body).not.toHaveProperty('section');
  });

  it('reads this package’s JSON-content pages: each content file, then the UI dictionary, in document order', async () => {
    const dir = copyFixtureProject();
    try {
      const project = loadConfig({ configPath: path.join(dir, 'l10n.config.json') });
      const adapter = createJsonContentAdapter({ project });
      await createEngine({ adapter, paths: { baseDir: project.memoryDir } }).extract();
      const pages = adapter.pages();
      expect(pages.map((p) => p.id)).toEqual(['content/it/home.json', 'ui/it.json']);
      expect(pages[0].segments.map((s) => [s.source, s.section])).toEqual([
        ['Benvenuti', 'seo'],
        ['Una pagina di prova', 'seo'],
        ['Ciao mondo', 'blocks[0]'],
        ['Scopri', 'blocks[0]'],
        ['Primo paragrafo.', 'blocks[1]'],
      ]);
      expect(pages[1].segments.map((s) => [s.source, s.section, s.context])).toEqual([
        ['Torna su', 'nav', 'ui:nav.backToTop'],
        ['Menu', 'nav', 'ui:nav.menu'],
      ]);
      // Every page segment is a catalogue unit: the page view and the catalogue share one walk.
      const units = JSON.parse(fs.readFileSync(path.join(project.memoryDir, 'source.json'), 'utf8')).units;
      expect(pages.flatMap((p) => p.segments).every((s) => units[s.key] && units[s.key].source === s.source)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a missing unit is requested once per locale, on the first page that holds it', () => {
  it('appears on a later page with its source, neither requested nor offered as context', () => {
    const memory = memoryOf(['Scopri', 'Prima', 'Seconda'], {});
    const { specs } = plan([pageOf('a.json', ['Prima', 'Scopri']), pageOf('b.json', ['Scopri', 'Seconda'])], memory);
    expect(specs.map((s) => [s.page, s.requested])).toEqual([
      ['a.json', [keyOf('Prima'), keyOf('Scopri')]],
      ['b.json', [keyOf('Seconda')]],
    ]);
    const later = specs[1].segments.find((s) => s.id === keyOf('Scopri'));
    expect(later).toEqual({ id: keyOf('Scopri'), format: 'text', source: 'Scopri' });
  });
});

describe('the section budget', () => {
  const long = (word) => `${`${word} `.repeat(10).trim()}.`;
  const sources = [long('uno'), long('due'), long('tre')];
  const section = (_s, i) => `blocks[${i}]`;

  it('splits a page whose estimated source exceeds it at its top-level sections, each request translating its own section’s segments', () => {
    const memory = memoryOf(sources, {});
    const { specs } = plan([pageOf('p.json', sources, section)], memory, { sectionTokens: 100 });
    expect(specs.map((s) => [s.section, s.requested])).toEqual(sources.map((s, i) => [`blocks[${i}]`, [keyOf(s)]]));
    const body = bodyOf(specs[1]);
    expect(body.section).toBe('blocks[1]');
    expect(body.translate).toEqual([keyOf(sources[1])]);
  });

  it('keeps a page at or under it whole', () => {
    const memory = memoryOf(sources, {});
    const { specs } = plan([pageOf('p.json', sources, section)], memory, { sectionTokens: 1000 });
    expect(specs).toHaveLength(1);
    expect(specs[0].section).toBeNull();
  });
});

describe('the system prompt: general rules, glossary, per-language file, cached for an hour', () => {
  it('is three blocks in that order, the last marked with the one-hour cache duration', () => {
    const system = buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, languagePrompt: PROMPT });
    expect(system).toHaveLength(3);
    expect(system[0].text).toMatch(/^You translate pages from Italian into English\./);
    expect(system[1].text).toContain('"Cognitio"');
    expect(system[1].text).toContain('"Contatti" -> "Contact"');
    expect(system[2].text).toBe(PROMPT);
    expect(system.map((b) => b.cache_control)).toEqual([undefined, undefined, { type: 'ephemeral', ttl: '1h' }]);
  });

  it('is byte-identical across two pages of one locale', () => {
    const memory = memoryOf(['Uno', 'Due'], {});
    const { specs } = plan([pageOf('home.json', ['Uno']), pageOf('contatti.json', ['Due'])], memory);
    expect(specs).toHaveLength(2);
    const paramsFor = (spec) =>
      buildMessageParams(spec, { model: MODEL, system: buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, languagePrompt: PROMPT }) });
    const [a, b] = specs.map(paramsFor);
    expect(JSON.stringify(a.system)).toBe(JSON.stringify(b.system));
    expect(a.messages[0].content).not.toBe(b.messages[0].content);
  });

  it('with a project general prompt is four blocks: the general rules, the glossary, the general prompt, the per-language file, the cache marker still on the last', () => {
    const system = buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, generalPrompt: GENERAL, languagePrompt: PROMPT });
    expect(system.map((b) => b.text)).toEqual([
      generalRules({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY }),
      glossaryRules({ lang: 'en', glossary: GLOSSARY }),
      GENERAL,
      PROMPT,
    ]);
    expect(system.map((b) => b.cache_control)).toEqual([undefined, undefined, undefined, { type: 'ephemeral', ttl: '1h' }]);
  });

  it('carries the general prompt’s text byte-identical across two pages of one locale', () => {
    const memory = memoryOf(['Uno', 'Due'], {});
    const { specs } = plan([pageOf('home.json', ['Uno']), pageOf('contatti.json', ['Due'])], memory);
    expect(specs).toHaveLength(2);
    const paramsFor = (spec) =>
      buildMessageParams(spec, {
        model: MODEL,
        system: buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, generalPrompt: GENERAL, languagePrompt: PROMPT }),
      });
    const [a, b] = specs.map(paramsFor);
    expect(a.system[2].text).toBe(GENERAL);
    expect(Buffer.from(JSON.stringify(a.system)).equals(Buffer.from(JSON.stringify(b.system)))).toBe(true);
    expect(a.messages[0].content).not.toBe(b.messages[0].content);
  });

  it('without a general prompt file is byte-identical to the three-block form', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-prompts-'));
    try {
      fs.writeFileSync(path.join(dir, 'en.md'), PROMPT);
      const generalPrompt = loadGeneralPrompt({ promptsDir: dir });
      expect(generalPrompt).toBeNull();
      const threeBlocks = [
        { type: 'text', text: generalRules({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY }) },
        { type: 'text', text: glossaryRules({ lang: 'en', glossary: GLOSSARY }) },
        { type: 'text', text: PROMPT, cache_control: { ...SYSTEM_CACHE_CONTROL } },
      ];
      const system = buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, generalPrompt, languagePrompt: PROMPT });
      expect(JSON.stringify(system)).toBe(JSON.stringify(threeBlocks));
      expect(JSON.stringify(buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, languagePrompt: PROMPT }))).toBe(JSON.stringify(threeBlocks));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads the general prompt file when present, and refuses an empty one naming the file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-prompts-'));
    const file = path.join(dir, GENERAL_PROMPT_FILE);
    try {
      expect(GENERAL_PROMPT_FILE).toBe('_general.md');
      fs.writeFileSync(file, GENERAL);
      expect(loadGeneralPrompt({ promptsDir: dir })).toBe(GENERAL);
      fs.writeFileSync(file, ' \n\n');
      expect(() => loadGeneralPrompt({ promptsDir: dir })).toThrow(ConfigError);
      expect(() => loadGeneralPrompt({ promptsDir: dir })).toThrow(`${file}: the general prompt file is empty`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('needs the per-language file: a missing or empty one is a configuration defect naming the file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-prompts-'));
    try {
      expect(() => loadLanguagePrompts({ promptsDir: dir, targets: ['en'] })).toThrow(ConfigError);
      expect(() => loadLanguagePrompts({ promptsDir: dir, targets: ['en'] })).toThrow(`${path.join(dir, 'en.md')}: the per-language prompt file for "en" is missing`);
      fs.writeFileSync(path.join(dir, 'en.md'), '  \n');
      expect(() => loadLanguagePrompts({ promptsDir: dir, targets: ['en'] })).toThrow(`${path.join(dir, 'en.md')}: the per-language prompt file for "en" is empty.`);
      fs.writeFileSync(path.join(dir, 'en.md'), PROMPT);
      expect(loadLanguagePrompts({ promptsDir: dir, targets: ['en'] })).toEqual({ en: PROMPT });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the do-not-translate case mode in the system prompt', () => {
  it('under the default mode, no key and an explicit "insensitive" give the same system prompt, byte for byte, with rule 1’s sentence unchanged', () => {
    const none = buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, languagePrompt: PROMPT });
    const explicit = buildSystem({ lang: 'en', sourceLang: 'it', glossary: { ...GLOSSARY, do_not_translate_case: 'insensitive' }, languagePrompt: PROMPT });
    expect(Buffer.from(JSON.stringify(explicit)).equals(Buffer.from(JSON.stringify(none)))).toBe(true);
    expect(none[0].text).toContain(
      'Match them CASE-INSENSITIVELY, but PRESERVE THE CASING OF THE OCCURRENCE exactly as it appears in the source (do not upper-case or lower-case them).'
    );
  });

  it('under the sensitive mode, rule 1 states it and the glossary block is unchanged', () => {
    const sensitive = buildSystem({ lang: 'en', sourceLang: 'it', glossary: { ...GLOSSARY, do_not_translate_case: 'sensitive' }, languagePrompt: PROMPT });
    const none = buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, languagePrompt: PROMPT });
    expect(sensitive[0].text).toContain('Match them CASE-SENSITIVELY');
    expect(sensitive[0].text).not.toContain('CASE-INSENSITIVELY');
    expect(sensitive[1].text).toBe(none[1].text);
  });
});

describe('bounded context: a split page’s request is given its section, its neighbours and the page’s outline', () => {
  // A page of five sections: the text before the first heading, then four headed sections, the first with a
  // second heading of its own. Each body segment is long enough that the page exceeds the section budget.
  const body = (n) => `Il paragrafo numero ${n} della guida, scritto per superare il budget della sua sezione.`;
  const PREAMBLE = '(before the first heading)';
  const sections = [
    { section: PREAMBLE, segments: [{ source: body('zero') }] },
    { section: '#uno', segments: [{ source: 'Uno', heading: true }, { source: body('uno') }, { source: 'Dettagli', heading: true }, { source: body('uno bis') }] },
    { section: '#due', segments: [{ source: 'Due', heading: true }, { source: body('due') }] },
    { section: '#tre', segments: [{ source: 'Tre', heading: true }, { source: body('tre') }] },
    { section: '#quattro', segments: [{ source: 'Quattro', heading: true }, { source: body('quattro') }] },
  ];
  const page = {
    id: 'docs/guida.md',
    segments: sections.flatMap(({ section, segments }) =>
      segments.map((s) => ({ key: keyOf(s.source), source: s.source, format: 'markdown', protected: [], context: s.heading ? HEADING_CONTEXT : 'paragraph', section }))
    ),
  };
  const OUTLINE = [
    { section: PREAMBLE },
    { section: '#uno', headings: ['Uno', 'Dettagli'] },
    { section: '#due', headings: ['Due'] },
    { section: '#tre', headings: ['Tre'] },
    { section: '#quattro', headings: ['Quattro'] },
  ];
  const fresh = () => {
    const units = Object.fromEntries(page.segments.map((s) => [s.key, { source: s.source, format: 'markdown', protected: [], usages: [] }]));
    const catalog = { source_lang: 'it', units };
    const tmByLang = { en: {} };
    return { catalog, tmByLang, worklist: computeWorklist(catalog, { targets: ['en'], tmByLang }) };
  };

  it('for every request of a page split into five sections: the outline, its neighbouring sections’ text, and no other section’s text', () => {
    // The largest section, #uno, is under 200 estimated tokens and the page above it: the page splits, no section is divided.
    const { specs } = plan([page], fresh(), { sectionTokens: 200 });
    expect(specs.map((s) => s.section)).toEqual(sections.map((s) => s.section));
    specs.forEach((spec, index) => {
      const sent = bodyOf(spec);
      const bytes = buildUserMessage(spec).map((block) => block.text).join('\n');
      expect(sent.outline).toEqual(OUTLINE);
      // Its own section and the sections immediately before and after it, in page order, and nothing else.
      const given = sections.slice(Math.max(0, index - 1), index + 2);
      expect(sent.segments.map((s) => s.source)).toEqual(given.flatMap((g) => g.segments.map((s) => s.source)));
      for (const neighbour of given) for (const s of neighbour.segments) expect(bytes).toContain(JSON.stringify(s.source));
      const others = sections.filter((_, i) => Math.abs(i - index) > 1);
      expect(others.length).toBeGreaterThanOrEqual(2);
      for (const other of others) {
        for (const s of other.segments) {
          expect(sent.segments.map((x) => x.id)).not.toContain(keyOf(s.source));
          // A heading's text is in the outline alone; every other text of the section is nowhere in the request.
          if (!s.heading) expect(bytes).not.toContain(s.source);
        }
      }
      expect(sent.section).toBe(sections[index].section);
      expect(sent.translate).toEqual(sections[index].segments.map((s) => keyOf(s.source)));
    });
  });

  it('keeps a page within the section budget one request carrying the whole page, with no outline', () => {
    const { specs } = plan([page], fresh(), { sectionTokens: 100000 });
    expect(specs).toHaveLength(1);
    const sent = bodyOf(specs[0]);
    expect(specs[0].section).toBeNull();
    expect(sent).not.toHaveProperty('section');
    expect(sent).not.toHaveProperty('outline');
    expect(Object.keys(JSON.parse(buildUserMessage(specs[0])[0].text))).toEqual(['page', 'segments']);
    expect(sent.segments.map((s) => s.source)).toEqual(page.segments.map((s) => s.source));
    expect(sent.translate).toEqual(page.segments.map((s) => s.key));
  });

  it('gives a page whose view carries no heading an outline of its section labels, in order', () => {
    const sources = ['Primo blocco, abbastanza lungo per la sua sezione.', 'Secondo blocco, anch’esso abbastanza lungo.', 'Terzo blocco, per chiudere la pagina.'];
    const { specs } = plan([pageOf('content/it/home.json', sources, (_s, i) => `blocks[${i}]`)], memoryOf(sources, {}), { sectionTokens: 20 });
    expect(specs.map((spec) => spec.outline)).toEqual(Array(3).fill([{ section: 'blocks[0]' }, { section: 'blocks[1]' }, { section: 'blocks[2]' }]));
  });

  it('reads the outline from the Markdown adapter’s page view: every heading as the source writes it, under its section', async () => {
    const dir = copyMarkdownFixture();
    try {
      const project = loadConfig({ configPath: path.join(dir, 'l10n.config.json') });
      const adapter = createMarkdownAdapter({ project });
      const engine = createEngine({ adapter, paths: { baseDir: project.memoryDir } });
      const { catalog } = await engine.extract();
      const headingsPage = adapter.pages().find((p) => p.id === 'guide/headings.md');
      const tmByLang = { it: {} };
      const worklist = computeWorklist(catalog, { targets: ['it'], tmByLang });
      const labels = [...new Set(headingsPage.segments.map((s) => s.section))];
      // The largest section's size: the page splits into its sections and none is divided further.
      const largest = Math.max(...labels.map((label) => headingsPage.segments.filter((s) => s.section === label).reduce((n, s) => n + Buffer.byteLength(s.source, 'utf8'), 0)));
      const { specs } = planRequests({ pages: [headingsPage], worklist, tmByLang, targets: ['it'], sectionTokens: largest, attemptLimit: 3 });
      expect(specs[0].outline.map((entry) => entry.section)).toEqual(labels);
      expect(specs[0].outline.map((entry) => entry.headings)).toEqual([
        ['Headings'],
        ['Overview'],
        ['Overview'],
        ['Install <img src="logo.png" alt="logo"> the tool ![badge](badge.svg)'],
        ['The `_x_` option'],
        ['Ends with code `run`'],
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a resubmission’s context: the bounded context of a first request, with no translation in it', () => {
  const sources = ['Primo blocco, abbastanza lungo.', 'Secondo blocco, abbastanza lungo.', 'Terzo blocco, abbastanza lungo.', 'Quarto blocco, abbastanza lungo.'];
  const page = pageOf('content/it/home.json', sources, (_s, i) => `blocks[${i}]`);

  it('a first request carries the existing translations of the segments it does not request; a resubmission of the same section carries none', () => {
    const [first, second, third] = sources;
    const memory = memoryOf(sources, { [first]: 'First block', [third]: 'Third block' });
    const firstPlan = plan([page], memory, { sectionTokens: 10 });
    const own = firstPlan.specs.find((spec) => spec.section === 'blocks[1]');
    expect(own.attempt).toBe(1);
    expect(bodyOf(own).segments.map((s) => [s.source, s.translation])).toEqual([[first, 'First block'], [second, undefined], [third, 'Third block']]);

    const queue = { en: { [keyOf(second)]: { attempts: 1, defect: 'the translation is empty' } } };
    const resubmission = plan([page], memory, { sectionTokens: 10, queue }).specs.find((spec) => spec.section === 'blocks[1]');
    expect(resubmission.attempt).toBe(2);
    expect(bodyOf(resubmission).segments.map((s) => [s.source, s.translation])).toEqual([[first, undefined], [second, undefined], [third, undefined]]);
    expect(bodyOf(resubmission).outline).toEqual(bodyOf(own).outline);
  });
});

describe('one cache marker per request, on the last system block', () => {
  const S1 = 'Primo paragrafo, abbastanza lungo da superare il budget di una sezione.';
  const S2 = 'Esegui `npm ci` prima di ogni altro passo della procedura.';
  const S3 = 'Terzo paragrafo, anch’esso abbastanza lungo per la sua sezione.';
  const page = {
    id: 'docs/guida.md',
    segments: [
      { key: keyOf(S1), source: S1, format: 'markdown', protected: [], section: '#a' },
      { key: keyOf(S2), source: S2, format: 'markdown', protected: [[7, 15]], section: '#b' },
      { key: keyOf(S3), source: S3, format: 'markdown', protected: [], section: '#c' },
    ],
  };
  const units = Object.fromEntries(page.segments.map((s) => [s.key, { source: s.source, format: 'markdown', protected: s.protected, usages: [] }]));
  const catalog = { source_lang: 'it', units };
  const tmByLang = { en: {} };
  const worklist = computeWorklist(catalog, { targets: ['en'], tmByLang });

  const rows = [
    { scenario: 'without a general prompt file', generalPrompt: null, blocks: 3 },
    { scenario: 'with a general prompt file', generalPrompt: GENERAL, blocks: 4 },
  ];
  for (const row of rows) {
    it(`a split page’s requests each carry exactly one cache_control, on the last system block, and none in the user message — ${row.scenario}`, () => {
      const system = buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, generalPrompt: row.generalPrompt, languagePrompt: PROMPT });
      const { specs } = planRequests({ pages: [page], worklist, tmByLang, targets: ['en'], sectionTokens: 50, attemptLimit: 3 });
      expect(specs.map((s) => s.section)).toEqual(['#a', '#b', '#c']);
      for (const spec of specs) {
        const params = buildMessageParams(spec, { model: MODEL, system });
        const marked = [
          ...params.system.map((block, index) => ({ where: `system[${index}]`, block })),
          ...params.messages[0].content.map((block, index) => ({ where: `messages[0].content[${index}]`, block })),
        ].filter(({ block }) => 'cache_control' in block);
        expect(marked.map(({ where }) => where)).toEqual([`system[${row.blocks - 1}]`]);
        expect(marked[0].block.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
        expect(params.messages[0].content).toHaveLength(2);
      }
    });
  }
});

describe('structured output and the reasoning settings', () => {
  const memory = memoryOf(['Uno'], {});
  const [spec] = plan([pageOf('p.json', ['Uno'])], memory).specs;
  const system = buildSystem({ lang: 'en', sourceLang: 'it', glossary: GLOSSARY, languagePrompt: PROMPT });

  it('requests the one fixed schema through output_config.format', () => {
    const params = buildMessageParams(spec, { model: MODEL, system });
    expect(params.output_config.format).toEqual({ type: 'json_schema', schema: OUTPUT_SCHEMA });
    const objects = [];
    (function walk(node) {
      if (node && typeof node === 'object') {
        if (node.type === 'object') objects.push(node);
        for (const value of Object.values(node)) walk(value);
      }
    })(OUTPUT_SCHEMA);
    expect(objects).toHaveLength(2);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties));
    }
  });

  const settingsRows = [
    { scenario: 'Claude Opus 5.5: thinking omitted, effort low', model: { id: 'claude-opus-5-5', effort: 'low' }, thinking: undefined, effort: 'low' },
    { scenario: 'Claude Sonnet 5.5: between_tools', model: { id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' } }, thinking: { type: 'between_tools' }, effort: undefined },
    { scenario: 'Claude Haiku 5.5: disabled', model: { id: 'claude-haiku-5-5', thinking: { type: 'disabled' }, effort: 'high' }, thinking: { type: 'disabled' }, effort: 'high' },
    { scenario: 'a bare model id: neither field is sent', model: 'claude-opus-5-5', thinking: undefined, effort: undefined },
  ];
  for (const row of settingsRows) {
    it(`passes the configuration’s thinking and effort through unchanged — ${row.scenario}`, () => {
      const settings = translationSettings({ kind: 'anthropic', model: row.model });
      const params = buildMessageParams(spec, { model: settings.model, system });
      expect(params.thinking).toEqual(row.thinking);
      expect('thinking' in params).toBe(row.thinking !== undefined);
      expect(params.output_config.effort).toEqual(row.effort);
      expect(params.model).toBe(typeof row.model === 'string' ? row.model : row.model.id);
    });
  }

  it('uses the fallback model for a refusal’s resubmission, and the primary otherwise', () => {
    const model = { id: 'claude-opus-5-5', fallbackId: 'claude-opus-4-8' };
    expect(buildMessageParams({ ...spec, fallback: true }, { model, system }).model).toBe('claude-opus-4-8');
    expect(buildMessageParams(spec, { model, system }).model).toBe('claude-opus-5-5');
  });

  // The grid of a refusal's resubmission (spec.fallback) by a configured fallback
  // (model.fallbackId): only the cell holding both runs on the fallback model.
  const SONNET = { id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, effort: 'low' };
  const fallbackRows = [
    {
      scenario: 'a refusal’s resubmission with a fallback configured: the fallback id, the effort, no thinking',
      model: { ...SONNET, fallbackId: 'claude-opus-5-5' }, fallback: true,
      id: 'claude-opus-5-5', thinking: undefined, effort: 'low',
    },
    {
      scenario: 'the same model on a first request: the primary id, its thinking and the effort',
      model: { ...SONNET, fallbackId: 'claude-opus-5-5' }, fallback: false,
      id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, effort: 'low',
    },
    {
      scenario: 'a refusal’s resubmission with no fallback configured: the primary id, its thinking and the effort',
      model: SONNET, fallback: true,
      id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, effort: 'low',
    },
    {
      scenario: 'a first request with no fallback configured: the primary id, its thinking and the effort',
      model: SONNET, fallback: false,
      id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, effort: 'low',
    },
  ];
  for (const row of fallbackRows) {
    it(`sends the thinking setting to the primary model only, and the effort to both — ${row.scenario}`, () => {
      const settings = translationSettings({ kind: 'anthropic', model: row.model });
      const params = buildMessageParams({ ...spec, fallback: row.fallback }, { model: settings.model, system });
      expect(params.model).toBe(row.id);
      expect(params.output_config.effort).toBe(row.effort);
      expect('thinking' in params).toBe(row.thinking !== undefined);
      expect(params.thinking).toEqual(row.thinking);
    });
  }

  // The output ceiling of one fixture request, built for each model at effort low: the requested source's
  // estimate and the per-identifier allowance, raised to the floor, plus the reasoning allowance only where the
  // request can reason.
  const BASE = Math.max(MIN_OUTPUT_TOKENS, Buffer.byteLength('Uno', 'utf8') + PER_ID_OUTPUT_TOKENS);
  const ceilingRows = [
    { scenario: 'Claude Haiku 5.5, thinking disabled: no allowance', model: { id: 'claude-haiku-5-5', thinking: { type: 'disabled' }, effort: 'low' }, fallback: false, sent: 'claude-haiku-5-5', maxTokens: BASE },
    { scenario: 'Claude Sonnet 5.5, between_tools: no allowance', model: { id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, effort: 'low' }, fallback: false, sent: 'claude-sonnet-5-5', maxTokens: BASE },
    { scenario: 'Claude Opus 5.5, thinking omitted: the allowance', model: { id: 'claude-opus-5-5', effort: 'low' }, fallback: false, sent: 'claude-opus-5-5', maxTokens: BASE + REASONING_OUTPUT_TOKENS },
    {
      scenario: 'a refusal’s resubmission on Claude Opus 5.5 as the fallback of Claude Sonnet 5.5, sent without thinking: the allowance',
      model: { id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, effort: 'low', fallbackId: 'claude-opus-5-5' }, fallback: true, sent: 'claude-opus-5-5', maxTokens: BASE + REASONING_OUTPUT_TOKENS,
    },
    {
      scenario: 'a refusal’s resubmission on Claude Opus 5.5 as the fallback of Claude Haiku 5.5, sent without thinking: the allowance',
      model: { id: 'claude-haiku-5-5', thinking: { type: 'disabled' }, effort: 'low', fallbackId: 'claude-opus-5-5' }, fallback: true, sent: 'claude-opus-5-5', maxTokens: BASE + REASONING_OUTPUT_TOKENS,
    },
  ];
  for (const row of ceilingRows) {
    it(`reserves the reasoning allowance in max_tokens only on a request that can reason — ${row.scenario}`, () => {
      const settings = translationSettings({ kind: 'anthropic', model: row.model });
      const params = buildMessageParams({ ...spec, fallback: row.fallback }, { model: settings.model, system });
      expect(params.model).toBe(row.sent);
      expect(params.output_config.effort).toBe('low');
      expect(params.max_tokens).toBe(row.maxTokens);
    });
  }

  it('builds the Claude Opus 5.5 request larger by exactly the allowance than the Claude Haiku 5.5 and Claude Sonnet 5.5 ones', () => {
    const ceiling = (model) => buildMessageParams(spec, { model: translationSettings({ kind: 'anthropic', model }).model, system }).max_tokens;
    const haiku = ceiling({ id: 'claude-haiku-5-5', thinking: { type: 'disabled' }, effort: 'low' });
    const sonnet = ceiling({ id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, effort: 'low' });
    const opus = ceiling({ id: 'claude-opus-5-5', effort: 'low' });
    expect(sonnet).toBe(haiku);
    expect(opus - haiku).toBe(REASONING_OUTPUT_TOKENS);
  });
});

describe('pagesFromCatalog — the pages of an adapter with no pages() view', () => {
  it('gives one page per usage file and no page to a unit without a usage', () => {
    const catalog = {
      source_lang: 'it',
      units: {
        [keyOf('Uno')]: { source: 'Uno', format: 'text', usages: [{ file: 'a.json', path: 'x' }] },
        [keyOf('Due')]: { source: 'Due', format: 'text', usages: [{ file: 'b.json', path: 'x' }, { file: 'a.json', path: 'y' }] },
        [keyOf('Tre')]: { source: 'Tre', format: 'text', usages: [] },
      },
    };
    const pages = pagesFromCatalog(catalog);
    expect(pages.map((p) => [p.id, p.segments.map((s) => s.source).sort()]).sort()).toEqual([
      ['a.json', ['Due', 'Uno']],
      ['b.json', ['Due']],
    ]);
  });
});

describe('a defect of the whole reply is stated once per request', () => {
  const sources = Array.from({ length: 40 }, (_, i) => `Frase numero ${i} della pagina.`);
  const page = pageOf('content/it/home.json', sources);
  const memory = memoryOf(sources);
  const WHOLE = 'the reply was cut off at max_tokens before its JSON ended';

  it('a resubmission of forty segments queued with one whole-reply defect carries it once, in replyCorrections, and no per-segment correction', () => {
    const queue = { en: Object.fromEntries(sources.map((s) => [keyOf(s), { attempts: 1, defect: WHOLE, whole: true }])) };
    const [spec] = plan([page], memory, { queue }).specs;
    const sent = bodyOf(spec);
    expect(sent.translate).toHaveLength(40);
    expect(sent.replyCorrections).toEqual([WHOLE]);
    expect(sent).not.toHaveProperty('corrections');
    expect(buildUserMessage(spec)[1].text.split(WHOLE)).toHaveLength(2);
  });

  it('carries a segment’s own defect in corrections and each distinct whole-reply defect once in replyCorrections', () => {
    const [a, b, c] = sources.map(keyOf);
    const queue = {
      en: {
        [a]: { attempts: 1, defect: WHOLE, whole: true },
        [b]: { attempts: 1, defect: 'the request was expired', whole: true },
        [c]: { attempts: 1, defect: 'the translation is empty' },
      },
    };
    const sent = bodyOf(plan([page], memory, { queue }).specs[0]);
    expect(sent.replyCorrections).toEqual([WHOLE, 'the request was expired']);
    expect(sent.corrections).toEqual({ [c]: 'the translation is empty' });
  });

  it('states the new field in the general rules', () => {
    expect(generalRules({ lang: 'en', sourceLang: 'it' })).toContain('"replyCorrections"?: string[]');
  });
});

describe('a section above the section budget is divided further', () => {
  const para = (n) => `Paragrafo ${n}: ${'testo '.repeat(10)}`.trim();
  const seg = (source, section, heading = false) => ({ key: keyOf(source), source, format: 'markdown', protected: [], context: heading ? HEADING_CONTEXT : 'paragraph', section });
  const freshOf = (page) => {
    const units = Object.fromEntries(page.segments.map((s) => [s.key, { source: s.source, format: 'markdown', protected: [], usages: [] }]));
    const catalog = { source_lang: 'it', units };
    return { catalog, tmByLang: { en: {} }, worklist: computeWorklist(catalog, { targets: ['en'], tmByLang: { en: {} } }) };
  };
  const size = (segments) => segments.reduce((n, s) => n + Buffer.byteLength(s.source, 'utf8'), 0);

  it('divides a section at its own sub-headings, packing the parts up to the budget, each a section of its own with the parts beside it as context', () => {
    const big = [seg('Grande', '#grande', true), seg(para(1), '#grande'), seg('Primo', '#grande', true), seg(para(2), '#grande'), seg('Secondo', '#grande', true), seg(para(3), '#grande')];
    const page = { id: 'docs/a.md', segments: [seg('Piccola', '#piccola', true), seg(para(0), '#piccola'), ...big] };
    const budget = size(big.slice(0, 2)) + 1;
    const { specs } = plan([page], freshOf(page), { sectionTokens: budget });
    expect(specs.map((s) => s.section)).toEqual(['#piccola', '#grande (part 1 of 3)', '#grande (part 2 of 3)', '#grande (part 3 of 3)']);
    expect(specs.map((s) => s.requested.length)).toEqual([2, 2, 2, 2]);
    expect(bodyOf(specs[2]).outline.map((o) => o.section)).toEqual(['#piccola', ...specs.slice(1).map((s) => s.section)]);
    expect(bodyOf(specs[2]).segments.map((s) => s.source)).toEqual([...big.slice(0, 6)].map((s) => s.source));
    for (const spec of specs) expect(size(spec.items)).toBeLessThanOrEqual(budget);
  });

  it('gives a divided page’s request every top-level section by its first heading only, and the parts of its own section with all their headings', () => {
    const big = [seg('Grande', '#grande', true), seg(para(1), '#grande'), seg('Primo', '#grande', true), seg(para(2), '#grande'), seg('Secondo', '#grande', true), seg(para(3), '#grande')];
    const small = [seg('Piccola', '#piccola', true), seg(para(0), '#piccola'), seg('Dettaglio', '#piccola', true), seg('Breve.', '#piccola')];
    const page = { id: 'docs/e.md', segments: [...small, ...big] };
    const budget = Math.max(size(small), size(big.slice(0, 2))) + 1;
    const { specs } = plan([page], freshOf(page), { sectionTokens: budget });
    expect(specs.map((s) => s.section)).toEqual(['#piccola', '#grande (part 1 of 3)', '#grande (part 2 of 3)', '#grande (part 3 of 3)']);
    // The request of the undivided section: its own section in full, the divided one by its first heading.
    expect(bodyOf(specs[0]).outline).toEqual([{ section: '#piccola', headings: ['Piccola', 'Dettaglio'] }, { section: '#grande', headings: ['Grande'] }]);
    // A part's request: the other top-level section by its first heading, its own section's parts in full.
    const partOutline = [
      { section: '#piccola', headings: ['Piccola'] },
      { section: '#grande (part 1 of 3)', headings: ['Grande'] },
      { section: '#grande (part 2 of 3)', headings: ['Primo'] },
      { section: '#grande (part 3 of 3)', headings: ['Secondo'] },
    ];
    for (const spec of specs.slice(1)) expect(bodyOf(spec).outline).toEqual(partOutline);
  });

  it('keeps the whole outline on every request of a page none of whose sections is divided', () => {
    const page = { id: 'docs/f.md', segments: [seg('Uno', '#uno', true), seg(para(1), '#uno'), seg('Sotto', '#uno', true), seg('Breve.', '#uno'), seg('Due', '#due', true), seg(para(2), '#due')] };
    const budget = size(page.segments.slice(0, 4));
    const whole = [{ section: '#uno', headings: ['Uno', 'Sotto'] }, { section: '#due', headings: ['Due'] }];
    const { specs } = plan([page], freshOf(page), { sectionTokens: budget });
    expect(specs.map((s) => s.section)).toEqual(['#uno', '#due']);
    for (const spec of specs) expect(bodyOf(spec).outline).toEqual(whole);
  });

  it('divides a part with no heading into runs of consecutive segments up to the budget', () => {
    const segments = [seg('Lunga', '#lunga', true), ...[1, 2, 3, 4].map((n) => seg(para(n), '#lunga'))];
    const page = { id: 'docs/b.md', segments: [seg(para(0), '(before the first heading)'), ...segments] };
    const budget = size(segments.slice(1, 3));
    const { specs } = plan([page], freshOf(page), { sectionTokens: budget });
    const parts = specs.filter((s) => s.section.startsWith('#lunga'));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((s) => s.requested)).toEqual(segments.map((s) => s.key));
    for (const spec of parts) expect(size(spec.items)).toBeLessThanOrEqual(budget);
  });

  it('keeps a single segment above the budget as one request of its own', () => {
    const huge = seg('x'.repeat(500), '#enorme');
    const page = { id: 'docs/c.md', segments: [seg('Enorme', '#enorme', true), huge, seg(para(9), '#enorme')] };
    const { specs } = plan([page], freshOf(page), { sectionTokens: 100 });
    expect(specs.find((s) => s.requested.includes(huge.key)).requested).toEqual([huge.key]);
  });

  it('leaves a section within the budget, and a page within it, as they are', () => {
    const page = { id: 'docs/d.md', segments: [seg('Uno', '#uno', true), seg(para(1), '#uno'), seg('Due', '#due', true), seg(para(2), '#due')] };
    const whole = size(page.segments);
    expect(plan([page], freshOf(page), { sectionTokens: whole }).specs.map((s) => s.section)).toEqual([null]);
    const bySection = plan([page], freshOf(page), { sectionTokens: whole - 1 }).specs.map((s) => s.section);
    expect(bySection).toEqual(['#uno', '#due']);
  });
});
