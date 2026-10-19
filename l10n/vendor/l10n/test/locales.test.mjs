/**
 * locales.test.mjs — The locale codes a project declares, end to end: the
 * configuration's validation, the prompt files named after each code, the
 * language names in the instructions, the custom identifiers of a batch, and
 * every file each command writes, for Portuguese, Spanish, French, German and
 * both scripts of Chinese.
 *
 * READS and WRITES only a copy of the fixture project in a temporary
 * directory. Every model is a fake: the pseudo-localizer, or the fake SDK
 * client; nothing reaches the network.
 */

import './no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runCli } from '../src/cli.mjs';
import { ConfigError, isLocaleCode, loadConfig, parseConfig } from '../src/config.mjs';
import { createPseudoLocalizer } from '../src/pseudo-localizer.mjs';
import { generalRules } from '../src/translator-prompt.mjs';
import { CUSTOM_ID_PATTERN } from '../src/pending.mjs';
import { capture, copyFixtureProject, fakeAnthropic, fixtureConfig, writeJson } from './helpers.mjs';

const TARGETS = ['pt', 'es', 'fr', 'de', 'zh-Hans', 'zh-Hant'];

let dir;

beforeEach(() => {
  dir = copyFixtureProject('l10n-locales-');
  writeJson(path.join(dir, 'locales.json'), { source: 'it', targets: TARGETS });
  for (const lang of TARGETS) fs.writeFileSync(path.join(dir, 'memory/prompts', `${lang}.md`), `Write for readers of ${lang}.\n`);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function run(argv, deps = {}) {
  const io = capture();
  const code = await runCli(argv, { cwd: dir, env: {}, log: io.log, errlog: io.errlog, ...deps });
  return { code, out: io.text(), err: io.errors() };
}

describe('locale codes — what the configuration accepts', () => {
  it('accepts the BCP 47 tags of the six languages, and refuses a code that is no tag or not path-safe', () => {
    for (const code of ['it', 'en', ...TARGETS, 'pt-BR', 'zh-CN', 'sr-Latn-RS']) expect(isLocaleCode(code), code).toBe(true);
    for (const code of ['en_US', 'zh/Hans', '_general', 'x', '', 'zh-', '-en', 'en us']) expect(isLocaleCode(code), code).toBe(false);
  });

  it('refuses an inline target that is not a locale code, a duplicate, and the source among the targets, naming each', () => {
    const config = fixtureConfig();
    config.locales = { source: 'it', targets: ['zh-Hans', 'en_US', 'zh-Hans', 'it'] };
    let message = '';
    try {
      parseConfig(config);
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      message = err.message;
    }
    expect(message).toContain('locales.targets.1: must be a BCP 47 language tag');
    expect(message).toContain('locales.targets.2: "zh-Hans" is listed twice');
    expect(message).toContain('locales.targets.3: "it" is the source locale');
  });

  it('refuses the same defects in a locale declaration file, naming them', () => {
    writeJson(path.join(dir, 'locales.json'), { source: 'it', targets: ['fr', 'fr'] });
    expect(() => loadConfig({ configPath: path.join(dir, 'l10n.config.json') })).toThrow(/malformed locale declaration.*targets\.1: "fr" is listed twice/);
  });

  it('keeps a declaration file’s other keys, as 1.0.0 did, and the inline form strict', () => {
    writeJson(path.join(dir, 'locales.json'), { source: 'it', targets: TARGETS, names: { 'zh-Hant': '繁體中文' } });
    expect(loadConfig({ configPath: path.join(dir, 'l10n.config.json') }).locales.targets).toEqual(TARGETS);
    const config = fixtureConfig();
    config.locales = { source: 'it', targets: ['fr'], names: {} };
    expect(() => parseConfig(config)).toThrow(/locales/);
  });
});

describe('locale codes — every command, for the six target locales', () => {
  it('names each language in the instructions', () => {
    const names = TARGETS.map((lang) => generalRules({ lang, sourceLang: 'it', glossary: {} }).split('\n')[0]);
    expect(names).toEqual([
      'You translate pages from Italian into Portuguese.',
      'You translate pages from Italian into Spanish.',
      'You translate pages from Italian into French.',
      'You translate pages from Italian into German.',
      'You translate pages from Italian into Simplified Chinese.',
      'You translate pages from Italian into Traditional Chinese.',
    ]);
  });

  it('extracts, translates, generates, materializes and passes the drift guard, writing each locale under its own code', async () => {
    const backend = createPseudoLocalizer();
    expect((await run(['extract'])).code).toBe(0);
    const translated = await run(['translate'], { backend });
    expect(translated.code).toBe(0);
    expect((await run(['generate'])).code).toBe(0);
    expect((await run(['materialize'])).code).toBe(0);
    for (const lang of TARGETS) {
      expect(fs.existsSync(path.join(dir, 'memory/machine', `${lang}.json`)), lang).toBe(true);
      expect(fs.existsSync(path.join(dir, 'memory/generated/content', lang, 'home.json')), lang).toBe(true);
      expect(fs.existsSync(path.join(dir, 'ui', `${lang}.json`)), lang).toBe(true);
      expect(JSON.parse(fs.readFileSync(path.join(dir, 'content', lang, 'home.json'), 'utf8')).lang).toBe(lang);
    }
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'content/zh-Hant/home.json'), 'utf8')).path).toBe('/zh-Hant/');
    const drift = await run(['verify-drift']);
    expect(drift.code).toBe(0);
    expect((await run(['gate', '--check'])).code).toBe(0);
  });

  it('refuses a target whose prompt file is missing, naming the file by its code', async () => {
    fs.rmSync(path.join(dir, 'memory/prompts/zh-Hant.md'));
    const res = await run(['translate'], { backend: createPseudoLocalizer() });
    expect(res.code).toBe(2);
    expect(res.err).toContain(`${path.join(dir, 'memory/prompts/zh-Hant.md')}: the per-language prompt file for "zh-Hant" is missing`);
  });

  it('builds batch requests whose custom identifiers match the API’s pattern for every code', async () => {
    const fake = fakeAnthropic();
    await run(['extract']);
    const res = await run(['submit'], { env: { ANTHROPIC_API_KEY: 'k' }, ClientClass: fake.FakeAnthropic });
    expect(res.code).toBe(0);
    const ids = fake.calls.batchCreate[0].requests.map((r) => r.custom_id);
    expect(ids.length).toBeGreaterThanOrEqual(TARGETS.length);
    for (const id of ids) expect(id).toMatch(CUSTOM_ID_PATTERN);
    for (const lang of TARGETS) expect(ids.some((id) => id.includes(lang)), lang).toBe(true);
  });

  it('doctor names every locale’s prompt file', async () => {
    const res = await run(['doctor']);
    expect(res.out).toContain('pt.md, es.md, fr.md, de.md, zh-Hans.md, zh-Hant.md');
  });
});
