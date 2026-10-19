import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { InternalServerError } from '@anthropic-ai/sdk';

import { runCli } from './cli.mjs';
import { CI_COMMIT_MESSAGE } from './ci.mjs';
import { gitEnvironment, redactCredentials } from './git.mjs';
import { keyOf } from './normalize.mjs';
import { networkAttempts } from '../test/no-network.mjs';
import { capture, echoReply, failingWrites, FIXTURE_PROJECT, fakeAnthropic, gitSandbox, requestBody, writeJson } from '../test/helpers.mjs';

const CI_BRANCH = 'l10n-memory';
const WORKING = 'lovable';
const TOKEN = 'ghs_testtokennotasecret';

/** The fixture's units with no English entry: every unit but the one the human layer carries. */
const MISSING = ['Benvenuti', 'Una pagina di prova', 'Scopri', 'Primo paragrafo.', 'Torna su', 'Menu'].map(keyOf);

let box;
let remote;
let runs;

/**
 * A working branch on a bare remote: the fixture project, with a `ci` key and
 * its catalogue, committed on `lovable` and pushed.
 */
function seedRemote({ ci = { branch: CI_BRANCH, dispatch: { workflow: 'deploy-dev.yml', ref: WORKING } } } = {}) {
  remote = path.join(box.dir, 'remote.git');
  box.git(['init', '--quiet', '--bare', '-b', WORKING, remote]);
  const seed = path.join(box.dir, 'seed');
  fs.cpSync(FIXTURE_PROJECT, seed, { recursive: true });
  const configPath = path.join(seed, 'l10n.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (ci) config.ci = ci;
  writeJson(configPath, config);
  box.git(['init', '--quiet', '-b', WORKING], seed);
  box.git(['add', '-A'], seed);
  box.git(['commit', '--quiet', '-m', 'Site content'], seed);
  box.git(['remote', 'add', 'origin', `file://${remote}`], seed);
  box.git(['push', '--quiet', 'origin', WORKING], seed);
}

/** A fresh clone of the working branch, as a CI runner checks it out. */
function checkout() {
  runs += 1;
  const dir = path.join(box.dir, `run-${runs}`);
  box.git(['clone', '--quiet', '--branch', WORKING, `file://${remote}`, dir]);
  return dir;
}

const remoteHead = (branch) => box.git(['ls-remote', remote, `refs/heads/${branch}`]).split('\t')[0] || null;
const remoteGit = (args) => box.git([`--git-dir=${remote}`, ...args]);
const readOnBranch = (file) => JSON.parse(remoteGit(['show', `${CI_BRANCH}:${file}`]));

/**
 * A recorder of GitHub REST requests in place of `fetch`: nothing is sent.
 * `statusFor(url, method)` is the status each request is answered with.
 */
function githubRecorder(statusFor = () => 204) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, method: init.method, headers: init.headers, ...(init.body !== undefined ? { body: JSON.parse(init.body) } : {}) });
    const status = statusFor(url, init.method);
    return { ok: status >= 200 && status < 300, status };
  };
  return { requests, fetchImpl };
}

/** A recorder answering every request with `status`. */
const dispatchRecorder = (status = 204) => githubRecorder(() => status);

async function ci(dir, deps = {}) {
  const io = capture();
  const env = {
    ...box.env,
    ANTHROPIC_API_KEY: 'test-key',
    GITHUB_TOKEN: TOKEN,
    GITHUB_REPOSITORY: 'owner/site',
    GITHUB_API_URL: 'https://api.github.invalid',
    ...(deps.env || {}),
  };
  const code = await runCli([deps.command || 'ci'], { cwd: dir, env, log: io.log, errlog: io.errlog, ...deps, env });
  return { code, out: io.text(), err: io.errors() };
}

beforeEach(() => {
  box = gitSandbox('l10n-ci-');
  runs = 0;
});

afterEach(() => {
  box.cleanup();
});

