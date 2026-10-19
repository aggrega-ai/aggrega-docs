import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from './cli.mjs';
import { gitEnvironment } from './git.mjs';
import { SYNC_COMMIT_MESSAGE, fetchUrlFor, readEnvFileValue } from './sync.mjs';
import { keyOf } from './normalize.mjs';
import { networkAttempts } from '../test/no-network.mjs';
import { capture, FIXTURE_PROJECT, gitSandbox, writeJson } from '../test/helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/l10n.mjs', import.meta.url));
const CI_BRANCH = 'l10n-memory';
const WORKING = 'lovable';
const TOKEN_ENV = 'L10N_GIT_READ_TOKEN';
const TOKEN = 'github_pat_testtokennotasecret';
const MACHINE = 'memory/machine/en.json';
const MATERIALIZE = `node "${BIN}" materialize`;
const COMMANDS = [MATERIALIZE, 'node routes.mjs'];
const DERIVED = ['content/en/', 'ui/en.json', 'routes.json'];

/** Whether a repository-relative path is one the sync owns in the test repository. */
const owned = (p) => p.startsWith('memory/machine/') || p.startsWith('content/en/') || p === 'ui/en.json' || p === 'routes.json';

/** A route list built from the content files, as a site's prebuild builds one: the derived file the second command writes. */
const ROUTES_SCRIPT = `import fs from 'node:fs';
const routes = [];
for (const lang of ['it', 'en']) {
  for (const name of fs.readdirSync('content/' + lang).sort()) {
    const page = JSON.parse(fs.readFileSync('content/' + lang + '/' + name, 'utf8'));
    routes.push({ lang, path: page.path, title: (page.seo && page.seo.title) || null });
  }
}
fs.writeFileSync('routes.json', JSON.stringify({ routes }, null, 2) + '\\n');
`;

/** A derived command that, on its first run only, commits to the checkout's branch: a commit landing while the sync runs. */
const RACE_SCRIPT = `import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const { L10N_TEST_RACE_REPO: repo, L10N_TEST_RACE_RUNS: runs } = process.env;
if (repo && runs) {
  const first = !fs.existsSync(runs);
  fs.appendFileSync(runs, 'run\\n');
  if (first) process.exit(spawnSync('git', ['-C', repo, 'commit', '--quiet', '--allow-empty', '-m', 'Concurrent work']).status ?? 1);
}
`;

/** A derived command that records where it runs and what it sees. */
const PROBE_SCRIPT = `import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const out = process.env.L10N_TEST_PROBE_OUT;
if (out) {
  const machine = fs.existsSync('memory/machine/en.json') ? fs.readFileSync('memory/machine/en.json', 'utf8') : null;
  fs.writeFileSync(out, JSON.stringify({
    cwd: process.cwd(),
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    machine,
    token: 'L10N_GIT_READ_TOKEN' in process.env,
    agent: 'SSH_AUTH_SOCK' in process.env,
  }));
}
`;

/** A machine-layer entry, as a collection writes one. */
const entry = (source, text) => [keyOf(source), { at: '2026-10-17T00:00:00.000Z', srcHash: keyOf(source), status: 'machine', text }];
const V1 = Object.fromEntries([entry('Benvenuti', 'Welcome'), entry('Torna su', 'Back to top')]);
const V2 = Object.fromEntries([...Object.entries(V1), entry('Scopri', 'Discover')]);
const V3 = Object.fromEntries([...Object.entries(V2), entry('Menu', 'Menu')]);

let box;
let remote;
let work;

const g = (args, dir = work) => box.git(args, dir);
const read = (rel, dir = work) => fs.readFileSync(path.join(dir, rel), 'utf8');
const write = (rel, text, dir = work) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const showJson = (rev, rel) => JSON.parse(g(['show', `${rev}:${rel}`]));

/**
 * The working branch on a bare remote: the fixture project with a `ci` and a
 * `sync` key, its derived files made by the derived commands from the
 * committed sources, committed on `lovable` and pushed. `work` is the checkout.
 */
