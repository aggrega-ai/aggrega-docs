import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runCli } from './cli.mjs';
import { ConfigError, LOCAL_DEFAULTS, localSettings, modeOf, parseConfig } from './config.mjs';
import { keyOf } from './normalize.mjs';
import { networkAttempts } from '../test/no-network.mjs';
import { capture, fakeAnthropic, fixtureConfig, FIXTURE_PROJECT, gitSandbox, refusalMessage, echoReply, writeJson } from '../test/helpers.mjs';

/**
 * local.test.mjs — The local mode's configuration keys, `l10n local`, and the
 * refusal of the CI-mode commands under the local mode (and of the local-mode
 * commands under the CI mode).
 *
 * READS the fixture project. WRITES only temporary copies of it, each a git
 * repository in a sandbox with its own empty git configuration. Every batch
 * client is the fake SDK client class: no request leaves the process.
 */

const LOCAL = {
  commands: ['npm run i18n:materialize', 'npm run prebuild'],
  paths: ['memory/machine/', 'content/en/', 'ui/en.json'],
};

/** The fixture's configuration in the local mode. */
const localConfig = (extra = {}) => ({ ...fixtureConfig(), mode: 'local', local: { ...LOCAL }, ...extra });

describe('the mode and local keys', () => {
  it('a configuration with no mode is a CI-mode one, parsed to the value it states', () => {
    const value = fixtureConfig();
    const parsed = parseConfig(value);
    expect(parsed.mode).toBeUndefined();
    expect(modeOf(parsed)).toBe('ci');
    const withCi = parseConfig({ ...value, ci: { branch: 'l10n-memory' }, sync: { commands: ['x'], paths: ['a/'] } });
    expect(modeOf(withCi)).toBe('ci');
  });

  it('a local-mode configuration carries local, with pollSeconds defaulting to 30', () => {
    const parsed = parseConfig(localConfig());
    expect(modeOf(parsed)).toBe('local');
    expect(localSettings(parsed.local)).toEqual({ ...LOCAL, pollSeconds: 30 });
    expect(LOCAL_DEFAULTS.pollSeconds).toBe(30);
    expect(localSettings(parseConfig({ ...localConfig(), local: { pollSeconds: 5 } }).local)).toEqual({ commands: [], paths: [], pollSeconds: 5 });
    expect(modeOf(parseConfig({ ...fixtureConfig(), mode: 'local' }))).toBe('local');
  });

  it('refuses ci in a local-mode configuration, naming the key', () => {
    expect(() => parseConfig(localConfig({ ci: { branch: 'l10n-memory' } }))).toThrow(ConfigError);
    expect(() => parseConfig(localConfig({ ci: { branch: 'l10n-memory' } }))).toThrow(/ {2}ci: must be absent when mode is "local"/);
  });

  it('refuses sync in a local-mode configuration, naming the key', () => {
    expect(() => parseConfig(localConfig({ sync: { commands: ['x'] } }))).toThrow(/ {2}sync: must be absent when mode is "local"/);
  });

  it('refuses local in a CI-mode configuration, naming the key, with mode absent or "ci"', () => {
    expect(() => parseConfig({ ...fixtureConfig(), local: { ...LOCAL } })).toThrow(/ {2}local: is read in the local mode only/);
    expect(() => parseConfig({ ...fixtureConfig(), mode: 'ci', local: { ...LOCAL } })).toThrow(/ {2}local: is read in the local mode only/);
  });

  it('refuses an unknown mode, a local path outside the project and an unknown local key', () => {
    expect(() => parseConfig({ ...fixtureConfig(), mode: 'cloud' })).toThrow(/ {2}mode: /);
    expect(() => parseConfig(localConfig({ local: { paths: ['../elsewhere/'] } }))).toThrow(/ {2}local\.paths\.0: must be a path inside the project/);
    expect(() => parseConfig(localConfig({ local: { interval: 3 } }))).toThrow(/ {2}local\.interval: unknown key/);
  });
});