describe('l10n ci: three runs against a bare remote', () => {
  it('submits and pushes a pending batch, then collects, pushes and dispatches, then does nothing; the working branch never moves', async () => {
    seedRemote();
    const workingBefore = remoteHead(WORKING);
    const fake = fakeAnthropic();
    const dispatch = dispatchRecorder();
    const deps = { ClientClass: fake.FakeAnthropic, fetchImpl: dispatch.fetchImpl };

    // Run 1: no CI branch yet; the submission is recorded and pushed on an orphan branch.
    const first = checkout();
    const r1 = await ci(first, deps);
    expect(r1.err).toBe('');
    expect(r1.code).toBe(0);
    expect(fake.calls.batchCreate).toHaveLength(1);
    const c1 = remoteHead(CI_BRANCH);
    expect(c1).toMatch(/^[0-9a-f]{40}$/);
    expect(remoteGit(['rev-list', '--count', CI_BRANCH])).toBe('1');
    expect(remoteGit(['ls-tree', '-r', '--name-only', CI_BRANCH]).split('\n')).toEqual(['memory/pending.json']);
    expect(readOnBranch('memory/pending.json').batches.map((b) => b.id)).toEqual(['msgbatch_fake1']);
    expect(remoteGit(['log', '-1', '--format=%B', CI_BRANCH])).toBe(CI_COMMIT_MESSAGE);
    expect(CI_COMMIT_MESSAGE).not.toContain('\n');
    expect(dispatch.requests).toHaveLength(0);

    // Run 2: the batch has ended; the machine layer is written, the batch cleared, the deploy dispatched.
    const second = checkout();
    const r2 = await ci(second, deps);
    expect(r2.err).toBe('');
    expect(r2.code).toBe(0);
    expect(fake.calls.retrieve).toEqual(['msgbatch_fake1']);
    const c2 = remoteHead(CI_BRANCH);
    expect(c2).not.toBe(c1);
    expect(remoteGit(['rev-parse', `${CI_BRANCH}^`])).toBe(c1);
    expect(remoteGit(['ls-tree', '-r', '--name-only', CI_BRANCH]).split('\n')).toEqual(['memory/machine/en.json', 'memory/pending.json']);
    expect(readOnBranch('memory/pending.json')).toEqual({ batches: [], queue: {} });
    expect(Object.keys(readOnBranch('memory/machine/en.json')).sort()).toEqual([...MISSING].sort());
    expect(dispatch.requests).toEqual([
      {
        url: 'https://api.github.invalid/repos/owner/site/actions/workflows/deploy-dev.yml/dispatches',
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
        body: { ref: WORKING },
      },
    ]);

    // Run 3: nothing to collect, nothing to submit: no client, no commit, no push, no dispatch.
    const constructed = fake.constructed.length;
    const calls = JSON.stringify(fake.calls);
    const third = checkout();
    const r3 = await ci(third, deps);
    expect(r3.code).toBe(0);
    expect(fake.constructed).toHaveLength(constructed);
    expect(JSON.stringify(fake.calls)).toBe(calls);
    expect(remoteHead(CI_BRANCH)).toBe(c2);
    expect(r3.out).toContain('ci: the machine layer and the pending file are unchanged: no commit, no push.');
    expect(dispatch.requests).toHaveLength(1);

    // The working branch: the remote's head is the one seeded, and no run made a local branch or a commit on it.
    expect(remoteHead(WORKING)).toBe(workingBefore);
    for (const dir of [first, second, third]) {
      expect(box.git(['rev-parse', 'HEAD'], dir)).toBe(workingBefore);
      expect(box.git(['branch', '--list'], dir)).toBe(`* ${WORKING}`);
    }

    // The token is never printed, in either form git or the dispatch would use.
    const printed = [r1, r2, r3].map((r) => r.out + r.err).join('\n');
    expect(printed).not.toContain(TOKEN);
    expect(printed).not.toContain(Buffer.from(`x-access-token:${TOKEN}`).toString('base64'));
    expect(networkAttempts()).toEqual([]);
  });

  it('leaves a batch that has not ended recorded: no submission, no commit, exit 0', async () => {
    seedRemote();
    let processing = 'in_progress';
    const fake = fakeAnthropic({ status: () => processing });
    const deps = { ClientClass: fake.FakeAnthropic, fetchImpl: dispatchRecorder().fetchImpl };
    expect((await ci(checkout(), deps)).code).toBe(0);
    const c1 = remoteHead(CI_BRANCH);

    const r = await ci(checkout(), deps);
    expect(r.code).toBe(0);
    expect(r.out).toContain('ci: batch msgbatch_fake1 has not ended: no submission until it is collected.');
    expect(fake.calls.batchCreate).toHaveLength(1);
    expect(remoteHead(CI_BRANCH)).toBe(c1);

    processing = 'ended';
    expect((await ci(checkout(), deps)).code).toBe(0);
    expect(readOnBranch('memory/pending.json').batches).toEqual([]);
  });

  it('dispatches nothing when the configuration names no dispatch', async () => {
    seedRemote({ ci: { branch: CI_BRANCH } });
    const fake = fakeAnthropic();
    const dispatch = dispatchRecorder();
    const deps = { ClientClass: fake.FakeAnthropic, fetchImpl: dispatch.fetchImpl };
    expect((await ci(checkout(), deps)).code).toBe(0);
    const r = await ci(checkout(), deps);
    expect(r.code).toBe(0);
    expect(Object.keys(readOnBranch('memory/machine/en.json'))).toHaveLength(MISSING.length);
    expect(dispatch.requests).toHaveLength(0);
  });

  it('exits 1 when the dispatch is refused, after the push', async () => {
    seedRemote();
    const fake = fakeAnthropic();
    const deps = { ClientClass: fake.FakeAnthropic, fetchImpl: dispatchRecorder(403).fetchImpl };
    expect((await ci(checkout(), deps)).code).toBe(0);
    const r = await ci(checkout(), deps);
    expect(r.code).toBe(1);
    expect(r.err).toContain('was answered 403');
    expect(readOnBranch('memory/pending.json').batches).toEqual([]);
  });

  it('refuses to run with the CI branch checked out, writing nothing', async () => {
    seedRemote();
    const dir = checkout();
    box.git(['checkout', '--quiet', '-b', CI_BRANCH], dir);
    const fake = fakeAnthropic();
    const r = await ci(dir, { ClientClass: fake.FakeAnthropic, fetchImpl: dispatchRecorder().fetchImpl });
    expect(r.code).toBe(2);
    expect(r.err).toContain(`the checked-out branch is the CI branch "${CI_BRANCH}"`);
    expect(remoteHead(CI_BRANCH)).toBe(null);
    expect(fake.constructed).toHaveLength(0);
  });

  it('exits 2 naming the key when the configuration has no ci key', async () => {
    seedRemote({ ci: null });
    const r = await ci(checkout(), { fetchImpl: dispatchRecorder().fetchImpl });
    expect(r.code).toBe(2);
    expect(r.err).toContain('ci: the configuration has no "ci" key');
  });
});

