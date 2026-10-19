import '../../../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createJsonContentAdapter } from './index.mjs';
import { loadConfig } from '../../config.mjs';
import { createStore } from '../../store.mjs';
import { keyOf } from '../../normalize.mjs';
import { LAYER } from '../../types.mjs';
import { copyFixtureProject, writeJson } from '../../../test/helpers.mjs';

let dir;
let project;

beforeEach(() => {
  dir = copyFixtureProject('l10n-adapter-');
  project = loadConfig({ configPath: path.join(dir, 'l10n.config.json') });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));

describe('createJsonContentAdapter — configuration in, content model out', () => {
  it('takes its locale set from the project', () => {
    const adapter = createJsonContentAdapter({ project });
    expect(adapter.sourceLang).toBe('it');
    expect(adapter.targets).toEqual(['en']);
  });

  it('extracts content and UI units, labelling usages with root-relative paths by default', () => {
    const catalog = createJsonContentAdapter({ project, now: () => 'T' }).extract();
    expect(catalog).toMatchObject({ generated_at: 'T', source_lang: 'it' });
    expect(catalog.units[keyOf('Ciao mondo')].usages).toEqual([{ file: 'content/it/home.json', path: 'blocks[0].data.heading' }]);
    expect(catalog.units[keyOf('Torna su')].usages).toEqual([{ file: 'ui/it.json', path: 'nav.backToTop' }]);
    // The guards: an image path, a number and a boolean are not units.
    expect(catalog.units[keyOf('/uploads/a.jpg')]).toBeUndefined();
    expect(catalog.units[keyOf('42')]).toBeUndefined();
    expect(catalog.units[keyOf('true')]).toBeUndefined();
  });

  it('uses a configured usage label when one is given', () => {
    const cfg = read('l10n.config.json');
    cfg.adapter.content.usageLabel = 'pages/{lang}';
    writeJson(path.join(dir, 'l10n.config.json'), cfg);
    const relabelled = loadConfig({ configPath: path.join(dir, 'l10n.config.json') });
    const catalog = createJsonContentAdapter({ project: relabelled }).extract();
    expect(catalog.units[keyOf('Ciao mondo')].usages[0].file).toBe('pages/it/home.json');
  });

  it('generate writes the staging area and never the real targets', () => {
    const before = fs.readFileSync(path.join(dir, 'content', 'en', 'home.json'));
    const adapter = createJsonContentAdapter({ project });
    const out = adapter.generate({ tmByLang: { en: {} } });
    expect(out.written.sort()).toEqual(
      [path.join(dir, 'memory/generated/content/en/home.json'), path.join(dir, 'memory/generated/ui/en.json')].sort()
    );
    expect(fs.readFileSync(path.join(dir, 'content', 'en', 'home.json')).equals(before)).toBe(true);
  });

  it('honours the language map in generate, materialize and the drift guard alike', () => {
    writeJson(path.join(dir, 'lang-map.json'), { pairs: [{ it: '/', en: '/en/home/' }] });
    const adapter = createJsonContentAdapter({ project });
    const tmByLang = createStore({ baseDir: project.memoryDir }).readAllTM(['en']);
    expect(adapter.generate({ tmByLang }).files['en/home.json'].path).toBe('/en/home/');
    adapter.materialize({ tmByLang, log: () => {} });
    expect(read('content/en/home.json').path).toBe('/en/home/');
    expect(adapter.verifyDrift({ tmByLang }).clean).toBe(true);
  });

  it('materializes from the lookup view, so the human layer wins over the machine layer', () => {
    const store = createStore({ baseDir: project.memoryDir });
    store.writeLayerEntries(LAYER.MACHINE, 'en', {
      [keyOf('Ciao mondo')]: { text: 'Hi world (machine)', status: 'machine', srcHash: keyOf('Ciao mondo') },
      [keyOf('Scopri')]: { text: 'Discover (machine)', status: 'machine', srcHash: keyOf('Scopri') },
    });
    createJsonContentAdapter({ project }).materialize({ tmByLang: store.readAllTM(['en']), log: () => {} });
    const page = read('content/en/home.json');
    expect(page.blocks[0].data.heading).toBe('Hello, world'); // the fixture's human entry
    expect(page.blocks[0].data.cta.label).toBe('Discover (machine)'); // machine fills the gap
  });

  it('seedAlign compares against the human layer and writes its report beside the memory', () => {
    const store = createStore({ baseDir: project.memoryDir });
    const { entriesByLang, report } = createJsonContentAdapter({ project, now: () => 'T' }).seedAlign({ store });
    expect(entriesByLang.en[keyOf('Benvenuti')]).toEqual({ text: 'Welcome', status: 'seed' });
    expect(entriesByLang.en[keyOf('Ciao mondo')]).toBeUndefined(); // a human entry is preserved
    expect(report.counts.preserved).toBe(1);
    expect(read('memory/seed-report.json')).toMatchObject({ generated_at: 'T', lang: 'en' });
  });

  it('refuses an unknown drift scope', () => {
    expect(() => createJsonContentAdapter({ project }).verifyDrift({ tmByLang: { en: {} }, scope: 'both' })).toThrow(
      /unknown scope "both"/
    );
  });
});