/** The fixture's units, each with no English entry but the one the human layer carries. */
const MISSING = ['Benvenuti', 'Una pagina di prova', 'Scopri', 'Primo paragrafo.', 'Torna su', 'Menu'].map(keyOf);

let box;
let dir;

beforeEach(() => {
  box = gitSandbox('l10n-local-');
  dir = path.join(box.dir, 'site');
  fs.cpSync(FIXTURE_PROJECT, dir, { recursive: true });
});
afterEach(() => box.cleanup());

/** Commits the project as it stands, so a test can show `local` leaves the index as it was. */
function commitAll() {
  box.git(['init', '--quiet', '-b', 'main'], dir);
  box.git(['add', '-A'], dir);
  box.git(['commit', '--quiet', '-m', 'Site'], dir);
}

const writeConfig = (config) => writeJson(path.join(dir, 'l10n.config.json'), config);
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));

/** Runs `l10n local` with the fake client class, recording the commands it runs and the waits it takes. */
async function local({ fake = fakeAnthropic(), sleep, env = {}, argv = ['local'] } = {}) {
  const io = capture();
  const commands = [];
  const waits = [];
  const before = networkAttempts().length;
  const code = await runCli(argv, {
    cwd: dir,
    env: { ANTHROPIC_API_KEY: 'test-key', ...env },
    ClientClass: fake.FakeAnthropic,
    sleep: sleep || (async (ms) => void waits.push(ms)),
    runCommand: (command, opts) => {
      commands.push({ command, cwd: opts.cwd });
      return { status: 0 };
    },
    log: io.log,
    errlog: io.errlog,
  });
  expect(networkAttempts().slice(before)).toEqual([]);
  return { code, out: io.text(), err: io.errors(), commands, waits, fake };
}

