import '../../../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createJsonContentAdapter } from './index.mjs';
import { createFieldRules } from './fields.mjs';
import { createOutputPlan, fileNameOfPath, targetPath } from './generate.mjs';
import { ConfigError, loadConfig, parseConfig } from '../../config.mjs';
import { createStore } from '../../store.mjs';
import { keyOf } from '../../normalize.mjs';
import { LAYER } from '../../types.mjs';
import { copyFixtureProject, fixtureConfig, writeJson } from '../../../test/helpers.mjs';

/** The smallest rule set. */
const BASE = {
  denylistKeys: [],
  pageFields: { seo: ['title'] },
  valueGuards: { refPrefixes: ['/'], assetExtensions: [], excludeNumbers: true, excludeBooleans: true },
};
const rulesOf = (patch = {}, document) => createFieldRules({ ...BASE, ...patch }, document);
const leaves = (rules, page) => rules.translatableLeaves(page).map((l) => `${l.path}=${l.value}`);

describe('document.walk — a file walked as blocks, whole, or by its shape', () => {
  const blockPage = { path: '/a/', seo: { title: 'Titolo' }, intro: 'Fuori dai blocchi', blocks: [{ name: 'B', data: { t: 'Dentro' } }] };
  const collection = { tipo: 'collezione', titolo: 'Raccolta', articoli: [{ titolo: 'Primo' }, { titolo: 'Secondo', path: '/x/' }] };

  it('walks only the page fields and block data by default, as 1.0.0 did', () => {
    const rules = rulesOf();
    expect(leaves(rules, blockPage)).toEqual(['seo.title=Titolo', 'blocks[0].data.t=Dentro']);
    expect(leaves(rules, collection)).toEqual([]);
  });

  it('walks every key of a file walked whole, with paths relative to the file', () => {
    const rules = rulesOf({ denylistKeys: ['tipo'] }, { walk: 'whole' });
    expect(leaves(rules, collection)).toEqual(['titolo=Raccolta', 'articoli[0].titolo=Primo', 'articoli[1].titolo=Secondo']);
    // A block page walked whole is walked like any other document: its blocks' names too.
    expect(leaves(rules, blockPage)).toContain('intro=Fuori dai blocchi');
  });

  it('walks a file holding blocks as blocks and any other file whole under "auto"', () => {
    const rules = rulesOf({ denylistKeys: ['tipo'] }, { walk: 'auto' });
    expect(leaves(rules, blockPage)).toEqual(['seo.title=Titolo', 'blocks[0].data.t=Dentro']);
    expect(leaves(rules, collection)).toEqual(['titolo=Raccolta', 'articoli[0].titolo=Primo', 'articoli[1].titolo=Secondo']);
  });

  it('names a whole document’s context by its contextKey value, else "document"', () => {
    const named = rulesOf({ denylistKeys: ['tipo'] }, { walk: 'whole', contextKey: 'tipo' }).translatableLeaves(collection);
    expect(named.map((l) => l.context)).toEqual(['collezione:titolo', 'collezione:titolo', 'collezione:titolo']);
    const unnamed = rulesOf({}, { walk: 'whole', contextKey: 'kind' }).translatableLeaves({ a: 'Testo' });
    expect(unnamed[0].context).toBe('document:a');
  });
});