/** A distinctive API key, so a test can show it is never printed. */
const KEY = 'sk-ant-api-key-not-a-secret';

/** Makes the bare remote refuse every later push, as a ruleset refusing the job's token would. */
function refusePushes() {
  const hook = path.join(remote, 'hooks', 'pre-receive');
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.writeFileSync(hook, '#!/bin/sh\necho "refused: the CI branch is protected in this test" >&2\nexit 1\n', { mode: 0o755 });
}

/**
 * The grid of a run's two conditions — did `submit` create a batch in this run,
 * and did the push of the CI branch succeed — plus the one cell where the
 * cancellation itself fails, which only a refused push after a submission can
 * reach. A run that submitted a batch always has a commit to push, since the
 * pending file changed, so "submitted, nothing to push" cannot occur.
 */
const PUSH_GRID = [
  {
    name: 'cancels the batch it submitted when the push of the CI branch is refused, prints its id and exits 1',
    submitted: true,
    refused: true,
    cancelFails: false,
  },
  {
    name: 'prints the batch id and that it could not be canceled when the push is refused and the cancellation fails, and exits 1',
    submitted: true,
    refused: true,
    cancelFails: true,
  },
  {
    name: 'cancels nothing when the push is refused in a run that submitted no batch, and exits 1',
    submitted: false,
    refused: true,
    cancelFails: false,
  },
  {
    name: 'cancels nothing when the push succeeds after a submission',
    submitted: true,
    refused: false,
    cancelFails: false,
  },
  {
    name: 'cancels nothing when the push succeeds in a run that submitted no batch',
    submitted: false,
    refused: false,
    cancelFails: false,
  },
];

