import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runCli } from './cli.mjs';
import { keyOf } from './normalize.mjs';
import { localCommandOf, parsePushLines } from './prepush.mjs';
import { batchCostUpperBound, formatUsd } from './cost.mjs';
import { networkAttempts } from '../test/no-network.mjs';
import { capture, fakeAnthropic, fixtureConfig, FIXTURE_PROJECT, gitSandbox, writeJson } from '../test/helpers.mjs';

/**
 * prepush.test.mjs — `l10n prepush`, the local mode's push check, in temporary
 * git repositories: each refusal, the pass, the working-tree case, a branch
 * deletion, and the message.
 *
 * READS the fixture project. WRITES only temporary repositories in a sandbox
 * with its own empty git configuration, and the worktrees the check adds and
 * removes. The translations the passing cases need are made by `l10n local`
 * with the fake SDK client class; the check itself is handed the same class
 * and is shown to construct no client and to make no network attempt.
 */

const ZERO = '0'.repeat(40);
const PATHS = ['memory/machine/', 'content/en/', 'ui/en.json'];
const NEXT = (local = 'npx l10n local') => ['prepush: the push is refused. Next:', `  1. ${local}`, `  2. git add -- ${PATHS.join(' ')}`, '  3. git commit'].join('\n');

let box;
let dir;

beforeEach(() => {
  box = gitSandbox('l10n-prepush-');
  dir = path.join(box.dir, 'site');
  fs.cpSync(FIXTURE_PROJECT, dir, { recursive: true });
  writeJson(path.join(dir, 'l10n.config.json'), { ...fixtureConfig(), mode: 'local', local: { commands: [], paths: PATHS } });
  fs.writeFileSync(path.join(dir, '.gitignore'), 'memory/pending.json\nmemory/jobs/\nmemory/generated/\n');
  box.git(['init', '--quiet', '-b', 'main'], dir);
  commit('Site content');
});
afterEach(() => box.cleanup());

function commit(message) {
  box.git(['add', '-A'], dir);
  box.git(['commit', '--quiet', '--allow-empty', '-m', message], dir);
  return box.git(['rev-parse', 'HEAD'], dir);
}

const head = () => box.git(['rev-parse', 'HEAD'], dir);
const pushLine = (sha, ref = 'refs/heads/main') => `${ref} ${sha} ${ref} ${ZERO}\n`;

/** Translates the working tree with `l10n local` and the fake client, then materializes the targets, and commits. */
async function translateAndCommit() {
  const fake = fakeAnthropic();
  const quiet = { log: () => {}, errlog: () => {} };
  expect(await runCli(['local'], { cwd: dir, env: { ANTHROPIC_API_KEY: 'test-key' }, ClientClass: fake.FakeAnthropic, sleep: async () => {}, ...quiet })).toBe(0);
  expect(await runCli(['materialize'], { cwd: dir, env: {}, ...quiet })).toBe(0);
  return commit('Translate');
}

/** Runs `l10n prepush` with `argv` and `stdin`, asserting it builds no client and attempts no network access. */
async function prepush({ argv = [], stdin = '' } = {}) {
  const io = capture();
  const fake = fakeAnthropic();
  const before = networkAttempts().length;
  const code = await runCli(['prepush', ...argv], { cwd: dir, env: { ...box.env, ANTHROPIC_API_KEY: 'test-key' }, ClientClass: fake.FakeAnthropic, stdin, log: io.log, errlog: io.errlog });
  expect(fake.constructed).toEqual([]);
  expect(networkAttempts().slice(before)).toEqual([]);
  expect(box.git(['worktree', 'list', '--porcelain'], dir).split('\n').filter((l) => l.startsWith('worktree '))).toHaveLength(1);
  return { code, out: io.text(), err: io.errors() };
}