describe('the value-type rules', () => {
  it('denylistKeyPatterns drops every matching key’s subtree at any depth, case-insensitively', () => {
    const rules = rulesOf({ denylistKeyPatterns: ['_*', 'tmp?'] }, { walk: 'whole' });
    const doc = { _nota: 'x', titolo: 'Sì', voci: [{ _mock: { t: 'y' }, TMP1: 'z', tmp12: 'Resta' }] };
    expect(leaves(rules, doc)).toEqual(['titolo=Sì', 'voci[0].tmp12=Resta']);
    expect(rules.isDenylistedKey('_qualunque')).toBe(true);
  });

  it('identifierStrings "list" skips the strings of a list under the key, and keeps its objects and its own string', () => {
    const rules = rulesOf({ identifierStrings: [{ keys: ['Prodotti'], where: 'list' }] }, { walk: 'whole' });
    const doc = { prodotti: ['64641', { nome: 'Vernice' }], etichette: { prodotti: 'Prodotti' } };
    expect(leaves(rules, doc)).toEqual(['prodotti[1].nome=Vernice', 'etichette.prodotti=Prodotti']);
  });

  it('identifierStrings "value" skips the key’s own string and walks an object under it', () => {
    const rules = rulesOf({ identifierStrings: [{ keys: ['fase'], where: 'value' }] }, { walk: 'whole' });
    const doc = { a: { fase: 'finitura' }, fase: { titolo: 'La finitura' }, b: { fase: ['Uno'] } };
    expect(leaves(rules, doc)).toEqual(['fase.titolo=La finitura', 'b.fase[0]=Uno']);
  });

  it('identifierStrings "any" skips both', () => {
    const rules = rulesOf({ identifierStrings: [{ keys: ['usi'], where: 'any' }] }, { walk: 'whole' });
    expect(leaves(rules, { usi: ['Interni'], x: { usi: 'Esterni' }, y: { usi: [{ t: 'Testo' }] } })).toEqual(['y.usi[0].t=Testo']);
  });

  it('skipInParent skips a key inside the parent its selectors describe, and nowhere else', () => {
    const rules = rulesOf(
      {
        denylistKeys: ['slug'],
        denylistKeyPatterns: ['_*'],
        skipInParent: [{ key: 'categoria', parentHas: ['slug'], parentOnly: ['slug', 'categoria', 'alt'] }],
      },
      { walk: 'whole' }
    );
    const doc = {
      immagine: { slug: 'interni-01', categoria: 'ambienti', alt: 'Un soggiorno', _nota: 'x' },
      articolo: { slug: 'guida', categoria: 'Consigli', titolo: 'Guida' },
      domanda: { categoria: 'Ordini' },
    };
    expect(leaves(rules, doc)).toEqual([
      'immagine.alt=Un soggiorno',
      'articolo.categoria=Consigli',
      'articolo.titolo=Guida',
      'domanda.categoria=Ordini',
    ]);
  });

  it('skipInParent with parentKey selects the parent by the key it sits under, a list element included', () => {
    const rules = rulesOf({ skipInParent: [{ key: 'nome', parentKey: ['colori'] }] }, { walk: 'whole' });
    const doc = { colori: [{ nome: 'RAL 9010', descrizione: 'Bianco' }], prodotto: { nome: 'Vernice' } };
    expect(leaves(rules, doc)).toEqual(['colori[0].descrizione=Bianco', 'prodotto.nome=Vernice']);
  });

  it('the configuration refuses a skipInParent rule with no selector, naming the key', () => {
    const config = fixtureConfig();
    config.adapter.fields.skipInParent = [{ key: 'categoria' }];
    expect(() => parseConfig(config)).toThrow(/adapter\.fields\.skipInParent\.0: names no parent/);
  });
});