function seed({ commands = COMMANDS, paths = DERIVED } = {}) {
  remote = path.join(box.dir, 'remote.git');
  box.git(['init', '--quiet', '--bare', '-b', WORKING, remote]);
  work = path.join(box.dir, 'work');
  fs.cpSync(FIXTURE_PROJECT, work, { recursive: true });
  const configPath = path.join(work, 'l10n.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.ci = { branch: CI_BRANCH };
  config.sync = { commands, paths, tokenEnv: TOKEN_ENV, intervalSeconds: 60 };
  writeJson(configPath, config);
  write('routes.mjs', ROUTES_SCRIPT);
  write('race.mjs', RACE_SCRIPT);
  write('probe.mjs', PROBE_SCRIPT);
  for (const command of COMMANDS) {
    const res = spawnSync(command, { cwd: work, env: box.env, shell: true, encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`${command} failed: ${res.stderr}`);
  }
  box.git(['init', '--quiet', '-b', WORKING], work);
  g(['add', '-A']);
  g(['commit', '--quiet', '-m', 'Site content']);
  g(['remote', 'add', 'origin', `file://${remote}`]);
  g(['push', '--quiet', 'origin', WORKING]);
}

/** Commits `machine` as the CI branch's machine layer, beside a pending file, and pushes it; returns the commit. */
function pushCi(machine) {
  const dir = path.join(box.dir, 'ci-runner');
  if (!fs.existsSync(dir)) box.git(['init', '--quiet', '-b', CI_BRANCH, dir]);
  writeJson(path.join(dir, MACHINE), machine);
  writeJson(path.join(dir, 'memory', 'pending.json'), { batches: [], queue: {} });
  box.git(['add', '-A'], dir);
  box.git(['commit', '--quiet', '-m', 'Update the machine translation layer and the pending batches'], dir);
  box.git(['push', '--quiet', `file://${remote}`, `${CI_BRANCH}:refs/heads/${CI_BRANCH}`], dir);
  return box.git(['rev-parse', 'HEAD'], dir);
}

async function l10n(argv, { env = {}, cwd = work, ...deps } = {}) {
  const io = capture();
  const code = await runCli(argv, { cwd, env: { ...box.env, ...env }, log: io.log, errlog: io.errlog, ...deps });
  return { code, out: io.text(), err: io.errors() };
}

const sync = (opts) => l10n(['sync'], opts);
const worktrees = () => g(['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree '));
const changedBy = (rev) => g(['diff-tree', '-r', '--name-only', `${rev}^`, rev]).split('\n').filter(Boolean);
/** The index entries of the paths the sync does not own, one `git ls-files --stage` line each. */
const unrelatedIndex = () => g(['ls-files', '--stage']).split('\n').filter((l) => !owned(l.split('\t')[1]));

beforeEach(() => {
  box = gitSandbox('l10n-sync-test-');
});

afterEach(() => {
  box.cleanup();
});

describe('l10n sync: one path-scoped commit on top of HEAD', () => {
  it('commits exactly the machine layer and the derived paths, regenerated from HEAD by the configured commands in a temporary worktree, with the one-line message', async () => {
    seed({ commands: [...COMMANDS, 'node probe.mjs'] });
    const head = g(['rev-parse', 'HEAD']);
    const ci = pushCi(V1);
    const probe = path.join(box.dir, 'probe.json');

    const r = await sync({ env: { L10N_TEST_PROBE_OUT: probe } });
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    const commit = g(['rev-parse', 'HEAD']);
    expect(r.out).toContain(`sync: committed ${commit} on ${WORKING}: the machine layer of ${CI_BRANCH} at ${ci}, 4 path(s) changed.`);

    // One commit on top of HEAD, with the one fixed message.
    expect(g(['rev-parse', 'HEAD^'])).toBe(head);
    expect(g(['log', '-1', '--format=%B'])).toBe(SYNC_COMMIT_MESSAGE);
    expect(SYNC_COMMIT_MESSAGE).toBe('chore(i18n): sync the translation memory from CI');
    expect(changedBy('HEAD')).toEqual(['content/en/home.json', MACHINE, 'routes.json', 'ui/en.json']);

    // The machine layer is the CI branch's, blob for blob; the pending file stays on the CI branch.
    expect(g(['rev-parse', `HEAD:${MACHINE}`])).toBe(g(['rev-parse', `${ci}:${MACHINE}`]));
    expect(g(['ls-tree', 'HEAD', 'memory/pending.json'])).toBe('');

    // The derived files are what the commands made from HEAD plus both layers.
    expect(showJson('HEAD', 'content/en/home.json').seo.title).toBe('Welcome');
    expect(showJson('HEAD', 'content/en/home.json').blocks[0].data.heading).toBe('Hello, world');
    expect(showJson('HEAD', 'ui/en.json')['nav.backToTop']).toBe('Back to top');
    expect(showJson('HEAD', 'routes.json').routes).toContainEqual({ lang: 'en', path: '/en/', title: 'Welcome' });

    // The commands ran in a temporary worktree of HEAD holding the CI branch's machine layer, which is gone.
    const seen = JSON.parse(fs.readFileSync(probe, 'utf8'));
    expect(seen.cwd).not.toBe(work);
    expect(path.basename(seen.cwd)).toMatch(/^l10n-sync-/);
    expect(seen.head).toBe(head);
    expect(seen.machine).toBe(g(['show', `${ci}:${MACHINE}`]) + '\n');
    expect(fs.existsSync(seen.cwd)).toBe(false);
    expect(worktrees()).toEqual([`worktree ${fs.realpathSync(work)}`]);

    // The checkout is at the new commit for every path the commit changed.
    expect(g(['status', '--porcelain', '--untracked-files=all'])).toBe('');
    expect(read('ui/en.json')).toBe(g(['show', 'HEAD:ui/en.json']) + '\n');
    expect(networkAttempts()).toEqual([]);
  });

  it('leaves every unrelated staged and unstaged change byte-identical, in the index and the working tree, and regenerates from HEAD rather than from them', async () => {
    seed();
    pushCi(V1);
    // Staged: an Italian edit the derived files must not see, and a new file.
    const it = JSON.parse(read('content/it/home.json'));
    it.seo.title = 'Benvenuti, versione non ancora committata';
    write('content/it/home.json', JSON.stringify(it, null, 2) + '\n');
    write('notes/staged.txt', 'staged\n');
    g(['add', 'content/it/home.json', 'notes/staged.txt']);
    // Staged, then changed again: the index and the working tree differ from each other and from HEAD.
    write('ui/it.json', read('ui/it.json').replace('"Menu"', '"Menu principale"'));
    g(['add', 'ui/it.json']);
    write('ui/it.json', read('ui/it.json').replace('"Menu principale"', '"Menu del sito"'));
    // Unstaged, and untracked.
    write('glossary.json', read('glossary.json').replace('"Fixture"', '"Fixture", "Cognitio"'));
    write('scratch.txt', 'untracked\n');

    const unrelated = ['content/it/home.json', 'notes/staged.txt', 'ui/it.json', 'glossary.json', 'scratch.txt'];
    const bytes = () => Object.fromEntries(unrelated.map((p) => [p, read(p)]));
    const before = {
      index: unrelatedIndex(),
      bytes: bytes(),
      staged: g(['diff', '--cached', '--', ...unrelated]),
      unstaged: g(['diff', '--', ...unrelated]),
      untracked: g(['ls-files', '--others', '--exclude-standard']),
    };

    const r = await sync();
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(changedBy('HEAD')).toEqual(['content/en/home.json', MACHINE, 'routes.json', 'ui/en.json']);
    expect(changedBy('HEAD').every(owned)).toBe(true);

    // Regenerated from HEAD's Italian, not from the staged edit.
    expect(showJson('HEAD', 'content/en/home.json').seo.title).toBe('Welcome');
    expect(g(['show', 'HEAD:content/en/home.json'])).not.toContain('non ancora committata');
    expect(g(['show', 'HEAD:routes.json'])).not.toContain('non ancora committata');

    expect(unrelatedIndex()).toEqual(before.index);
    expect(bytes()).toEqual(before.bytes);
    expect(g(['diff', '--cached', '--', ...unrelated])).toBe(before.staged);
    expect(g(['diff', '--', ...unrelated])).toBe(before.unstaged);
    expect(g(['ls-files', '--others', '--exclude-standard'])).toBe(before.untracked);
    // Nothing the sync owns is left staged or modified.
    expect(g(['status', '--porcelain', '--', MACHINE, ...DERIVED])).toBe('');
  });

  it('adds no commit and exits 0 when the machine layer at HEAD equals the CI branch’s', async () => {
    seed();
    const ci = pushCi(V1);
    expect((await sync()).code).toBe(0);
    const head = g(['rev-parse', 'HEAD']);

    const r = await sync();
    expect(r.code).toBe(0);
    expect(r.err).toBe('');
    expect(r.out).toBe(`sync: the machine layer at HEAD equals ${CI_BRANCH}'s at ${ci}: no commit.`);
    expect(g(['rev-parse', 'HEAD'])).toBe(head);
  });

  it('adds no commit and exits 0 when the remote has no CI branch yet', async () => {
    seed();
    const head = g(['rev-parse', 'HEAD']);
    const r = await sync();
    expect(r.code).toBe(0);
    expect(r.out).toBe(`sync: origin has no branch ${CI_BRANCH} yet: nothing to sync.`);
    expect(g(['rev-parse', 'HEAD'])).toBe(head);
  });

});

describe('l10n sync with the configuration in a subdirectory of the repository', () => {
  /**
   * The fixture project as `site/` of the working branch, with a `ci` and a
   * `sync` key, its derived files made from the committed sources and pushed;
   * the installed packages at the repository root, ignored by git, hold one
   * module a derived command requires. Returns the project directory.
   */
  function seedSubdirectory() {
    remote = path.join(box.dir, 'remote.git');
    box.git(['init', '--quiet', '--bare', '-b', WORKING, remote]);
    work = path.join(box.dir, 'work');
    const site = path.join(work, 'site');
    fs.cpSync(FIXTURE_PROJECT, site, { recursive: true });
    const configPath = path.join(site, 'l10n.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.ci = { branch: CI_BRANCH };
    config.sync = { commands: [`node -e "require('l10n-installed-probe')"`, MATERIALIZE], paths: ['content/en/', 'ui/en.json'] };
    writeJson(configPath, config);
    write('.gitignore', 'node_modules/\n');
    write('node_modules/l10n-installed-probe/package.json', JSON.stringify({ name: 'l10n-installed-probe', version: '1.0.0', main: 'index.js' }));
    write('node_modules/l10n-installed-probe/index.js', 'module.exports = true;\n');
    const made = spawnSync(MATERIALIZE, { cwd: site, env: box.env, shell: true, encoding: 'utf8' });
    if (made.status !== 0) throw new Error(`materialize failed: ${made.stderr}`);
    box.git(['init', '--quiet', '-b', WORKING], work);
    g(['add', '-A']);
    g(['commit', '--quiet', '-m', 'Site content']);
    g(['remote', 'add', 'origin', `file://${remote}`]);
    g(['push', '--quiet', 'origin', WORKING]);
    return site;
  }

  /** Commits `machine` as the CI branch's machine layer of the project at `site/`, and pushes it. */
  function pushSubdirectoryCi(machine) {
    const runner = path.join(box.dir, 'ci-runner');
    if (!fs.existsSync(runner)) box.git(['init', '--quiet', '-b', CI_BRANCH, runner]);
    writeJson(path.join(runner, 'site', MACHINE), machine);
    writeJson(path.join(runner, 'site', 'memory', 'pending.json'), { batches: [], queue: {} });
    box.git(['add', '-A'], runner);
    box.git(['commit', '--quiet', '-m', 'Update the machine translation layer and the pending batches'], runner);
    box.git(['push', '--quiet', `file://${remote}`, `${CI_BRANCH}:refs/heads/${CI_BRANCH}`], runner);
  }

  it('runs the derived commands with the repository root’s node_modules, and commits and refreshes the paths under the subdirectory', async () => {
    const site = seedSubdirectory();
    pushSubdirectoryCi(V1);
    const r = await sync({ cwd: site });
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(changedBy('HEAD')).toEqual(['site/content/en/home.json', `site/${MACHINE}`, 'site/ui/en.json']);
    expect(showJson('HEAD', 'site/content/en/home.json').seo.title).toBe('Welcome');
    expect(g(['status', '--porcelain'])).toBe('');
    expect(worktrees()).toEqual([`worktree ${fs.realpathSync(work)}`]);
  });

  it('refuses, naming the path, when the working tree’s copy of the machine layer is modified under the subdirectory', async () => {
    const site = seedSubdirectory();
    pushSubdirectoryCi(V1);
    expect((await sync({ cwd: site })).code).toBe(0);
    const head = g(['rev-parse', 'HEAD']);
    write(`site/${MACHINE}`, JSON.stringify(V3, null, 2) + '\n');
    pushSubdirectoryCi(V2);
    const r = await sync({ cwd: site });
    expect(r.code).toBe(1);
    expect(r.err).toContain(`sync: site/${MACHINE} differs from HEAD in the index or the working tree`);
    expect(g(['rev-parse', 'HEAD'])).toBe(head);
  });
});

describe('l10n sync: the machine layer has one writer, CI', () => {
  /**
   * One fault per row, each against a CI branch that has moved past HEAD's
   * machine layer: what HEAD or the checkout holds under the machine layer.
   * The last row is the positive control, which commits.
   */
  const rows = [
    {
      scenario: 'refuses, naming the path, when HEAD’s machine layer is a version the CI branch never held',
      prepare: () => {
        write(MACHINE, JSON.stringify(Object.fromEntries([entry('Benvenuti', 'Welcome, by hand')]), null, 2) + '\n');
        g(['add', MACHINE]);
        g(['commit', '--quiet', '-m', 'A machine layer nobody collected']);
      },
      names: `sync: ${MACHINE} at HEAD is a version ${CI_BRANCH} never held: the machine layer is written by CI alone.`,
    },
    {
      scenario: 'refuses, naming the path, when the working tree’s copy of the machine layer is modified',
      synced: true,
      prepare: () => write(MACHINE, read(MACHINE).replace('Back to top', 'Back to the top')),
      names: `sync: ${MACHINE} differs from HEAD in the index or the working tree: the machine layer is written by CI alone, so it is never overwritten.`,
    },
    {
      scenario: 'refuses, naming the path, when the index holds a change to the machine layer',
      synced: true,
      prepare: () => {
        write(MACHINE, read(MACHINE).replace('Back to top', 'Back to the top'));
        g(['add', MACHINE]);
      },
      names: `sync: ${MACHINE} differs from HEAD in the index or the working tree: the machine layer is written by CI alone, so it is never overwritten.`,
    },
    {
      scenario: 'refuses, naming the path, when the working tree holds a machine-layer file HEAD does not',
      prepare: () => write('memory/machine/de.json', '{}\n'),
      names: 'sync: memory/machine/de.json differs from HEAD in the index or the working tree: the machine layer is written by CI alone, so it is never overwritten.',
    },
    {
      scenario: 'accepts, and commits over, a machine layer at HEAD that is an earlier version the CI branch held',
      synced: true,
      prepare: () => {},
      names: null,
    },
  ];

  for (const row of rows) {
    it(row.scenario, async () => {
      seed();
      pushCi(V1);
      if (row.synced) expect((await sync()).code).toBe(0);
      pushCi(V2);
      row.prepare();
      const head = g(['rev-parse', 'HEAD']);
      const status = g(['status', '--porcelain', '--untracked-files=all']);

      const r = await sync();
      if (row.names === null) {
        expect(r.err).toBe('');
        expect(r.code).toBe(0);
        expect(g(['rev-parse', 'HEAD^'])).toBe(head);
        expect(Object.keys(showJson('HEAD', MACHINE))).toHaveLength(3);
        return;
      }
      expect(r.code).toBe(1);
      expect(r.err).toContain(row.names);
      expect(r.err).toContain('Nothing was committed.');
      expect(g(['rev-parse', 'HEAD'])).toBe(head);
      expect(g(['status', '--porcelain', '--untracked-files=all'])).toBe(status);
      expect(worktrees()).toHaveLength(1);
    });
  }
});

describe('l10n sync: a commit landing on the branch while the sync runs', () => {
  it('fails the compare-and-swap, rebuilds on the new head, and loses no commit', async () => {
    seed({ commands: [...COMMANDS, 'node race.mjs'] });
    const head = g(['rev-parse', 'HEAD']);
    pushCi(V1);
    const runs = path.join(box.dir, 'race-runs');

    const r = await sync({ env: { L10N_TEST_RACE_REPO: work, L10N_TEST_RACE_RUNS: runs } });
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain(`sync: ${WORKING} moved from ${head} while the sync ran; building again on its new head.`);

    // The derived commands ran once per attempt; the concurrent commit was made once, and both commits are on the branch.
    expect(fs.readFileSync(runs, 'utf8')).toBe('run\nrun\n');
    expect(g(['log', '--format=%s']).split('\n')).toEqual([SYNC_COMMIT_MESSAGE, 'Concurrent work', 'Site content']);
    expect(g(['rev-parse', 'HEAD^^'])).toBe(head);
    expect(changedBy('HEAD')).toEqual(['content/en/home.json', MACHINE, 'routes.json', 'ui/en.json']);
    expect(g(['status', '--porcelain', '--untracked-files=all'])).toBe('');
    expect(worktrees()).toHaveLength(1);
  });
});

describe('l10n sync: a derived path modified in the checkout', () => {
  const rows = [
    {
      scenario: 'commits the version regenerated from HEAD, leaves the modified working-tree copy untouched and names it, and updates the unmodified ones',
      stage: false,
      left: 'sync: left ui/en.json: its working-tree copy differs from HEAD\'s, so it stays as it is; the commit holds the version regenerated from HEAD.',
      staged: '',
      unstaged: 'ui/en.json',
    },
    {
      scenario: 'leaves a staged derived path’s index entry and working-tree copy untouched and names it, and still commits the regenerated version',
      stage: true,
      left: 'sync: left ui/en.json: it has staged changes, so its index entry and working-tree copy stay as they are; the commit holds the version regenerated from HEAD.',
      staged: 'ui/en.json',
      unstaged: '',
    },
  ];

  for (const row of rows) {
    it(row.scenario, async () => {
      seed();
      pushCi(V1);
      const edited = read('ui/en.json').replace('"Menu"', '"Hand-written menu"');
      write('ui/en.json', edited);
      if (row.stage) g(['add', 'ui/en.json']);
      const stagedBlob = g(['ls-files', '--stage', 'ui/en.json']);

      const r = await sync();
      expect(r.err).toBe('');
      expect(r.code).toBe(0);
      expect(r.out).toContain(row.left);

      // The commit holds the regeneration from HEAD, not the hand edit.
      expect(showJson('HEAD', 'ui/en.json')).toEqual({ 'nav.backToTop': 'Back to top', 'nav.menu': 'Menu' });
      // The modified copy is byte-identical; a staged entry is too.
      expect(read('ui/en.json')).toBe(edited);
      if (row.stage) expect(g(['ls-files', '--stage', 'ui/en.json'])).toBe(stagedBlob);
      // The unmodified derived paths are at the committed version.
      for (const rel of ['content/en/home.json', 'routes.json']) expect(read(rel)).toBe(g(['show', `HEAD:${rel}`]) + '\n');
      // Relative to the new commit: what is staged, and what differs in the working tree only.
      expect(g(['diff', '--cached', '--name-only'])).toBe(row.staged);
      expect(g(['diff', '--name-only'])).toBe(row.unstaged);
      expect(g(['ls-files', '--others', '--exclude-standard'])).toBe('');
    });
  }
});

describe('l10n sync: what it refuses to run on', () => {
  const rows = [
    {
      scenario: 'a detached HEAD',
      prepare: () => g(['checkout', '--quiet', '--detach']),
      code: 2,
      names: 'sync: HEAD is detached; check out the branch to sync into. Nothing was committed.',
    },
    {
      scenario: 'the CI branch checked out',
      prepare: () => g(['checkout', '--quiet', '-b', CI_BRANCH]),
      code: 2,
      names: `sync: the checked-out branch is the CI branch "${CI_BRANCH}"; check out the working branch. Nothing was committed.`,
    },
    {
      scenario: 'a merge in progress',
      prepare: () => fs.writeFileSync(path.join(work, '.git', 'MERGE_HEAD'), g(['rev-parse', 'HEAD']) + '\n'),
      code: 1,
      names: 'sync: an operation is in progress (MERGE_HEAD); finish or abort it first. Nothing was committed.',
    },
    {
      scenario: 'a derived path inside the machine layer',
      config: { paths: ['memory/machine/'] },
      code: 2,
      names: 'sync: sync.paths: memory/machine/ overlaps the machine layer memory/machine/, which CI alone writes.',
    },
    {
      scenario: 'a failing derived command, which commits nothing and leaves no worktree',
      config: { commands: [MATERIALIZE, 'node -e "console.error(\'route list: broken\'); process.exit(3)"'] },
      code: 1,
      names: 'sync: the derived command "node -e "console.error(\'route list: broken\'); process.exit(3)"" failed (exit 3); nothing was committed.\n  route list: broken',
    },
  ];

  for (const row of rows) {
    it(`refuses ${row.scenario}`, async () => {
      seed(row.config || {});
      pushCi(V1);
      if (row.prepare) row.prepare();
      const head = g(['rev-parse', 'HEAD']);
      const r = await sync();
      expect(r.code).toBe(row.code);
      expect(r.err).toContain(row.names);
      expect(g(['rev-parse', 'HEAD'])).toBe(head);
      expect(worktrees()).toHaveLength(1);
    });
  }
});

describe('l10n sync: the token and the temporary worktrees', () => {
  it('fetches through the token when one is set, and never hands its variable or an SSH agent to a derived command', async () => {
    seed({ commands: [...COMMANDS, 'node probe.mjs'] });
    pushCi(V1);
    const probe = path.join(box.dir, 'probe.json');
    const r = await sync({ env: { [TOKEN_ENV]: TOKEN, SSH_AUTH_SOCK: path.join(box.dir, 'agent.sock'), L10N_TEST_PROBE_OUT: probe } });
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    const seen = JSON.parse(fs.readFileSync(probe, 'utf8'));
    expect(seen.token).toBe(false);
    expect(seen.agent).toBe(false);
    expect(`${r.out}\n${r.err}`).not.toContain(TOKEN);
  });

  it('removes a worktree a killed sync left behind, and keeps one a running process holds', async () => {
    seed();
    pushCi(V1);
    const dead = spawnSync('true').pid;
    const tmp = fs.realpathSync(os.tmpdir());
    const abandoned = fs.mkdtempSync(path.join(tmp, 'l10n-sync-'));
    const held = fs.mkdtempSync(path.join(tmp, 'l10n-sync-'));
    g(['worktree', 'add', '--quiet', '--detach', '--lock', '--reason', `l10n sync, process ${dead}`, abandoned, 'HEAD']);
    g(['worktree', 'add', '--quiet', '--detach', '--lock', '--reason', `l10n sync, process ${process.pid}`, held, 'HEAD']);
    try {
      expect(worktrees()).toHaveLength(3);
      expect((await sync()).code).toBe(0);
      expect(worktrees()).toEqual([`worktree ${fs.realpathSync(work)}`, `worktree ${held}`]);
      expect(fs.existsSync(abandoned)).toBe(false);
    } finally {
      g(['worktree', 'remove', '--force', '--force', held]);
    }
  });
});

describe('l10n watch: polling the CI branch', () => {
  /** A sleep that returns at once and runs `between[n]` before the n-th wait returns. */
  function stepper(between = {}) {
    const waits = [];
    const sleep = async (ms) => {
      waits.push(ms);
      const step = between[waits.length];
      if (step) step();
    };
    return { waits, sleep };
  }

  it('runs sync when the CI branch’s head moves, polling ls-remote against a local bare remote, and only then', async () => {
    seed();
    const head = g(['rev-parse', 'HEAD']);
    const first = pushCi(V1);
    let second;
    const { waits, sleep } = stepper({ 2: () => (second = pushCi(V2)) });

    const r = await l10n(['watch'], { env: { [TOKEN_ENV]: TOKEN }, sleep, cycles: 4 });
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(waits).toEqual([60000, 60000, 60000]);
    expect(r.out.split('\n').filter((l) => l.startsWith('watch: '))).toEqual([
      `watch: polling file://${remote} for ${CI_BRANCH} every 60 s.`,
      `watch: ${CI_BRANCH} is at ${first}: running sync.`,
      `watch: ${CI_BRANCH} is at ${second}: running sync.`,
    ]);
    expect(g(['log', '--format=%s']).split('\n')).toEqual([SYNC_COMMIT_MESSAGE, SYNC_COMMIT_MESSAGE, 'Site content']);
    expect(g(['rev-parse', 'HEAD^^'])).toBe(head);
    expect(Object.keys(showJson('HEAD', MACHINE))).toHaveLength(3);
    expect(r.out).not.toContain(TOKEN);
    expect(networkAttempts()).toEqual([]);
  });

  it('idles without the token: says so once, never fetches, and does not exit', async () => {
    seed();
    pushCi(V1);
    const envFile = path.join(box.dir, 'dotenv');
    fs.writeFileSync(envFile, 'GIT_USER_NAME=Someone\n');
    const head = g(['rev-parse', 'HEAD']);
    const { waits, sleep } = stepper();

    const r = await l10n(['watch', '--env-file', envFile], { sleep, cycles: 3 });
    expect(r.code).toBe(0);
    expect(r.err).toBe('');
    expect(r.out).toBe(
      `watch: ${TOKEN_ENV} is not set in the environment or ${envFile}: idle. The CI branch is fetched with that read-only token alone; checking for it every 60 s.`
    );
    expect(waits).toHaveLength(2);
    expect(g(['rev-parse', 'HEAD'])).toBe(head);
    expect(g(['for-each-ref', `refs/remotes/origin/${CI_BRANCH}`])).toBe('');
  });

  it('reads the token from the file at every poll, so writing it there starts the watcher with no restart', async () => {
    seed();
    pushCi(V1);
    const envFile = path.join(box.dir, 'dotenv');
    fs.writeFileSync(envFile, '# per-machine values\nGIT_USER_NAME=Someone\n');
    const { sleep } = stepper({ 1: () => fs.appendFileSync(envFile, `${TOKEN_ENV}="${TOKEN}"\n`) });

    const r = await l10n(['watch', '--env-file', envFile], { sleep, cycles: 2 });
    expect(r.err).toBe('');
    expect(r.out).toContain(`watch: ${TOKEN_ENV} is not set in the environment or ${envFile}: idle.`);
    expect(r.out).toContain(`watch: polling file://${remote} for ${CI_BRANCH} every 60 s.`);
    expect(g(['log', '-1', '--format=%s'])).toBe(SYNC_COMMIT_MESSAGE);
    expect(r.out).not.toContain(TOKEN);
  });

  it('never fetches over SSH: a URL the configuration rewrites to SSH is refused by git before it connects', async () => {
    seed();
    pushCi(V1);
    const head = g(['rev-parse', 'HEAD']);
    // Were SSH ever used, this command would record it; it exits non-zero, so it never reaches a network either.
    const marker = path.join(box.dir, 'ssh-was-run');
    const sshCommand = path.join(box.dir, 'record-ssh.sh');
    fs.writeFileSync(sshCommand, `#!/bin/sh\ntouch "${marker}"\nexit 1\n`, { mode: 0o755 });
    g(['config', `url.ssh://git@example.invalid/.insteadOf`, 'file://']);

    const r = await l10n(['watch'], { env: { [TOKEN_ENV]: TOKEN, GIT_SSH_COMMAND: sshCommand, SSH_AUTH_SOCK: path.join(box.dir, 'agent.sock') }, sleep: async () => {}, cycles: 2 });
    expect(r.code).toBe(0);
    expect(r.err).toBe("watch: git ls-remote failed (exit 128): fatal: transport 'ssh' not allowed");
    expect(fs.existsSync(marker)).toBe(false);
    expect(g(['rev-parse', 'HEAD'])).toBe(head);
  });
});

describe('the token-authenticated fetch URL', () => {
  const rows = [
    { remote: 'git@github.com:cognitiosrl/cognitio.it.git', url: 'https://github.com/cognitiosrl/cognitio.it.git', serverUrl: 'https://github.com' },
    { remote: 'ssh://git@github.com/cognitiosrl/cognitio.it.git', url: 'https://github.com/cognitiosrl/cognitio.it.git', serverUrl: 'https://github.com' },
    { remote: 'ssh://git@gitlab.example:2222/group/site.git', url: 'https://gitlab.example/group/site.git', serverUrl: 'https://gitlab.example' },
    { remote: 'https://x-access-token:secret@github.com/o/r.git', url: 'https://github.com/o/r.git', serverUrl: 'https://github.com' },
    { remote: 'https://github.com/o/r', url: 'https://github.com/o/r', serverUrl: 'https://github.com' },
    { remote: 'git://example.org/r.git', url: 'https://example.org/r.git', serverUrl: 'https://example.org' },
    { remote: 'file:///srv/git/r.git', url: 'file:///srv/git/r.git', serverUrl: null, protocol: 'file' },
    { remote: '/srv/git/r.git', url: 'file:///srv/git/r.git', serverUrl: null, protocol: 'file' },
  ];
  for (const row of rows) {
    it(`fetches ${row.remote} from ${row.url}`, () => {
      expect(fetchUrlFor(row.remote)).toEqual({ url: row.url, serverUrl: row.serverUrl, protocol: row.protocol || 'https' });
    });
  }

  it('refuses an http:// remote, which would send the token unencrypted, and one with no URL, without printing a credential', () => {
    expect(fetchUrlFor('http://user:pw@example.org/r.git').error).toBe(
      'the remote URL http://***@example.org/r.git is http://, which would send the token unencrypted'
    );
    expect(fetchUrlFor(null).error).toBe('the remote origin has no URL');
  });

  it('hands git the token as a header scoped to the server, HTTPS as the only transport, and no SSH agent', () => {
    const env = gitEnvironment({ SSH_AUTH_SOCK: '/tmp/agent' }, { token: 't0k', serverUrl: 'https://github.com', protocols: ['https'] });
    expect(env.GIT_ALLOW_PROTOCOL).toBe('https');
    expect('SSH_AUTH_SOCK' in env).toBe(false);
    expect(env.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
    expect(gitEnvironment({ SSH_AUTH_SOCK: '/tmp/agent' }, { protocols: ['ssh'] }).SSH_AUTH_SOCK).toBe('/tmp/agent');
    expect(gitEnvironment({ SSH_AUTH_SOCK: '/tmp/agent' }, {}).SSH_AUTH_SOCK).toBe('/tmp/agent');
  });
});

describe('the token in a dotenv file', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-dotenv-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const rows = [
    { scenario: 'a plain assignment', text: 'L10N_GIT_READ_TOKEN=abc123\n', value: 'abc123' },
    { scenario: 'a double-quoted value', text: 'L10N_GIT_READ_TOKEN="abc 123"\n', value: 'abc 123' },
    { scenario: 'a single-quoted value with a comment after it', text: "L10N_GIT_READ_TOKEN='abc' # read-only\n", value: 'abc' },
    { scenario: 'an export prefix and an inline comment', text: 'export L10N_GIT_READ_TOKEN=abc # read-only\n', value: 'abc' },
    { scenario: 'the last of two assignments', text: 'L10N_GIT_READ_TOKEN=old\nL10N_GIT_READ_TOKEN=new\n', value: 'new' },
    { scenario: 'a commented-out assignment', text: '# L10N_GIT_READ_TOKEN=abc\n', value: undefined },
    { scenario: 'only other variables', text: 'GIT_USER_NAME=x\nL10N_GIT_READ_TOKEN_OLD=abc\n', value: undefined },
    { scenario: 'an empty value', text: 'L10N_GIT_READ_TOKEN=\n', value: undefined },
  ];
  for (const row of rows) {
    it(`reads ${row.scenario}`, () => {
      const file = path.join(dir, '.env');
      fs.writeFileSync(file, row.text);
      expect(readEnvFileValue(file, TOKEN_ENV)).toBe(row.value);
    });
  }

  it('reads nothing from a file that does not exist', () => {
    expect(readEnvFileValue(path.join(dir, 'absent'), TOKEN_ENV)).toBeUndefined();
  });
});