describe('l10n ci: a batch submitted in the run or not, and a push accepted or refused', () => {
  for (const { name, submitted, refused, cancelFails } of PUSH_GRID) {
    it(name, async () => {
      seedRemote();
      const fake = fakeAnthropic(
        cancelFails
          ? {
              // The SDK's own error class, whose message carries the API's answer verbatim — here, both credentials.
              cancel: () => {
                throw new InternalServerError(500, { type: 'error', error: { type: 'api_error', message: `echo ${TOKEN} ${KEY}` } }, undefined, new Headers());
              },
            }
          : {}
      );
      const dispatch = dispatchRecorder();
      const deps = { ClientClass: fake.FakeAnthropic, fetchImpl: dispatch.fetchImpl, env: { ANTHROPIC_API_KEY: KEY } };

      // A run that submits no batch is one that collects: a first, accepted run submits the batch it collects.
      if (!submitted) {
        expect((await ci(checkout(), deps)).code).toBe(0);
        expect(fake.calls.batchCreate).toHaveLength(1);
      }
      const before = remoteHead(CI_BRANCH);
      const dispatchesBefore = dispatch.requests.length;
      if (refused) refusePushes();

      const r = await ci(checkout(), deps);
      const printed = r.out + '\n' + r.err;

      // The cell is the one its name says: a batch created in this run, or none.
      expect(fake.calls.batchCreate).toHaveLength(1);
      if (!submitted) expect(fake.calls.retrieve).toEqual(['msgbatch_fake1']);

      if (submitted && refused) {
        expect(fake.calls.cancel).toEqual(['msgbatch_fake1']);
      } else {
        expect(fake.calls.cancel).toEqual([]);
      }

      if (refused) {
        expect(r.code).toBe(1);
        expect(r.err).toContain('ci: git push failed');
        // Nothing reached the remote: no CI branch on a first run, the same commit otherwise.
        expect(remoteHead(CI_BRANCH)).toBe(before);
        expect(dispatch.requests).toHaveLength(dispatchesBefore);
      } else {
        expect(r.code).toBe(0);
        expect(r.err).toBe('');
        expect(remoteHead(CI_BRANCH)).toMatch(/^[0-9a-f]{40}$/);
        expect(remoteHead(CI_BRANCH)).not.toBe(before);
      }

      if (submitted && refused && !cancelFails) {
        expect(r.err).toContain(
          'ci: nothing reached l10n-memory, so batch msgbatch_fake1, submitted in this run, was canceled: the API accepted the cancellation (processing status: canceling)'
        );
      }
      if (cancelFails) {
        expect(r.err).toContain(
          'ci: nothing reached l10n-memory, and batch msgbatch_fake1, submitted in this run, could NOT be canceled (InternalServerError, HTTP 500): ' +
            "it is recorded only in this checkout's memory/pending.json"
        );
      }
      if (!submitted && refused) expect(r.err).toContain('ci: nothing reached l10n-memory; no batch was submitted in this run.');
      if (!refused) expect(printed).not.toContain('nothing reached');

      expect(printed).not.toContain(TOKEN);
      expect(printed).not.toContain(Buffer.from(`x-access-token:${TOKEN}`).toString('base64'));
      expect(printed).not.toContain(KEY);
      expect(networkAttempts()).toEqual([]);
    });
  }
});

/** The fixture's units on the home page, which the first batch's results leave errored. */
const HOME = ['Benvenuti', 'Una pagina di prova', 'Scopri', 'Primo paragrafo.'].map(keyOf);
const UI = ['Torna su', 'Menu'].map(keyOf);

/**
 * A run that collects and then submits, whose submission cannot be recorded:
 * the first batch's results translate the UI and leave the home page errored, so
 * the run under test applies the UI translations and resubmits the home page as
 * a second batch, whose write of the pending file fails. The push then succeeds
 * or is refused. The second cell carries the refused push as its own condition,
 * because only a run whose `submit` already failed to record reaches it.
 */
const UNRECORDED_GRID = [
  {
    name: 'exits 1 when submit could not record its batch, cancels it once, and still pushes and dispatches what the collection applied',
    refused: false,
  },
  {
    name: 'prints that the batch is recorded in no pending file, without cancelling it again, when submit could not record it and the push is refused, and exits 1',
    refused: true,
  },
];

