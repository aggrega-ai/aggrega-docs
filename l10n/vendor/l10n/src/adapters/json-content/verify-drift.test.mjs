import '../../../test/no-network.mjs';
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkDrift } from './verify-drift.mjs';
import { generateContent } from './generate.mjs';
import { generateUiDictionary } from './generate-ui.mjs';
import { createFieldRules } from './fields.mjs';
import { runCli } from '../../cli.mjs';
import { capture, copyFixtureProject, fixtureConfig, writeJson } from '../../../test/helpers.mjs';

const rules = createFieldRules(fixtureConfig().adapter.fields);

let root;

// --- Fixture ---------------------------------------------------------------
// One source-locale page mapped to EN through the lang map, a source-locale UI
// dictionary, and a partial translation memory.
const IT_PAGE = {
  path: '/',
  template: 'DynamicPage',
  blocks: [{ name: 'RichTextSection', data: { sections: [{ heading: 'Ciao mondo' }] } }],
  seo: { title: 'Titolo', description: 'Descrizione' },
};
const LANG_MAP = { pairs: [{ it: '/', en: '/home/' }] };
const IT_UI = { 'nav.backToTop': 'Torna su' };

function setupFixture() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-drift-'));
  const itContentDir = path.join(root, 'it-content');
  const uiDictPath = path.join(root, 'it-ui.json');
  const currentContentDir = path.join(root, 'current-content', '{lang}');
  const currentUiFile = path.join(root, 'current-ui', '{lang}.json');

  fs.mkdirSync(itContentDir, { recursive: true });
  fs.writeFileSync(path.join(itContentDir, 'home.json'), JSON.stringify(IT_PAGE), 'utf8');
  fs.writeFileSync(uiDictPath, JSON.stringify(IT_UI), 'utf8');

  // A partial memory: any coverage will do, because the CANONICAL target is
  // exactly what `generate` produces from THIS same memory. The guard must find
  // the two identical.
  const tmByLang = { en: {} };

  // Materializes the canonical targets by writing generate's output to disk.
  generateContent({
    rules,
    sourceLang: 'it',
    tmByLang,
    targets: ['en'],
    contentDir: itContentDir,
    langMap: LANG_MAP,
    outDir: currentContentDir,
  });
  generateUiDictionary({ tmByLang, targets: ['en'], dictPath: uiDictPath, outFile: currentUiFile });

  return { itContentDir, uiDictPath, currentContentDir, currentUiFile, tmByLang };
}

function checkArgs(f) {
  return {
    rules,
    sourceLang: 'it',
    targets: ['en'],
    tmByLang: f.tmByLang,
    contentDir: f.itContentDir,
    langMap: LANG_MAP,
    uiDictPath: f.uiDictPath,
    currentContentDir: f.currentContentDir,
    currentUiFile: f.currentUiFile,
  };
}

function check(f) {
  return checkDrift(checkArgs(f));
}

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('checkDrift (the anti-drift guard)', () => {
  it('reports clean when the target equals what was generated', () => {
    const res = check(setupFixture());
    expect(res.clean).toBe(true);
    expect(res.contentResult.drifted).toHaveLength(0);
    expect(res.uiResult.drifted).toHaveLength(0);
    expect(res.message).toContain('no divergence');
  });

  it('reports drift and names the file when a content target is hand-edited', () => {
    const f = setupFixture();
    // A hand edit to a derived target, which is the workflow error the guard exists to catch.
    const tampered = path.join(root, 'current-content', 'en', 'home.json');
    const page = JSON.parse(fs.readFileSync(tampered, 'utf8'));
    page.blocks[0].data.sections[0].heading = 'Hand-edited heading';
    fs.writeFileSync(tampered, JSON.stringify(page, null, 2), 'utf8');

    const res = check(f);
    expect(res.clean).toBe(false);
    expect(res.contentResult.drifted).toContain('en/home.json');
    expect(res.message).toContain('edit the source locale, not the target');
  });

  it('reports drift and names the file when the UI dictionary is hand-edited', () => {
    const f = setupFixture();
    const tampered = path.join(root, 'current-ui', 'en.json');
    const dict = JSON.parse(fs.readFileSync(tampered, 'utf8'));
    dict['nav.backToTop'] = 'Back to top (hand-edited)';
    fs.writeFileSync(tampered, JSON.stringify(dict, null, 2), 'utf8');

    const res = check(f);
    expect(res.clean).toBe(false);
    expect(res.uiResult.drifted).toContain('en.json');
  });

  it('reports a leaf holding an older translation as stale, and passes', () => {
    const f = setupFixture();
    const tampered = path.join(root, 'current-content', 'en', 'home.json');
    const page = JSON.parse(fs.readFileSync(tampered, 'utf8'));
    page.blocks[0].data.sections[0].heading = 'An older translation';
    fs.writeFileSync(tampered, JSON.stringify(page, null, 2), 'utf8');

    const res = checkDrift({ ...checkArgs(f), memoryTextsByLang: { en: new Set(['An older translation']) } });
    expect(res.clean).toBe(true);
    expect(res.contentResult.stale).toEqual([{ file: 'en/home.json', leaf: 'blocks[0].data.sections[0].heading' }]);
    expect(res.message).toContain('1 stale leaf');
  });

  it('compares content only when the site has no UI dictionary', () => {
    const f = setupFixture();
    const res = checkDrift({
      rules,
      sourceLang: 'it',
      targets: ['en'],
      tmByLang: f.tmByLang,
      contentDir: f.itContentDir,
      langMap: LANG_MAP,
      currentContentDir: f.currentContentDir,
    });
    expect(res.clean).toBe(true);
    expect(res.uiResult.clean).toBe(true);
  });
});

describe('l10n verify-drift: the known texts include both layers and both archives', () => {
  let project;
  afterEach(() => {
    if (project) fs.rmSync(project, { recursive: true, force: true });
    project = undefined;
  });

  async function run(argv) {
    const io = capture();
    const code = await runCli(argv, { cwd: project, env: {}, log: io.log, errlog: io.errlog });
    return { code, out: io.text(), err: io.errors() };
  }

  /** The fixture with its targets materialized, then its English heading overwritten with `text`. */
  async function withHeading(text) {
    project = copyFixtureProject('l10n-drift-cli-');
    expect((await run(['materialize'])).code).toBe(0);
    const file = path.join(project, 'content', 'en', 'home.json');
    const page = JSON.parse(fs.readFileSync(file, 'utf8'));
    page.blocks[0].data.heading = text;
    fs.writeFileSync(file, JSON.stringify(page, null, 2), 'utf8');
  }

  it.each([
    ['human', 'messages'],
    ['machine', 'machine'],
  ])('a leaf whose text only the %s archive holds is stale: exit 0', async (_layer, dir) => {
    await withHeading('Hello from the archive');
    writeJson(path.join(project, 'memory', dir, '_archive', 'en.json'), { k: { text: 'Hello from the archive', status: 'machine', srcHash: 'k' } });
    const r = await run(['verify-drift']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('stale: content/en/home.json blocks[0].data.heading');
  });

  it('a leaf whose text is in no source and no layer, live or archived, exits 1 naming the file and the leaf', async () => {
    await withHeading('Typed into the English file');
    writeJson(path.join(project, 'memory', 'machine', '_archive', 'en.json'), { k: { text: 'Something else', status: 'machine', srcHash: 'k' } });
    const r = await run(['verify-drift']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('hand-edited: content/en/home.json blocks[0].data.heading');
    expect(r.out).toContain('edit the source locale, not the target');
  });
});
