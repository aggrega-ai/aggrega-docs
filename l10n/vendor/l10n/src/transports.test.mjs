import '../test/no-network.mjs';
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runCli } from './cli.mjs';
import { DEFAULT_MODEL } from './config.mjs';
import { keyOf } from './normalize.mjs';
import { capture, copyFixtureProject, fakeAnthropic, replyMessage, requestBody, writeJson } from '../test/helpers.mjs';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fresh copy of the fixture project, its catalogue extracted. */
async function extracted() {
  const dir = copyFixtureProject();
  dirs.push(dir);
  const io = capture();
  expect(await runCli(['extract'], { cwd: dir, env: {}, log: io.log, errlog: io.errlog })).toBe(0);
  return dir;
}

describe('both transports build their requests with the one builder', () => {
  it('the synchronous `translate` and the batch `submit` send identical system and messages for the same page', async () => {
    const env = { ANTHROPIC_API_KEY: 'k' };
    const syncFake = fakeAnthropic();
    const syncDir = await extracted();
    const io = capture();
    expect(await runCli(['translate'], { cwd: syncDir, env, ClientClass: syncFake.FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(0);

    const batchFake = fakeAnthropic();
    const batchDir = await extracted();
    expect(await runCli(['submit'], { cwd: batchDir, env, ClientClass: batchFake.FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(0);

    const sync = syncFake.calls.create;
    const batch = batchFake.calls.batchCreate[0].requests.map((r) => r.params);
    const pageOf = (params) => requestBody(params).page;
    expect(sync.map(pageOf).sort()).toEqual(['content/it/home.json', 'ui/it.json']);
    expect(batch.map(pageOf).sort()).toEqual(sync.map(pageOf).sort());
    for (const syncParams of sync) {
      const batchParams = batch.find((p) => pageOf(p) === pageOf(syncParams));
      expect(syncParams.system).toHaveLength(3);
      expect(batchParams.system).toEqual(syncParams.system);
      expect(batchParams.messages).toEqual(syncParams.messages);
      expect(batchParams).toEqual(syncParams);
    }
  });

  it('with a project general prompt, both transports send the same four-block system for the same page, the general prompt third', async () => {
    const env = { ANTHROPIC_API_KEY: 'k' };
    const general = '# The site\n\nVisitors are small-business owners.\n';
    const withGeneral = async () => {
      const dir = await extracted();
      fs.writeFileSync(path.join(dir, 'memory', 'prompts', '_general.md'), general);
      return dir;
    };
    const io = capture();
    const syncFake = fakeAnthropic();
    expect(await runCli(['translate'], { cwd: await withGeneral(), env, ClientClass: syncFake.FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(0);
    const batchFake = fakeAnthropic();
    expect(await runCli(['submit'], { cwd: await withGeneral(), env, ClientClass: batchFake.FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(0);

    const sync = syncFake.calls.create;
    const batch = batchFake.calls.batchCreate[0].requests.map((r) => r.params);
    const pageOf = (params) => requestBody(params).page;
    expect(batch.map(pageOf).sort()).toEqual(sync.map(pageOf).sort());
    expect(sync).toHaveLength(2);
    for (const syncParams of sync) {
      expect(syncParams.system.map((b) => b.text)[2]).toBe(general);
      expect(syncParams.system.map((b) => b.cache_control)).toEqual([undefined, undefined, undefined, { type: 'ephemeral', ttl: '1h' }]);
      expect(batch.find((p) => pageOf(p) === pageOf(syncParams))).toEqual(syncParams);
    }
  });

  it('both transports apply the glossary’s case mode to every reply: a lowercase word spelled like a term is translated under the sensitive mode and must stay under the default', async () => {
    const env = { ANTHROPIC_API_KEY: 'k' };
    const OPEN = 'Apri il menu';
    // The fake model keeps "Menu" as written and translates the lowercase word.
    const reply = (params) => {
      const body = requestBody(params);
      const sources = new Map(body.segments.map((s) => [s.id, s.source]));
      return replyMessage(body.translate.map((id) => ({ id, text: sources.get(id).replace(/\bmenu\b/g, 'elenco') })));
    };
    const prepare = async (mode) => {
      const dir = copyFixtureProject();
      dirs.push(dir);
      writeJson(path.join(dir, 'ui', 'it.json'), { 'nav.backToTop': 'Torna su', 'nav.menu': 'Menu', 'nav.open': OPEN });
      const file = path.join(dir, 'glossary.json');
      const glossary = JSON.parse(fs.readFileSync(file, 'utf8'));
      writeJson(file, { ...glossary, do_not_translate: ['Menu'], ...(mode ? { do_not_translate_case: mode } : {}) });
      expect(await runCli(['extract'], { cwd: dir, env: {}, log: () => {}, errlog: () => {} })).toBe(0);
      return dir;
    };
    const machineOf = (dir) => {
      const file = path.join(dir, 'memory', 'machine', 'en.json');
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    };
    const rows = [
      { mode: 'sensitive', exit: 0, open: 'Apri il elenco' },
      { mode: undefined, exit: 1, open: undefined },
    ];
    for (const row of rows) {
      const io = capture();
      const syncDir = await prepare(row.mode);
      expect(await runCli(['translate'], { cwd: syncDir, env, ClientClass: fakeAnthropic({ reply }).FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(row.exit);
      expect(machineOf(syncDir)[keyOf(OPEN)]?.text).toBe(row.open);
      expect(machineOf(syncDir)[keyOf('Menu')].text).toBe('Menu');

      const batchDir = await prepare(row.mode);
      const fake = fakeAnthropic({ reply });
      expect(await runCli(['submit'], { cwd: batchDir, env, ClientClass: fake.FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(0);
      expect(await runCli(['collect'], { cwd: batchDir, env, ClientClass: fake.FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(0);
      expect(machineOf(batchDir)[keyOf(OPEN)]?.text).toBe(row.open);
      expect(machineOf(batchDir)[keyOf('Menu')].text).toBe('Menu');
    }
  });

  it('the synchronous transport writes what the SDK client returned, through the configured backend', async () => {
    const fake = fakeAnthropic();
    const dir = await extracted();
    const io = capture();
    expect(await runCli(['translate'], { cwd: dir, env: { ANTHROPIC_API_KEY: 'k' }, ClientClass: fake.FakeAnthropic, log: io.log, errlog: io.errlog })).toBe(0);
    const machine = JSON.parse(fs.readFileSync(path.join(dir, 'memory', 'machine', 'en.json'), 'utf8'));
    expect(Object.values(machine).map((e) => e.text).sort()).toEqual(
      ['Benvenuti', 'Menu', 'Primo paragrafo.', 'Scopri', 'Torna su', 'Una pagina di prova'].map((s) => `[${DEFAULT_MODEL}] ${s}`).sort()
    );
  });
});