describe('l10n prepush refuses', () => {
  it('a pushed commit with untranslated units, naming per locale the units, the pages and the batch cost, then the drift and the next three steps', async () => {
    const sha = head();
    const run = await prepush({ argv: ['origin', 'file:///remote.git'], stdin: pushLine(sha) });
    expect(run.code).toBe(1);
    const lines = run.err.split('\n');
    expect(lines[0]).toBe(`prepush: ${sha.slice(0, 12)} (refs/heads/main) is not fully translated:`);
    expect(lines[1]).toMatch(
      /^ {2}en: 6 units missing on 2 pages \(content\/it\/home\.json, ui\/it\.json\); at most USD \d+\.\d\d at the Message Batches rates of claude-opus-5-5 read on 2026-10-17 \(estimated (\d+) input and (\d+) output tokens\)$/
    );
    const [, input, output] = lines[1].match(/estimated (\d+) input and (\d+) output tokens/);
    expect(lines[1]).toContain(formatUsd(batchCostUpperBound({ model: 'claude-opus-5-5', input: Number(input), output: Number(output) })));
    expect(run.err).toContain('  the committed targets differ from their regeneration:');
    expect(run.err.endsWith(NEXT())).toBe(true);
  });

  it('a pushed commit whose committed targets lag their regeneration — a stale leaf alone — which verify-drift itself passes', async () => {
    await translateAndCommit();
    const human = path.join(dir, 'memory', 'messages', 'en.json');
    const layer = JSON.parse(fs.readFileSync(human, 'utf8'));
    const key = keyOf('Benvenuti');
    layer[key] = { at: '2026-10-18T00:00:00.000Z', srcHash: key, status: 'human', text: 'Welcome, reader' };
    writeJson(human, layer);
    const sha = commit('Correct a translation without materializing');

    const drift = capture();
    expect(await runCli(['verify-drift'], { cwd: dir, env: {}, log: drift.log, errlog: drift.errlog })).toBe(0);
    expect(drift.text()).toContain('stale: ');

    const run = await prepush({ stdin: pushLine(sha) });
    expect(run.code).toBe(1);
    expect(run.err).not.toMatch(/units? missing/);
    expect(run.err).toContain('  the committed targets differ from their regeneration: 1 stale leaf');
    expect(run.err).toContain('    stale: content en/home.json seo.title');
    expect(run.err.endsWith(NEXT())).toBe(true);
  });

  it('a pushed commit with a hand-edited target', async () => {
    await translateAndCommit();
    const target = path.join(dir, 'content', 'en', 'home.json');
    const page = JSON.parse(fs.readFileSync(target, 'utf8'));
    page.blocks[1].data.paragraphs[0] = 'Typed by hand.';
    writeJson(target, page);
    const sha = commit('Edit a target');
    const run = await prepush({ stdin: pushLine(sha) });
    expect(run.code).toBe(1);
    expect(run.err).toContain('1 hand-edited leaf');
    expect(run.err).toContain('    hand-edited: content en/home.json blocks[1].data.paragraphs[0]');
  });

  it('a push while a batch is recorded, saying to finish it with the local command — the project’s npm script when it has one', async () => {
    const sha = await translateAndCommit();
    writeJson(path.join(dir, 'memory', 'pending.json'), { batches: [{ id: 'msgbatch_inflight', createdAt: '2026-10-18T00:00:00Z', requests: {} }], queue: {} });
    const bare = await prepush({ stdin: pushLine(sha) });
    expect(bare.code).toBe(1);
    expect(bare.out).toContain(`prepush: ${sha.slice(0, 12)} (refs/heads/main) is fully translated.`);
    expect(bare.err).toContain('prepush: batch msgbatch_inflight is recorded in memory/pending.json and not yet collected: finish it with `npx l10n local` before pushing.');
    expect(bare.err.endsWith(NEXT())).toBe(true);

    writeJson(path.join(dir, 'package.json'), { name: 'site', private: true, scripts: { 'i18n:check': 'l10n gate --check', 'i18n:local': 'l10n local' } });
    const scripted = await prepush({ stdin: pushLine(sha) });
    expect(scripted.code).toBe(1);
    expect(scripted.err).toContain('finish it with `npm run i18n:local` before pushing.');
    expect(scripted.err.endsWith(NEXT('npm run i18n:local'))).toBe(true);
  });

  it('a commit named on the command line, as the check workflow names the pushed one', async () => {
    const untranslated = head();
    const translated = await translateAndCommit();
    expect((await prepush({ argv: [untranslated] })).code).toBe(1);
    const pass = await prepush({ argv: [translated] });
    expect(pass.code).toBe(0);
    expect(pass.out).toContain(`prepush: ${translated.slice(0, 12)} (${translated}) is fully translated.`);
  });

  it('every pushed ref: one untranslated tip among two refuses the push', async () => {
    const untranslated = head();
    const translated = await translateAndCommit();
    const run = await prepush({ stdin: pushLine(translated) + pushLine(untranslated, 'refs/heads/old') });
    expect(run.code).toBe(1);
    expect(run.out).toContain(`${translated.slice(0, 12)} (refs/heads/main) is fully translated.`);
    expect(run.err).toContain(`${untranslated.slice(0, 12)} (refs/heads/old) is not fully translated:`);
  });
});