describe('the output plan — paths, lang, pairs and file names', () => {
  const langMap = { pairs: [{ it: '/cataloghi/', en: '/catalogues/' }, { it: '/', en: '/home/' }] };

  it('prefixes by default and keeps the source path under "neutral", a pair winning in both', () => {
    expect(targetPath('/servizi/', 'zh-Hant', null, 'it')).toBe('/zh-Hant/servizi/');
    expect(targetPath('/servizi/', 'fr', null, 'it', { path: 'neutral' })).toBe('/servizi/');
    expect(targetPath('/cataloghi/', 'en', langMap, 'it', { path: 'neutral' })).toBe('/catalogues/');
  });

  it('pairs only what the language map pairs under "langMap", and every page under "all"', () => {
    const only = createOutputPlan({ sourceLang: 'it', langMap, output: { pairs: 'langMap' } });
    expect(only.paired({ path: '/cataloghi/' }, 'en')).toBe(true);
    expect(only.paired({ path: '/blog/' }, 'en')).toBe(false);
    expect(only.paired({ titolo: 'senza path' }, 'en')).toBe(false);
    expect(createOutputPlan({ sourceLang: 'it', langMap }).paired({ path: '/blog/' }, 'en')).toBe(true);
    expect(() => createOutputPlan({ sourceLang: 'it', langMap: null, output: { pairs: 'langMap' } })).toThrow(/language map is missing/);
  });

  it('names a file after its target path under "path", the root as index.json, a pathless file as its source', () => {
    expect(fileNameOfPath('/collezioni/self-levelling/lastra/')).toBe('collezioni-self-levelling-lastra.json');
    expect(fileNameOfPath('/')).toBe('index.json');
    const plan = createOutputPlan({ sourceLang: 'it', langMap, output: { fileName: 'path' } });
    expect(plan.fileFor('cataloghi.json', { path: '/cataloghi/' }, 'en')).toBe('catalogues.json');
    expect(plan.fileFor('home.json', { path: '/' }, 'en')).toBe('home.json');
    expect(plan.fileFor('dati.json', { titolo: 'x' }, 'en')).toBe('dati.json');
  });

  it('writes lang only where told, or where the source carries it, and leaves a pathless file without a path', () => {
    const plain = createOutputPlan({ sourceLang: 'it', output: { langField: false } });
    expect(plain.shape({ path: '/a/', t: 'x' }, 'de')).toEqual({ path: '/de/a/', t: 'x' });
    expect(plain.shape({ path: '/a/', lang: 'it' }, 'de')).toEqual({ path: '/de/a/', lang: 'de' });
    expect(plain.shape({ t: 'x' }, 'de')).toEqual({ t: 'x' });
    expect(createOutputPlan({ sourceLang: 'it' }).shape({ t: 'x' }, 'de')).toEqual({ t: 'x', lang: 'de' });
  });

  it('serializes sorted by default and in the source order under "source"', () => {
    const value = { path: '/a/', blocks: [{ name: 'B', data: { z: 1, a: 2 } }] };
    expect(createOutputPlan({ sourceLang: 'it' }).serialize(value)).toBe(
      '{\n  "blocks": [\n    {\n      "data": {\n        "a": 2,\n        "z": 1\n      },\n      "name": "B"\n    }\n  ],\n  "path": "/a/"\n}\n'
    );
    expect(createOutputPlan({ sourceLang: 'it', output: { keyOrder: 'source' } }).serialize(value)).toBe(`${JSON.stringify(value, null, 2)}\n`);
  });

  it('the configuration refuses output.pairs "langMap" without a langMap', () => {
    const config = fixtureConfig();
    delete config.adapter.langMap;
    config.adapter.output = { pairs: 'langMap' };
    expect(() => parseConfig(config)).toThrow(/adapter\.output\.pairs: is "langMap" but the adapter names no langMap/);
  });
});

// -- The adapter end to end, on a copy of the fixture project ------------------

let dir;
const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const readText = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

/** Rewrites the fixture's configuration with `patch(config)` and loads it. */
function projectWith(patch) {
  const config = JSON.parse(readText('l10n.config.json'));
  patch(config);
  writeJson(path.join(dir, 'l10n.config.json'), config);
  return loadConfig({ configPath: path.join(dir, 'l10n.config.json') });
}