describe('l10n ci: a batch submit could not record, and a push accepted or refused', () => {
  for (const { name, refused } of UNRECORDED_GRID) {
    it(name, async () => {
      seedRemote();
      const fake = fakeAnthropic({
        result: (params) =>
          requestBody(params).page === 'content/it/home.json'
            ? { type: 'errored', error: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }
            : { type: 'succeeded', message: echoReply(params) },
      });
      const dispatch = dispatchRecorder();
      const deps = { ClientClass: fake.FakeAnthropic, fetchImpl: dispatch.fetchImpl, env: { ANTHROPIC_API_KEY: KEY } };
      expect((await ci(checkout(), deps)).code).toBe(0);
      const before = remoteHead(CI_BRANCH);

      const dir = checkout();
      // The one fault of the run under test: the write of the pending file that records the second batch.
      const faulty = failingWrites({ file: path.join(dir, 'memory', 'pending.json'), message: `no space left on device ${KEY}`, when: (data) => data.includes('msgbatch_fake2') });
      if (refused) refusePushes();
      const r = await ci(dir, { ...deps, fsImpl: faulty.fsImpl });
      const printed = r.out + '\n' + r.err;

      // The cell is the one its name says: the run collected, submitted a second batch, and that batch's write failed.
      expect(fake.calls.retrieve).toEqual(['msgbatch_fake1']);
      expect(fake.calls.batchCreate).toHaveLength(2);
      expect(fake.calls.batchCreate[1].requests.map((q) => requestBody(q.params).page)).toEqual(['content/it/home.json']);
      expect(faulty.refused).toHaveLength(1);

      expect(r.code).toBe(1);
      expect(fake.calls.cancel).toEqual(['msgbatch_fake2']);
      expect(r.err).toContain('submit: batch msgbatch_fake2 was created, but');
      expect(r.err).toContain('submit: batch msgbatch_fake2 was canceled: the API accepted the cancellation (processing status: canceling)');

      if (refused) {
        expect(r.err).toContain('ci: git push failed');
        expect(r.err).toContain(
          'ci: nothing reached l10n-memory; batch msgbatch_fake2, submitted in this run, is recorded in no pending file, and submit printed above whether its cancellation was accepted.'
        );
        expect(r.err).not.toContain('no batch was submitted in this run');
        expect(remoteHead(CI_BRANCH)).toBe(before);
        expect(dispatch.requests).toHaveLength(0);
      } else {
        expect(printed).not.toContain('nothing reached');
        // What the collection applied reached the CI branch; the unrecorded batch did not.
        expect(remoteGit(['rev-parse', `${CI_BRANCH}^`])).toBe(before);
        expect(Object.keys(readOnBranch('memory/machine/en.json')).sort()).toEqual([...UI].sort());
        expect(readOnBranch('memory/pending.json').batches).toEqual([]);
        expect(Object.keys(readOnBranch('memory/pending.json').queue.en).sort()).toEqual([...HOME].sort());
        expect(dispatch.requests).toHaveLength(1);
      }

      expect(printed).not.toContain(TOKEN);
      expect(printed).not.toContain(Buffer.from(`x-access-token:${TOKEN}`).toString('base64'));
      expect(printed).not.toContain(KEY);
      expect(networkAttempts()).toEqual([]);
    });
  }
});

const COLLECTOR = 'l10n-collect.yml';
const API = 'https://api.github.invalid/repos/owner/site/actions/workflows';
const ENABLE = { url: `${API}/${COLLECTOR}/enable`, method: 'PUT' };
const DISABLE = { url: `${API}/${COLLECTOR}/disable`, method: 'PUT' };
const DISPATCH = { url: `${API}/deploy-dev.yml/dispatches`, method: 'POST' };
/** The method and the URL of each request, in order. */
const calls = (recorder, from = 0) => recorder.requests.slice(from).map(({ url, method }) => ({ url, method }));