describe('l10n local', () => {
  it('with nothing to translate, says so, creates no client, runs the commands and prints the paths', async () => {
    writeConfig(localConfig());
    const first = await local();
    expect(first.code).toBe(0);
    const second = await local();
    expect(second.code).toBe(0);
    expect(second.out).toContain('local: no translation needed: no batch submitted, no client created.');
    expect(second.fake.constructed).toEqual([]);
    expect(second.fake.calls.batchCreate).toEqual([]);
    expect(second.commands.map((c) => c.command)).toEqual(LOCAL.commands);
    expect(second.out).toContain('git add -- memory/machine/ content/en/ ui/en.json');
  });

  it('submits one batch, polls it every pollSeconds until it ends, collects it, runs the commands and prints the paths, with the git index untouched', async () => {
    writeConfig(localConfig());
    commitAll();
    const indexBefore = fs.readFileSync(path.join(dir, '.git', 'index'));
    let retrievals = 0;
    const fake = fakeAnthropic({ status: () => (++retrievals <= 2 ? 'in_progress' : 'ended') });
    const run = await local({ fake });
    expect(run.code).toBe(0);
    expect(fake.calls.batchCreate).toHaveLength(1);
    expect(fake.calls.create).toEqual([]);
    expect(fake.calls.retrieve).toHaveLength(3);
    expect(run.waits).toEqual([30000, 30000]);
    const progress = run.out.split('\n').filter((l) => /^collect: batch msgbatch_fake1 is in_progress, 1 request\(s\) processing; left recorded\.$/.test(l));
    expect(progress).toHaveLength(2);
    expect(run.out).toContain('collect: batch msgbatch_fake1 ended');
    expect(Object.keys(readJson('memory/machine/en.json')).sort()).toEqual([...MISSING].sort());
    expect(readJson('memory/pending.json').batches).toEqual([]);
    expect(run.commands).toEqual(LOCAL.commands.map((command) => ({ command, cwd: dir })));
    expect(run.out).toContain('  git add -- memory/machine/ content/en/ ui/en.json');
    expect(run.out).toContain('  git commit');
    expect(fs.readFileSync(path.join(dir, '.git', 'index'))).toEqual(indexBefore);
    expect(box.git(['diff', '--cached', '--name-only'], dir)).toBe('');
    expect(box.git(['log', '--format=%s'], dir)).toBe('Site');
  });

  it('polls at local.pollSeconds when the configuration sets it', async () => {
    writeConfig(localConfig({ local: { ...LOCAL, pollSeconds: 5 } }));
    let retrievals = 0;
    const run = await local({ fake: fakeAnthropic({ status: () => (++retrievals <= 1 ? 'in_progress' : 'ended') }) });
    expect(run.code).toBe(0);
    expect(run.waits).toEqual([5000]);
  });

  it('resumes an interrupted run: the second run submits nothing and polls the recorded batch', async () => {
    writeConfig(localConfig());
    let ended = false;
    const fake = fakeAnthropic({ status: () => (ended ? 'ended' : 'in_progress') });
    const interrupted = await local({
      fake,
      sleep: async () => {
        throw new Error('interrupted');
      },
    }).catch((err) => err);
    expect(interrupted).toBeInstanceOf(Error);
    expect(interrupted.message).toBe('interrupted');
    expect(fake.calls.batchCreate).toHaveLength(1);
    expect(readJson('memory/pending.json').batches.map((b) => b.id)).toEqual(['msgbatch_fake1']);

    ended = true;
    const resumed = await local({ fake });
    expect(resumed.code).toBe(0);
    expect(fake.calls.batchCreate).toHaveLength(1);
    expect(resumed.out).not.toContain('submit: batch');
    expect(resumed.out).toContain('collect: batch msgbatch_fake1 ended');
    expect(readJson('memory/pending.json').batches).toEqual([]);
    expect(Object.keys(readJson('memory/machine/en.json')).sort()).toEqual([...MISSING].sort());
  });

  it('resubmits a segment the model refused, in a second batch, until nothing is missing', async () => {
    writeConfig(localConfig());
    let batches = 0;
    const fake = fakeAnthropic({
      result: (params, request) => {
        if (request.custom_id.startsWith('000000') && batches === 1) return { type: 'succeeded', message: refusalMessage() };
        return { type: 'succeeded', message: echoReply(params) };
      },
    });
    const create = fake.FakeAnthropic;
    class Counting extends create {
      constructor(options) {
        super(options);
        const inner = this.messages.batches.create;
        this.messages.batches.create = async (body) => {
          batches += 1;
          return inner(body);
        };
      }
    }
    const run = await local({ fake: { ...fake, FakeAnthropic: Counting } });
    expect(run.code).toBe(0);
    expect(fake.calls.batchCreate).toHaveLength(2);
    const resubmitted = fake.calls.batchCreate[1].requests;
    expect(resubmitted).toHaveLength(1);
    expect(JSON.stringify(resubmitted[0].params.messages)).toContain('replyCorrections');
    expect(Object.keys(readJson('memory/machine/en.json')).sort()).toEqual([...MISSING].sort());
  });

  it('enforces the per-submission budgets across submissions: one request per batch when one fits', async () => {
    writeConfig(localConfig());
    const dry = capture();
    expect(await runCli(['extract'], { cwd: dir, env: {}, log: () => {}, errlog: () => {} })).toBe(0);
    expect(await runCli(['submit', '--dry-run'], { cwd: dir, env: {}, log: dry.log, errlog: dry.errlog })).toBe(0);
    const estimates = [...dry.text().matchAll(/request \d+: .*: estimated input (\d+) .*, output (\d+)/g)].map((m) => ({ input: Number(m[1]), output: Number(m[2]) }));
    expect(estimates.length).toBeGreaterThanOrEqual(2);
    const inputTokens = Math.max(...estimates.map((e) => e.input));
    const outputTokens = Math.max(...estimates.map((e) => e.output));
    const config = localConfig();
    config.backend = { kind: 'anthropic', submission: { inputTokens, outputTokens } };
    writeConfig(config);
    const fake = fakeAnthropic();
    const run = await local({ fake });
    expect(run.code).toBe(0);
    expect(fake.calls.batchCreate).toHaveLength(estimates.length);
    for (const body of fake.calls.batchCreate) expect(body.requests).toHaveLength(1);
    expect(Object.keys(readJson('memory/machine/en.json')).sort()).toEqual([...MISSING].sort());
  });

  it('stops on a refused submission — no API key — with no batch, no command and exit 1', async () => {
    writeConfig(localConfig());
    const run = await local({ env: { ANTHROPIC_API_KEY: '' } });
    expect(run.code).toBe(1);
    expect(run.err).toContain('local: the submission was refused (missing-key)');
    expect(run.fake.calls.batchCreate).toEqual([]);
    expect(run.commands).toEqual([]);
  });

  it('stops when a derived command fails, naming it, with exit 1', async () => {
    writeConfig(localConfig());
    const io = capture();
    const fake = fakeAnthropic();
    const code = await runCli(['local'], {
      cwd: dir,
      env: { ANTHROPIC_API_KEY: 'test-key' },
      ClientClass: fake.FakeAnthropic,
      sleep: async () => {},
      runCommand: () => ({ status: 3 }),
      log: io.log,
      errlog: io.errlog,
    });
    expect(code).toBe(1);
    expect(io.errors()).toContain('local: the derived command "npm run i18n:materialize" failed (exit 3).');
  });
});