beforeEach(() => {
  dir = copyFixtureProject('l10n-options-');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('a site whose content files are not all block pages, with neutral paths', () => {
  beforeEach(() => {
    writeJson(path.join(dir, 'content/it/aree.json'), { tipo: 'dati', _nota: 'interna', aree: [{ id: 'interni', nome: 'Interni', prodotti: ['64641'] }] });
  });

  const configure = (config) => {
    config.adapter.document = { walk: 'auto', contextKey: 'tipo' };
    config.adapter.output = { path: 'neutral', langField: false, keyOrder: 'source' };
    config.adapter.fields.denylistKeys.push('tipo', 'id');
    config.adapter.fields.denylistKeyPatterns = ['_*'];
    config.adapter.fields.identifierStrings = [{ keys: ['prodotti'], where: 'list' }];
  };

  it('extracts the document walked whole beside the block pages', () => {
    const catalog = createJsonContentAdapter({ project: projectWith(configure) }).extract();
    expect(catalog.units[keyOf('Interni')]).toMatchObject({ context: 'dati:nome', usages: [{ file: 'content/it/aree.json', path: 'aree[0].nome' }] });
    expect(catalog.units[keyOf('64641')]).toBeUndefined();
    expect(catalog.units[keyOf('interna')]).toBeUndefined();
    expect(catalog.units[keyOf('Ciao mondo')]).toBeDefined();
  });

  it('generates each file in the site’s shape: its source key order, its neutral path, no lang, no added path', () => {
    const adapter = createJsonContentAdapter({ project: projectWith(configure) });
    const tm = { [keyOf('Interni')]: { text: 'Interiors' }, [keyOf('Ciao mondo')]: { text: 'Hello world' } };
    adapter.generate({ tmByLang: { en: tm } });
    expect(readText('memory/generated/content/en/aree.json')).toBe(
      `${JSON.stringify({ tipo: 'dati', _nota: 'interna', aree: [{ id: 'interni', nome: 'Interiors', prodotti: ['64641'] }] }, null, 2)}\n`
    );
    const home = read('memory/generated/content/en/home.json');
    expect(Object.keys(home)).toEqual(['path', 'template', 'seo', 'blocks']);
    expect(home.path).toBe('/');
    expect(home.lang).toBeUndefined();
    expect(home.blocks[0].data.heading).toBe('Hello world');
    expect(adapter.verifyDrift({ tmByLang: { en: tm }, scope: 'staging' }).clean).toBe(true);
  });

  it('seeds a pathless document from the target file of the same name', () => {
    writeJson(path.join(dir, 'content/en/aree.json'), { tipo: 'dati', aree: [{ id: 'interni', nome: 'Indoors', prodotti: ['64641'] }] });
    const project = projectWith(configure);
    const { entriesByLang } = createJsonContentAdapter({ project }).seedAlign({ store: createStore({ baseDir: project.memoryDir }) });
    expect(entriesByLang.en[keyOf('Interni')]).toEqual({ text: 'Indoors', status: 'seed' });
  });
});

describe('a site whose target pages were written by hand: pairs, names and the safe materialize', () => {
  beforeEach(() => {
    writeJson(path.join(dir, 'content/it/cataloghi.json'), { path: '/cataloghi/', template: 'T', blocks: [{ name: 'Text', data: { title: 'Cataloghi', to: '/cataloghi/' } }] });
    writeJson(path.join(dir, 'content/it/blog.json'), { path: '/blog/', template: 'T', blocks: [{ name: 'Text', data: { title: 'Notizie' } }] });
    writeJson(path.join(dir, 'lang-map.json'), { pairs: [{ it: '/', en: '/home/' }, { it: '/cataloghi/', en: '/catalogues/' }] });
    fs.rmSync(path.join(dir, 'content/en/home.json'));
  });

  const configure = (config) => {
    config.adapter.output = { pairs: 'langMap', fileName: 'path', langField: false, keyOrder: 'source', materialize: 'safe' };
  };
  const memory = (project, entries) => {
    const store = createStore({ baseDir: project.memoryDir });
    store.writeLayerEntries(LAYER.MACHINE, 'en', Object.fromEntries(Object.entries(entries).map(([s, text]) => [keyOf(s), { text, status: 'machine', srcHash: keyOf(s) }])));
    return store;
  };
  const materialize = (project, store) => {
    const lines = [];
    createJsonContentAdapter({ project }).materialize({
      tmByLang: store.readAllTM(['en']),
      memoryTextsByLang: { en: store.memoryTexts('en') },
      recordedSourceTexts: store.recordedSourceTexts(),
      log: (...a) => lines.push(a.join(' ')),
    });
    return lines.join('\n');
  };

  it('generates only the paired pages, under their target names, and still extracts every page', () => {
    const project = projectWith(configure);
    const adapter = createJsonContentAdapter({ project });
    expect(adapter.extract().units[keyOf('Notizie')]).toBeDefined();
    const out = adapter.generate({ tmByLang: { en: {} } });
    expect(Object.keys(out.files).sort()).toEqual(['en/catalogues.json', 'en/home.json']);
    expect(out.unpaired).toEqual(['en/blog.json']);
    expect(out.files['en/catalogues.json'].path).toBe('/catalogues/');
    expect(fs.existsSync(path.join(dir, 'memory/generated/content/en/blog.json'))).toBe(false);
  });

  it('writes a file only when every leaf is translated and no hand-edited leaf is lost', () => {
    const project = projectWith(configure);
    const store = memory(project, { Benvenuti: 'Welcome', Cataloghi: 'Catalogues', 'Ciao mondo': 'Hi', Scopri: 'Discover', 'Primo paragrafo.': 'First.', 'Una pagina di prova': 'A test page', 'Torna su': 'Back to top', Menu: 'Menu' });
    // A hand-written target with a link the source does not hold: a hand-edited leaf.
    writeJson(path.join(dir, 'content/en/catalogues.json'), { path: '/catalogues/', template: 'T', blocks: [{ name: 'Text', data: { title: 'Our catalogues', to: '/catalogues/' } }] });
    const handWritten = readText('content/en/catalogues.json');
    const out = materialize(project, store);
    expect(readText('content/en/catalogues.json')).toBe(handWritten);
    expect(out).toMatch(/left as it is: .*catalogues\.json: 2 hand-edited leaves would be replaced or removed/);
    // home.json is absent and fully translated: written, under its target name, in the source key order, with no lang.
    expect(Object.keys(read('content/en/home.json'))).toEqual(['path', 'template', 'seo', 'blocks']);
    expect(read('content/en/home.json').path).toBe('/home/');
    expect(fs.existsSync(path.join(dir, 'content/en/blog.json'))).toBe(false);
    expect(out).toContain('content: 1 file(s) written, 1 left as they are (policy "safe")');
    expect(out).toContain('1 source page(s) without a pair in a target locale, not written');
  });

  it('never writes the source text into a target, and rewrites a file whose differing leaves the memory holds', () => {
    const project = projectWith(configure);
    const store = memory(project, { Cataloghi: 'Catalogues' });
    writeJson(path.join(dir, 'content/en/catalogues.json'), { path: '/catalogues/', template: 'T', blocks: [{ name: 'Text', data: { title: 'Catalogues (old)', to: '/cataloghi/' } }] });
    store.writeLayerEntries(LAYER.HUMAN, 'en', { [keyOf('x')]: { text: 'Catalogues (old)', status: 'human', srcHash: keyOf('x') } });
    const out = materialize(project, store);
    expect(read('content/en/catalogues.json').blocks[0].data.title).toBe('Catalogues');
    expect(fs.existsSync(path.join(dir, 'content/en/home.json'))).toBe(false);
    expect(out).toMatch(/left as it is: .*home\.json: \d+ leaves have no translation and would be written in the source language/);
    // The UI dictionary on disk holds a hand-written entry, and two strings lack a translation: it is left as it is.
    expect(out).toMatch(/left as it is: .*ui\/en\.json/);
  });

  it('a file on disk that nothing generates is never touched, under either policy', () => {
    writeJson(path.join(dir, 'content/en/only-english.json'), { path: '/only-english/', blocks: [] });
    const before = readText('content/en/only-english.json');
    for (const policy of ['safe', 'replace']) {
      const project = projectWith((config) => {
        configure(config);
        config.adapter.output.materialize = policy;
      });
      materialize(project, memory(project, {}));
      expect(readText('content/en/only-english.json')).toBe(before);
    }
  });

  it('replace writes every paired page, fallback text included', () => {
    const project = projectWith((config) => {
      configure(config);
      config.adapter.output.materialize = 'replace';
    });
    const out = materialize(project, memory(project, {}));
    expect(read('content/en/catalogues.json').blocks[0].data.title).toBe('Cataloghi');
    expect(out).toContain('content: 2 file(s) written');
  });

  it('the drift guard compares the paired pages under their target names, and reports an unpaired target as extra', () => {
    writeJson(path.join(dir, 'content/en/only-english.json'), { path: '/only-english/', blocks: [] });
    const project = projectWith(configure);
    const tmByLang = memory(project, {}).readAllTM(['en']);
    const adapter = createJsonContentAdapter({ project });
    const report = adapter.verifyDrift({ tmByLang });
    expect(report.contentResult.missing.sort()).toEqual(['en/catalogues.json', 'en/home.json']);
    expect(report.contentResult.extra).toEqual(['en/only-english.json']);
  });

  it('refuses two pages that would be written under one name', () => {
    writeJson(path.join(dir, 'lang-map.json'), { pairs: [{ it: '/', en: '/home/' }, { it: '/cataloghi/', en: '/home/' }] });
    const adapter = createJsonContentAdapter({ project: projectWith(configure) });
    expect(() => adapter.generate({ tmByLang: { en: {} } })).toThrow(/would both be written as en\/home\.json/);
  });

  it('seeds only paired pages, aligning each with its target by the pair’s path', () => {
    writeJson(path.join(dir, 'content/en/catalogues.json'), { path: '/catalogues/', template: 'T', blocks: [{ name: 'Text', data: { title: 'Catalogues', to: '/catalogues/' } }] });
    const project = projectWith(configure);
    const { entriesByLang, report } = createJsonContentAdapter({ project }).seedAlign({ store: createStore({ baseDir: project.memoryDir }) });
    expect(entriesByLang.en[keyOf('Cataloghi')]).toEqual({ text: 'Catalogues', status: 'seed' });
    expect(report.unpaired.map((u) => u.file).sort()).toEqual(['blog.json', 'home.json']);
  });
});

describe('a nested UI dictionary', () => {
  const configure = (config) => {
    config.adapter.ui.nested = true;
    config.adapter.output = { keyOrder: 'source' };
  };
  beforeEach(() => {
    writeJson(path.join(dir, 'ui/it.json'), { menu: { home: 'Casa', voci: ['Prodotti', { etichetta: 'Contatti' }] }, versione: 2 });
  });

  it('extracts every string at any depth, keyed by its path, one request section per top-level key', () => {
    const adapter = createJsonContentAdapter({ project: projectWith(configure) });
    const units = adapter.extract().units;
    expect(units[keyOf('Casa')].usages).toEqual([{ file: 'ui/it.json', path: 'menu.home' }]);
    expect(units[keyOf('Contatti')].usages).toEqual([{ file: 'ui/it.json', path: 'menu.voci[1].etichetta' }]);
    const page = adapter.pages().find((p) => p.id === 'ui/it.json');
    expect(page.segments.map((s) => `${s.section} ${s.context}`)).toEqual(['menu ui:menu.home', 'menu ui:menu.voci[0]', 'menu ui:menu.voci[1].etichetta']);
  });

  it('generates the source’s shape, seeds by path and passes the drift guard', () => {
    const project = projectWith(configure);
    const adapter = createJsonContentAdapter({ project });
    const tm = { [keyOf('Casa')]: { text: 'Home' }, [keyOf('Prodotti')]: { text: 'Products' }, [keyOf('Contatti')]: { text: 'Contact' } };
    adapter.generate({ tmByLang: { en: tm } });
    expect(readText('memory/generated/ui/en.json')).toBe(
      `${JSON.stringify({ menu: { home: 'Home', voci: ['Products', { etichetta: 'Contact' }] }, versione: 2 }, null, 2)}\n`
    );
    expect(adapter.verifyDrift({ tmByLang: { en: tm }, scope: 'staging' }).clean).toBe(true);
    writeJson(path.join(dir, 'ui/en.json'), { menu: { home: 'Start', voci: ['Range', { etichetta: 'Write to us' }] } });
    const { entriesByLang } = adapter.seedAlign({ store: createStore({ baseDir: project.memoryDir }) });
    expect(entriesByLang.en[keyOf('Contatti')]).toEqual({ text: 'Write to us', status: 'seed' });
  });

  it('a flat dictionary still reads its top-level strings only, as 1.0.0 did', () => {
    const adapter = createJsonContentAdapter({ project: loadConfig({ configPath: path.join(dir, 'l10n.config.json') }) });
    expect(adapter.extract().units[keyOf('Casa')]).toBeUndefined();
  });
});

describe('the defaults are the 1.0.0 behaviour', () => {
  it('an adapter without the new keys resolves to blocks, prefixed paths, lang, sorted keys, every page, source names, replace', () => {
    dir = dir || copyFixtureProject('l10n-options-');
    const adapter = createJsonContentAdapter({ project: loadConfig({ configPath: path.join(dir, 'l10n.config.json') }) });
    expect(adapter.settings).toEqual({
      document: { walk: 'blocks', contextKey: null },
      output: { path: 'prefixed', langField: true, keyOrder: 'sorted', pairs: 'all', fileName: 'source', materialize: 'replace' },
      ui: { nested: false },
    });
  });

  it('a configuration with an unknown output key is refused, naming it', () => {
    const config = fixtureConfig();
    config.adapter.output = { pathStrategy: 'neutral' };
    expect(() => parseConfig(config)).toThrow(ConfigError);
    expect(() => parseConfig(config)).toThrow(/adapter\.output\.pathStrategy: unknown key/);
  });
});
