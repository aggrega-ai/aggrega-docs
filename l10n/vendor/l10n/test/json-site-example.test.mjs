/**
 * json-site-example.test.mjs — The block-content example, `examples/json-site/`:
 * a minimal English-source site run end to end by the real command line.
 *
 * READS the example. WRITES only the temporary copies it makes of it, where the
 * command line runs extract, the gate, translate with the package's
 * pseudo-localizer injected as the synchronous backend, generate and the drift
 * guard. No request leaves the process: the pseudo-localizer is not a client.
 */

import './no-network.mjs';
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runCli } from '../src/cli.mjs';
import { loadConfig } from '../src/config.mjs';
import { createPseudoLocalizer, pseudoLocalize } from '../src/pseudo-localizer.mjs';
import { capture, copyExample, EXAMPLES } from './helpers.mjs';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fresh copy of the example, and a runner of one command in it with the pseudo-localizer as its backend. */
function site() {
  const dir = copyExample('json-site');
  dirs.push(dir);
  const backend = createPseudoLocalizer();
  const run = async (...argv) => {
    const io = capture();
    const code = await runCli(argv, { cwd: dir, env: {}, backend, log: io.log, errlog: io.errlog });
    return { code, out: io.text(), err: io.errors() };
  };
  return { dir, run };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

describe('the json-site example', () => {
  it('is an English-source site with targets it and de on claude-opus-5-5, two content files, a UI dictionary, a glossary and two prompt files', () => {
    const project = loadConfig({ configPath: path.join(EXAMPLES, 'json-site', 'l10n.config.json') });
    expect(project.locales).toEqual({ source: 'en', targets: ['it', 'de'] });
    expect(project.config.adapter.kind).toBe('json-content');
    expect(project.config.backend.model).toEqual({ id: 'claude-opus-5-5', effort: 'low' });
    expect(fs.readdirSync(path.join(EXAMPLES, 'json-site', 'content', 'en')).sort()).toEqual(['about.json', 'home.json']);
    expect(fs.existsSync(path.join(EXAMPLES, 'json-site', 'ui', 'en.json'))).toBe(true);
    expect(fs.readdirSync(project.promptsDir).sort()).toEqual(['de.md', 'it.md']);
    expect(readJson(project.glossaryPath).do_not_translate).toEqual(['Fernhill']);
  });

  it('runs extract, the gate, translate with the pseudo-localizer, generate and the drift guard, every one exiting 0', async () => {
    const { dir, run } = site();
    const steps = [
      ['extract'],
      ['gate'],
      ['translate'],
      ['gate', '--check'],
      ['generate'],
      ['verify-drift', '--scope', 'staging'],
    ];
    const results = [];
    for (const argv of steps) results.push([argv.join(' '), (await run(...argv)).code]);
    expect(results).toEqual(steps.map((argv) => [argv.join(' '), 0]));

    const home = readJson(path.join(dir, 'i18n', 'generated', 'content', 'it', 'home.json'));
    expect(home.path).toBe('/it/');
    expect(home.blocks[0].data.heading).toBe(pseudoLocalize('Bread baked by hand'));
    expect(home.blocks[0].data.image).toBe('/images/hero.jpg');
    const ui = readJson(path.join(dir, 'i18n', 'generated', 'ui', 'de.json'));
    expect(ui['nav.about']).toBe(pseudoLocalize('About us'));
  });

  it('the drift guard fails on a hand-edited target, naming the file and the leaf', async () => {
    const { dir, run } = site();
    for (const argv of [['extract'], ['translate'], ['generate']]) expect((await run(...argv)).code).toBe(0);
    const file = path.join(dir, 'i18n', 'generated', 'content', 'de', 'about.json');
    const page = readJson(file);
    page.blocks[0].data.paragraphs[0] = 'Von Hand geschrieben.';
    fs.writeFileSync(file, JSON.stringify(page, null, 2));
    const drift = await run('verify-drift', '--scope', 'staging');
    expect(drift.code).toBe(1);
    expect(drift.out).toContain('about.json');
    expect(drift.out).toContain('blocks[0].data.paragraphs[0]');
  });

  it('reads its glossary: a string holding the do-not-translate brand, accented by the pseudo-localizer, is rejected and stays untranslated', async () => {
    const { dir, run } = site();
    const file = path.join(dir, 'content', 'en', 'about.json');
    const page = readJson(file);
    page.blocks[0].data.paragraphs.push('Fernhill bakes on Sundays too.');
    fs.writeFileSync(file, JSON.stringify(page, null, 2));
    expect((await run('extract')).code).toBe(0);
    const translated = await run('translate');
    expect(translated.code).toBe(1);
    expect(translated.out).toContain('failed=2');
    const machine = readJson(path.join(dir, 'i18n', 'machine', 'it.json'));
    expect(Object.values(machine).map((entry) => entry.text)).not.toContain(pseudoLocalize('Fernhill bakes on Sundays too.'));
  });
});