describe('l10n prepush allows', () => {
  it('a fully translated pushed commit, with no batch recorded', async () => {
    const sha = await translateAndCommit();
    const run = await prepush({ argv: ['origin', 'file:///remote.git'], stdin: pushLine(sha) });
    expect(run.code).toBe(0);
    expect(run.err).toBe('');
    expect(run.out).toContain('prepush: the pushed commit is fully translated.');
  });

  it('GIVEN uncommitted Italian edits in the working tree and a fully translated HEAD, the push, and leaves the working tree as it was', async () => {
    const sha = await translateAndCommit();
    const source = path.join(dir, 'content', 'it', 'home.json');
    const page = JSON.parse(fs.readFileSync(source, 'utf8'));
    page.blocks[1].data.paragraphs.push('Un paragrafo nuovo, non ancora tradotto.');
    writeJson(source, page);
    const edited = fs.readFileSync(source, 'utf8');
    const run = await prepush({ stdin: pushLine(sha) });
    expect(run.code).toBe(0);
    expect(fs.readFileSync(source, 'utf8')).toBe(edited);
    expect(box.git(['status', '--porcelain'], dir)).toBe('M content/it/home.json');
  });

  it('a push that deletes a branch, even over an untranslated tree', async () => {
    const sha = head();
    const run = await prepush({ stdin: `(delete) ${ZERO} refs/heads/old ${sha}\n` });
    expect(run.code).toBe(0);
    expect(run.out).toContain('prepush: refs/heads/old is deleted: nothing to judge.');
    expect(run.out).toContain('prepush: no commit is pushed: nothing to judge.');
  });
});

describe('l10n prepush cannot judge', () => {
  it('a commit git does not know, or more than two arguments: exit 2', async () => {
    expect((await prepush({ argv: ['0123456789abcdef0123456789abcdef01234567'] })).code).toBe(2);
    expect((await prepush({ argv: ['a', 'b', 'c'] })).code).toBe(2);
  });
});

describe('the helpers', () => {
  it('parsePushLines reads git’s four fields and marks a deletion', () => {
    expect(parsePushLines(`refs/heads/a 1111 refs/heads/a ${ZERO}\n(delete) ${ZERO} refs/heads/b 2222\n\nnot a line\n`)).toEqual([
      { localRef: 'refs/heads/a', localSha: '1111', remoteRef: 'refs/heads/a', remoteSha: ZERO, deletes: false },
      { localRef: '(delete)', localSha: ZERO, remoteRef: 'refs/heads/b', remoteSha: '2222', deletes: true },
    ]);
  });

  it('localCommandOf names the npm script that runs l10n local, else npx', () => {
    const at = path.join(box.dir, 'manifest');
    fs.mkdirSync(at);
    expect(localCommandOf([at])).toBe('npx l10n local');
    writeJson(path.join(at, 'package.json'), { scripts: { build: 'vite build', 'translate:here': 'l10n local --config l/l10n.config.json' } });
    expect(localCommandOf([at])).toBe('npm run translate:here');
  });

  it('the cost is an upper bound at the one-hour cache-write and output rates, and none for a model with no rate', () => {
    expect(batchCostUpperBound({ model: 'claude-opus-5-5', input: 1_000_000, output: 1_000_000 })).toBe(14);
    expect(batchCostUpperBound({ model: 'claude-sonnet-5-5', input: 1_000_000, output: 1_000_000 })).toBe(7);
    expect(batchCostUpperBound({ model: 'a-model-with-no-rate', input: 1, output: 1 })).toBeNull();
    expect(formatUsd(0.004)).toBe('under USD 0.01');
    expect(formatUsd(1.234)).toBe('USD 1.23');
  });
});