describe('l10n ci: the collector switched on while a batch is recorded and off otherwise', () => {
  const collectorCi = { branch: CI_BRANCH, collector: COLLECTOR, dispatch: { workflow: 'deploy-dev.yml', ref: WORKING } };

  it('switches the collector on when a submission leaves a batch recorded', async () => {
    seedRemote({ ci: collectorCi });
    const github = githubRecorder();
    const r = await ci(checkout(), { ClientClass: fakeAnthropic().FakeAnthropic, fetchImpl: github.fetchImpl });
    expect(r.code).toBe(0);
    expect(r.err).toBe('');
    expect(calls(github)).toEqual([ENABLE]);
    expect(github.requests[0].headers).toEqual(expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }));
    expect(github.requests[0]).not.toHaveProperty('body');
    expect(readOnBranch('memory/pending.json').batches.map((b) => b.id)).toEqual(['msgbatch_fake1']);
    expect(r.out).toContain(`ci: a batch is recorded: switched the collector ${COLLECTOR} on (PUT ${ENABLE.url}, 204).`);
    expect(r.out + r.err).not.toContain(TOKEN);
    expect(networkAttempts()).toEqual([]);
  });

  it('switches the collector off when the collection leaves nothing pending, before the dispatch', async () => {
    seedRemote({ ci: collectorCi });
    const github = githubRecorder();
    const deps = { ClientClass: fakeAnthropic().FakeAnthropic, fetchImpl: github.fetchImpl };
    expect((await ci(checkout(), deps)).code).toBe(0);
    const r = await ci(checkout(), deps);
    expect(r.code).toBe(0);
    expect(readOnBranch('memory/pending.json').batches).toEqual([]);
    expect(calls(github, 1)).toEqual([DISABLE, DISPATCH]);
    expect(r.out).toContain(`ci: no batch is recorded: switched the collector ${COLLECTOR} off (PUT ${DISABLE.url}, 204).`);
  });

  it('switches the collector on again when its batch is still processing, with nothing to push', async () => {
    seedRemote({ ci: collectorCi });
    const github = githubRecorder();
    const deps = { ClientClass: fakeAnthropic({ status: () => 'in_progress' }).FakeAnthropic, fetchImpl: github.fetchImpl };
    expect((await ci(checkout(), deps)).code).toBe(0);
    const head = remoteHead(CI_BRANCH);
    const r = await ci(checkout(), deps);
    expect(r.code).toBe(0);
    expect(remoteHead(CI_BRANCH)).toBe(head);
    expect(r.out).toContain('ci: the machine layer and the pending file are unchanged: no commit, no push.');
    expect(calls(github)).toEqual([ENABLE, ENABLE]);
  });

  it('switches the collector off on a run with nothing to do, whatever state it is in', async () => {
    seedRemote({ ci: collectorCi });
    const github = githubRecorder();
    const fake = fakeAnthropic();
    const deps = { ClientClass: fake.FakeAnthropic, fetchImpl: github.fetchImpl };
    expect((await ci(checkout(), deps)).code).toBe(0);
    expect((await ci(checkout(), deps)).code).toBe(0);
    const constructed = fake.constructed.length;
    const r = await ci(checkout(), deps);
    expect(r.code).toBe(0);
    expect(fake.constructed).toHaveLength(constructed);
    expect(calls(github)).toEqual([ENABLE, DISABLE, DISPATCH, DISABLE]);
  });

  it('exits 1 naming the call when the switch-on is refused, with the CI branch already pushed', async () => {
    seedRemote({ ci: collectorCi });
    const github = githubRecorder((url) => (url === ENABLE.url ? 403 : 204));
    const r = await ci(checkout(), { ClientClass: fakeAnthropic().FakeAnthropic, fetchImpl: github.fetchImpl });
    expect(r.code).toBe(1);
    expect(calls(github)).toEqual([ENABLE]);
    expect(r.err).toContain(`ci: the collector ${COLLECTOR} could not be switched on (the request PUT ${ENABLE.url} was answered 403.)`);
    expect(r.err).toContain('the next push or a manual run collects it');
    // The batch is recorded on the CI branch, for the next push or manual run.
    expect(readOnBranch('memory/pending.json').batches.map((b) => b.id)).toEqual(['msgbatch_fake1']);
    expect(r.out + r.err).not.toContain(TOKEN);
  });

  it('prints a refused switch-off and exits 0', async () => {
    seedRemote({ ci: collectorCi });
    const github = githubRecorder((url) => (url === DISABLE.url ? 403 : 204));
    const deps = { ClientClass: fakeAnthropic().FakeAnthropic, fetchImpl: github.fetchImpl };
    expect((await ci(checkout(), deps)).code).toBe(0);
    const r = await ci(checkout(), deps);
    expect(r.code).toBe(0);
    expect(r.err).toBe('');
    expect(r.out).toContain(`ci: the collector ${COLLECTOR} could not be switched off (the request PUT ${DISABLE.url} was answered 403.)`);
    expect(calls(github, 1)).toEqual([DISABLE, DISPATCH]);
  });

  it('switches nothing after a refused push, and exits 1', async () => {
    seedRemote({ ci: collectorCi });
    const github = githubRecorder();
    refusePushes();
    const r = await ci(checkout(), { ClientClass: fakeAnthropic().FakeAnthropic, fetchImpl: github.fetchImpl });
    expect(r.code).toBe(1);
    expect(r.err).toContain('ci: git push failed');
    expect(calls(github)).toEqual([]);
  });
});