describe('the commands of one mode refuse the other mode', () => {
  /** Runs `argv` with no git reachable (an empty PATH), a fake client class and a recording fetch. */
  async function refused(argv) {
    const io = capture();
    const fake = fakeAnthropic();
    const requests = [];
    const before = networkAttempts().length;
    const code = await runCli(argv, {
      cwd: dir,
      env: { PATH: '', ANTHROPIC_API_KEY: 'test-key', GITHUB_TOKEN: 'ghs_x', L10N_GIT_READ_TOKEN: 'ghs_y' },
      ClientClass: fake.FakeAnthropic,
      fetchImpl: async (url) => {
        requests.push(url);
        return { status: 204 };
      },
      sleep: async () => {},
      cycles: 1,
      stdin: '',
      log: io.log,
      errlog: io.errlog,
    });
    expect(fake.constructed).toEqual([]);
    expect(requests).toEqual([]);
    expect(networkAttempts().slice(before)).toEqual([]);
    return { code, err: io.errors(), out: io.text() };
  }

  for (const cmd of ['ci', 'overlay', 'sync', 'watch']) {
    it(`l10n ${cmd} exits 2 under a local-mode configuration, naming the mode, before any git command`, async () => {
      writeConfig(localConfig());
      const run = await refused([cmd]);
      expect(run.code).toBe(2);
      // The one line printed is the refusal: with no git on the path, a git command would have printed "could not run git".
      expect(run.err).toBe(`${cmd}: the configuration's mode is "local": this project translates with \`l10n local\` and keeps no CI branch, so \`l10n ${cmd}\` does not run. Nothing was read or written.`);
    });
  }

  for (const cmd of ['local', 'prepush']) {
    it(`l10n ${cmd} exits 2 under a CI-mode configuration, naming the mode`, async () => {
      writeConfig({ ...fixtureConfig(), ci: { branch: 'l10n-memory' } });
      const run = await refused([cmd]);
      expect(run.code).toBe(2);
      expect(run.err).toBe(`${cmd}: the configuration's mode is "ci": \`l10n ${cmd}\` belongs to the local mode (\`"mode": "local"\`). Nothing was read or written.`);
    });
  }

  it('the CI-mode commands still run as before under a configuration with no mode: ci reaches git', async () => {
    writeConfig({ ...fixtureConfig(), ci: { branch: 'l10n-memory' } });
    const run = await refused(['ci']);
    expect(run.code).toBe(1);
    expect(run.err).toContain('could not run git');
  });
});