describe('l10n overlay: the deploy-time read of the CI branch', () => {
  it('prints that the committed memory is used, and exits 0, when the CI branch does not exist', async () => {
    seedRemote();
    const dir = checkout();
    const r = await ci(dir, { command: 'overlay' });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^overlay: the CI branch l10n-memory could not be read \(.+\); the build uses the committed memory\.$/m);
    expect(fs.existsSync(path.join(dir, 'memory', 'machine'))).toBe(false);
  });

  it('copies the machine layer the CI branch holds, and only it, printing the commit it read', async () => {
    seedRemote();
    const fake = fakeAnthropic();
    const deps = { ClientClass: fake.FakeAnthropic, fetchImpl: dispatchRecorder().fetchImpl };
    await ci(checkout(), deps);
    await ci(checkout(), deps);
    const head = remoteHead(CI_BRANCH);

    const dir = checkout();
    const r = await ci(dir, { command: 'overlay' });
    expect(r.code).toBe(0);
    expect(r.out).toContain(`overlay: read ${CI_BRANCH} at ${head} (fetched from origin): 1 machine-layer file(s) copied into memory/machine/.`);
    expect(fs.readFileSync(path.join(dir, 'memory', 'machine', 'en.json'), 'utf8')).toBe(remoteGit(['show', `${CI_BRANCH}:memory/machine/en.json`]) + '\n');
    expect(fs.existsSync(path.join(dir, 'memory', 'pending.json'))).toBe(false);
    expect(box.git(['status', '--porcelain', '--untracked-files=all'], dir)).toBe('?? memory/machine/en.json');
  });

  it("reads the checkout's copy of the branch when the remote cannot be fetched", async () => {
    seedRemote();
    const fake = fakeAnthropic();
    const deps = { ClientClass: fake.FakeAnthropic, fetchImpl: dispatchRecorder().fetchImpl };
    await ci(checkout(), deps);
    await ci(checkout(), deps);
    const head = remoteHead(CI_BRANCH);

    // A checkout of every branch, as `actions/checkout` with fetch-depth 0 leaves it, whose remote then fails.
    const dir = checkout();
    box.git(['fetch', '--quiet', 'origin', `+refs/heads/${CI_BRANCH}:refs/remotes/origin/${CI_BRANCH}`], dir);
    box.git(['remote', 'set-url', 'origin', `file://${path.join(box.dir, 'absent.git')}`], dir);
    const r = await ci(dir, { command: 'overlay' });
    expect(r.code).toBe(0);
    expect(r.out).toContain(`overlay: read ${CI_BRANCH} at ${head} (refs/remotes/origin/${CI_BRANCH}, as the checkout fetched it)`);
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'memory', 'machine', 'en.json'), 'utf8')))).toHaveLength(MISSING.length);
  });
});

describe('git credentials', () => {
  it('hands the token to git as a header scoped to the server, after any configuration the environment declares', () => {
    const env = gitEnvironment({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.x', GIT_CONFIG_VALUE_0: 'y' }, { token: 't0k', serverUrl: 'https://github.com/' });
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GIT_CONFIG_COUNT).toBe('2');
    expect(env.GIT_CONFIG_KEY_0).toBe('core.x');
    expect(env.GIT_CONFIG_KEY_1).toBe('http.https://github.com/.extraheader');
    expect(env.GIT_CONFIG_VALUE_1).toBe(`AUTHORIZATION: basic ${Buffer.from('x-access-token:t0k').toString('base64')}`);
    expect(gitEnvironment({}, {})).toEqual({ GIT_TERMINAL_PROMPT: '0' });
  });

  it('removes a credential from a URL in a message', () => {
    expect(redactCredentials("fatal: repository 'https://x-access-token:abc@github.com/o/r/' not found")).toBe(
      "fatal: repository 'https://***@github.com/o/r/' not found"
    );
  });
});
