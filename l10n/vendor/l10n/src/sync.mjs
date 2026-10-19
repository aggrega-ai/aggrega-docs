/**
 * sync.mjs — The path-scoped sync, `l10n sync`, and its watcher, `l10n watch`:
 * the CI branch's machine layer brought into the checked-out branch as one
 * commit, with no merge, no rebase and no clean working tree required.
 *
 * `runSync` READS the remote's CI branch (`ci.branch`), fetched with its whole
 * history into `refs/remotes/origin/<ci.branch>`; the checked-out branch's
 * `HEAD`; the checkout's index and working tree under the paths it owns; and the
 * configuration's `sync` settings (`config.mjs`, `syncSettings`). The paths it
 * OWNS are the machine layer (`<memory.dir>/machine/`) and the derived paths
 * (`sync.paths`). It WRITES, in order:
 *
 *   1. a temporary worktree of `HEAD`, outside the checkout, in which the CI
 *      branch's machine layer replaces `HEAD`'s and the derived commands
 *      (`sync.commands`) run, each through the shell, at the project root — so
 *      every derived file is regenerated from `HEAD`'s tree plus both memory
 *      layers, never from the working tree. The checkout's nearest
 *      `node_modules` directory at or above the project root, inside the
 *      repository, is linked into the worktree at the same place, so the
 *      commands — and `npx`, which resolves a local command from there — run with
 *      the checkout's installed dependencies wherever the configuration sits in
 *      the repository. The worktree
 *      is removed when the sync ends, and one a killed sync left behind is
 *      removed by the next;
 *   2. one commit on top of `HEAD`, built through a temporary index seeded from
 *      `HEAD`'s tree, in which exactly the owned paths are replaced — the
 *      machine layer by the CI branch's, blob for blob, and each derived path by
 *      the worktree's files under it — with the one-line message
 *      `SYNC_COMMIT_MESSAGE`;
 *   3. the checked-out branch, moved to that commit by a compare-and-swap on the
 *      old `HEAD` (`git update-ref HEAD <new> <old>`). When a commit landed on the
 *      branch meanwhile, the swap fails and the sync starts again on the new
 *      head, so that commit stays in the history;
 *   4. for each owned path the commit changed: its index entry, unless the path
 *      has staged changes, and its working-tree file, unless the path has staged
 *      changes or its working-tree copy differs from the old `HEAD`. A path left
 *      as it was is named in the output.
 *
 * Nothing else in the index or the working tree is written, so every unrelated
 * staged or unstaged change is as it was. The sync never pushes.
 *
 * IT REFUSES, with exit 1, naming the path and committing nothing, when the
 * machine layer at `HEAD` holds a blob the CI branch's history never held at
 * that path, or when the checkout's index or working tree differs from `HEAD`
 * under the machine layer: CI is the machine layer's one writer. It refuses with
 * exit 1 while a merge, rebase, cherry-pick or revert is in progress, and with
 * exit 2 when `HEAD` is detached or names a branch with no commit yet, the CI
 * branch is checked out, or a derived path lies outside the repository or
 * overlaps the machine layer. When the CI
 * branch's machine layer equals `HEAD`'s, or the remote has no CI branch, it
 * commits nothing and exits 0.
 *
 * THE TOKEN. With a token (`sync.tokenEnv`, from the environment or the file
 * `--env-file` names), every fetch goes to the HTTPS form of `origin`'s
 * configured URL, the token sent as a header scoped to that server
 * (`git.mjs`), with HTTPS the only transport git may use and no SSH agent
 * reachable. Without one, `sync` fetches from `origin` with whatever credentials
 * git has. The derived commands never see the token's variable.
 *
 * `runWatch` READS the token at every poll — the environment first, then the
 * file — and the CI branch's head through `git ls-remote`, at the configured
 * interval (`sync.intervalSeconds`), and runs `runSync` when that head differs
 * from the one it last synced, on its first poll included. It WRITES only what
 * `runSync` writes. Without a token it prints once that it is idle and keeps
 * polling for one; it never fetches without it, and never exits on its own.
 *
 * Runs in a development checkout, by hand or under a supervisor, under Node.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGit, GitError, REMOTE, redactCredentials } from './git.mjs';
import { branchPaths, copyFromCommit, memoryPathInRepo } from './ci.mjs';
import { syncSettings } from './config.mjs';

/** The one-line message of every commit the sync adds. */
export const SYNC_COMMIT_MESSAGE = 'chore(i18n): sync the translation memory from CI';

/** How many times the sync builds its commit when the branch keeps moving under it. */
export const SYNC_ATTEMPTS = 5;

/** The longest a derived command may run before the sync stops it and commits nothing. */
export const DERIVED_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

/** The name every temporary worktree of the sync begins with. */
const WORKTREE_PREFIX = 'l10n-sync-';

/**
 * The lock reason of a temporary worktree the sync or the push check adds: it
 * names the command and the process, so a later run of either can tell a live
 * worktree from one a killed process left behind.
 */
export const lockReason = (pid, command = 'sync') => `l10n ${command}, process ${pid}`;
const LOCK_REASON = /^l10n (?:sync|prepush), process (\d+)$/;

/** The git-directory entries that mean an operation is in progress, which the sync never commits under. */
const IN_PROGRESS = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'];

/** Variables that point git at another repository, index or work tree; removed so every git process here addresses the checkout. */
const GIT_LOCATION_VARIABLES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX'];

/** The largest output read from one derived command. */
const MAX_COMMAND_OUTPUT = 64 * 1024 * 1024;

/** The lines of a failed derived command's output that are printed. */
const FAILURE_TAIL_LINES = 20;

/** The sync could not proceed: the message names why, and nothing was committed. */
export class SyncError extends Error {
  constructor(message, { code = 1 } = {}) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

const toPosix = (p) => p.split(path.sep).join('/');

/** Whether one repository-relative path is the other or lies inside it, in either direction. */
function overlaps(a, b) {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/**
 * The checkout's nearest `node_modules` directory at or above `projectRoot`,
 * no higher than the repository root `root`, and its directory relative to
 * `root`; null when there is none.
 */
function nearestModules(projectRoot, root) {
  for (let dir = projectRoot; ; dir = path.dirname(dir)) {
    const modules = path.join(dir, 'node_modules');
    if (fs.existsSync(modules)) return { modules, rel: path.relative(root, dir) };
    if (dir === root || path.dirname(dir) === dir) return null;
  }
}

/** Blocks for `ms` milliseconds: the only pause the synchronous sync takes, between attempts to take the index lock. */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The URL a token-authenticated fetch goes to, for a remote's configured URL:
 * an `https://` URL as it is, less any user information; the HTTPS form of an
 * SSH or git URL, scp-like `user@host:path` included, on the same host and
 * path; a local repository as a `file://` URL. `protocol` is the one transport
 * the fetch may use, and `serverUrl` the origin the token is scoped to (null for
 * a local repository). An `http://` URL is refused, because the token would
 * travel unencrypted.
 *
 * @param {string|null} remoteUrl
 * @returns {{url:string, serverUrl:string|null, protocol:string}|{error:string}}
 */
export function fetchUrlFor(remoteUrl) {
  const raw = String(remoteUrl || '').trim();
  if (!raw) return { error: `the remote ${REMOTE} has no URL` };
  let m = /^https:\/\/(?:[^/@]+@)?([^/]+)(\/.*)?$/i.exec(raw);
  if (m) return { url: `https://${m[1]}${m[2] || ''}`, serverUrl: `https://${m[1]}`, protocol: 'https' };
  if (/^http:\/\//i.test(raw)) {
    return { error: `the remote URL ${redactCredentials(raw)} is http://, which would send the token unencrypted` };
  }
  m = /^(?:ssh|git|git\+ssh|ssh\+git):\/\/(?:[^/@]+@)?([^/:]+)(?::\d+)?(\/.+)$/i.exec(raw);
  if (m) return { url: `https://${m[1]}${m[2]}`, serverUrl: `https://${m[1]}`, protocol: 'https' };
  if (/^file:\/\//i.test(raw)) return { url: raw, serverUrl: null, protocol: 'file' };
  if (path.isAbsolute(raw)) return { url: `file://${raw}`, serverUrl: null, protocol: 'file' };
  m = /^(?:[^@/]+@)?([^/:]+):(?!\/\/)\/?(.+)$/.exec(raw);
  if (m) return { url: `https://${m[1]}/${m[2]}`, serverUrl: `https://${m[1]}`, protocol: 'https' };
  return { error: `the remote URL ${redactCredentials(raw)} has no HTTPS form` };
}

/**
 * The value `name` is assigned in a dotenv file — `NAME=value`, optionally
 * preceded by `export` and quoted with `'` or `"`, an unquoted value ending at
 * ` #` — the last assignment winning; undefined when the file is absent or
 * unreadable, or assigns no value. No other line of the file is kept.
 *
 * @param {string} file
 * @param {string} name
 * @param {typeof fs} [fsImpl]
 * @returns {string|undefined}
 */
export function readEnvFileValue(file, name, fsImpl = fs) {
  let content;
  try {
    content = fsImpl.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  let value;
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || m[1] !== name) continue;
    const quoted = /^(['"])(.*)\1\s*(?:#.*)?$/.exec(m[2]);
    value = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '').trim();
  }
  return value === undefined || value === '' ? undefined : value;
}

/**
 * The read-only token: the environment variable `tokenEnv` names, else its
 * assignment in `envFile`, else undefined. A value of only whitespace is none.
 */
export function readToken({ env, tokenEnv, envFile, fsImpl = fs }) {
  const fromEnv = typeof env[tokenEnv] === 'string' ? env[tokenEnv].trim() : '';
  if (fromEnv) return fromEnv;
  const fromFile = envFile ? readEnvFileValue(envFile, tokenEnv, fsImpl) : undefined;
  return fromFile ? fromFile.trim() || undefined : undefined;
}

/**
 * The environment the git processes of the sync and of the push check run
 * with: without git's location overrides, and with optional locks off, so
 * reading the checkout's status never rewrites its index.
 */
export function syncEnvironment(env) {
  const out = { ...env, GIT_OPTIONAL_LOCKS: '0' };
  for (const name of GIT_LOCATION_VARIABLES) delete out[name];
  return out;
}

/**
 * Where the CI branch is fetched from: with a token, the HTTPS form of
 * `origin`'s configured URL — read with `git config`, so no `insteadOf`
 * rewrite applies to the reading — with that URL's transport the only one git
 * may use; without, `origin` itself, with git's own credentials.
 *
 * @returns {{git: ReturnType<typeof createGit>, label: string}}
 */
export function fetchSource({ cwd, env, token }) {
  if (!token) return { git: createGit({ cwd, env }), label: REMOTE };
  const target = fetchUrlFor(createGit({ cwd, env }).configValue(`remote.${REMOTE}.url`));
  if (target.error) throw new SyncError(`${target.error}: the token-authenticated fetch needs an HTTPS URL for ${REMOTE}.`);
  const git = createGit({
    cwd,
    env,
    token: target.serverUrl ? token : undefined,
    serverUrl: target.serverUrl || undefined,
    remote: target.url,
    protocols: [target.protocol],
  });
  return { git, label: target.url };
}

/** Whether the process with this id still runs. */
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Removes the worktrees a sync or a push check locked and whose process no longer runs. */
export function removeAbandonedWorktrees(git) {
  for (const { path: dir, locked } of git.listWorktrees().slice(1)) {
    const m = locked && LOCK_REASON.exec(locked);
    if (m && !processAlive(Number(m[1]))) git.removeWorktree(dir);
  }
}

/** The last lines of a failed command's output, credentials removed. */
function outputTail(res) {
  const lines = `${res.stdout || ''}\n${res.stderr || ''}`.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  return lines.slice(-FAILURE_TAIL_LINES).map((l) => `  ${redactCredentials(l)}`).join('\n');
}

/**
 * Builds the sync's commit on top of `head`, in a temporary worktree of it, and
 * returns it. Throws a SyncError when a derived command fails.
 */
function buildCommit({ git, root, head, ciCommit, ciFiles, machineDir, derived, projRel, projectRoot, settings, commandEnv }) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), WORKTREE_PREFIX));
  let added = false;
  try {
    git.addWorktree(dir, head, lockReason(process.pid));
    added = true;
    const projDir = projRel ? path.join(dir, ...projRel.split('/')) : dir;
    const installed = nearestModules(projectRoot, root);
    if (installed) {
      const link = path.join(dir, installed.rel, 'node_modules');
      if (!fs.existsSync(link)) fs.symlinkSync(installed.modules, link, 'dir');
    }

    fs.rmSync(path.join(dir, ...machineDir.split('/')), { recursive: true, force: true });
    copyFromCommit(git, dir, ciCommit, [machineDir]);

    for (const command of settings.commands) {
      const res = spawnSync(command, {
        cwd: projDir,
        env: commandEnv,
        shell: true,
        encoding: 'utf8',
        maxBuffer: MAX_COMMAND_OUTPUT,
        timeout: DERIVED_COMMAND_TIMEOUT_MS,
      });
      if (res.status !== 0) {
        const why = res.error ? res.error.code || res.error.message : res.signal ? `signal ${res.signal}` : `exit ${res.status}`;
        const tail = outputTail(res);
        throw new SyncError(`the derived command "${command}" failed (${why}); nothing was committed.${tail ? `\n${tail}` : ''}`);
      }
    }

    const files = derived.length
      ? git.candidatePaths(derived, { at: dir }).filter((rel) => {
          const st = fs.lstatSync(path.join(dir, ...rel.split('/')), { throwIfNoEntry: false });
          return st && st.isFile();
        })
      : [];
    const shas = git.hashFiles(dir, files, { filters: true });
    const derivedEntries = files.map((rel, i) => {
      const st = fs.lstatSync(path.join(dir, ...rel.split('/')));
      return { path: rel, mode: st.mode & 0o111 ? '100755' : '100644', sha: shas[i] };
    });
    const tree = git.buildTree({
      base: head,
      remove: [machineDir, ...derived],
      add: [...ciFiles.map((f) => ({ path: f.path, mode: f.mode, sha: f.sha })), ...derivedEntries],
    });
    return git.commitTree(tree, head, SYNC_COMMIT_MESSAGE);
  } finally {
    if (added) git.removeWorktree(dir);
    else fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Brings the checkout's index and working tree to the new commit for the
 * owned paths it changed, as the module comment's step 4 states, and returns
 * what it wrote and what it left.
 */
function refreshCheckout({ git, root, head, commit, owned }) {
  const changed = git.changedPaths(head, commit);
  if (!changed.length) return { changed, written: [], left: [] };
  const staged = new Set(git.stagedPaths(head, owned));
  const differs = new Set([...git.unstagedPaths(owned), ...git.untrackedPaths(owned)]);
  const entries = new Map(git.listFiles(commit, changed).map((f) => [f.path, f]));

  const indexEntries = [];
  const checkout = [];
  const remove = [];
  const left = [];
  for (const p of changed) {
    if (staged.has(p)) {
      left.push({ path: p, staged: true });
      continue;
    }
    const entry = entries.get(p);
    indexEntries.push(entry ? { path: p, mode: entry.mode, sha: entry.sha } : { path: p, remove: true });
    if (differs.has(p)) left.push({ path: p, staged: false });
    else if (entry) checkout.push(p);
    else remove.push(p);
  }

  // Another git process may hold the index lock for a moment; the commit is already on the branch.
  for (let attempt = 1; ; attempt++) {
    try {
      git.updateIndex(indexEntries);
      break;
    } catch (err) {
      if (!(err instanceof GitError) || attempt >= 5) {
        const resettable = indexEntries.map((e) => e.path).join(' ');
        throw new SyncError(
          `${commit} is on the branch, but the index could not be updated (${err.message}); ` +
            `run \`git reset -q -- ${resettable}\` and then \`git checkout -- ${checkout.join(' ') || '.'}\` to bring these paths to it.`
        );
      }
      pause(200);
    }
  }
  git.checkoutPaths(checkout);
  for (const p of remove) {
    const abs = path.join(root, ...p.split('/'));
    fs.rmSync(abs, { force: true });
    for (let d = path.dirname(abs); d !== root && fs.existsSync(d) && fs.readdirSync(d).length === 0; d = path.dirname(d)) fs.rmdirSync(d);
  }
  return { changed, written: [...checkout, ...remove], left };
}

/**
 * Runs the sync. See the module comment.
 *
 * @param {Object} args
 * @param {import('./config.mjs').Project} args.project
 * @param {NodeJS.ProcessEnv} [args.env]
 * @param {string} [args.token]        the read-only token; without one, `origin` is fetched with git's own credentials.
 * @param {(...a:any[])=>void} [args.log]
 * @param {(...a:any[])=>void} [args.errlog]
 * @returns {{code:number, commit:string|null, written:string[], left:string[]}}
 */
export function runSync({ project, env = process.env, token, log = console.log, errlog = console.error }) {
  const result = { code: 0, commit: null, written: [], left: [] };
  const fail = (code, message) => {
    errlog(`sync: ${message}`);
    return { ...result, code };
  };
  const ci = project.config.ci;
  if (!ci) return fail(2, 'the configuration has no "ci" key; name the CI branch in ci.branch.');
  const settings = syncSettings(project.config.sync);
  const baseEnv = syncEnvironment(env);
  const commandEnv = { ...env };
  for (const name of [...GIT_LOCATION_VARIABLES, settings.tokenEnv, ...(token ? ['SSH_AUTH_SOCK'] : [])]) delete commandEnv[name];
  const projectRoot = fs.realpathSync(project.root);

  try {
    const root = fs.realpathSync(createGit({ cwd: projectRoot, env: baseEnv }).toplevel());
    // Every path below is relative to the repository root, and git reads a pathspec relative to its working
    // directory, so every git process of the sync runs there, wherever the configuration sits.
    const git = createGit({ cwd: root, env: baseEnv });
    const memRel = memoryPathInRepo(root, path.join(projectRoot, path.relative(project.root, project.memoryDir)));
    if (!memRel) return fail(2, `the memory directory ${project.memoryDir} is not inside the repository ${root}.`);
    const { machineDir } = branchPaths(memRel);
    const projRel = toPosix(path.relative(root, projectRoot));
    const derived = [];
    for (const p of settings.paths) {
      const rel = toPosix(path.relative(root, path.resolve(projectRoot, p)));
      if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return fail(2, `sync.paths: ${p} is not inside the repository ${root}.`);
      if (overlaps(rel, machineDir)) return fail(2, `sync.paths: ${p} overlaps the machine layer ${machineDir}/, which CI alone writes.`);
      derived.push(rel);
    }
    const owned = [machineDir, ...derived];

    const branch = git.currentBranch();
    if (!branch) return fail(2, 'HEAD is detached; check out the branch to sync into. Nothing was committed.');
    if (branch === ci.branch) return fail(2, `the checked-out branch is the CI branch "${ci.branch}"; check out the working branch. Nothing was committed.`);
    const busy = IN_PROGRESS.filter((name) => fs.existsSync(git.gitPath(name)));
    if (busy.length) return fail(1, `an operation is in progress (${busy.join(', ')}); finish or abort it first. Nothing was committed.`);
    removeAbandonedWorktrees(git);

    const source = fetchSource({ cwd: projectRoot, env: baseEnv, token });
    if (!source.git.remoteHead(ci.branch)) {
      log(`sync: ${source.label} has no branch ${ci.branch} yet: nothing to sync.`);
      return result;
    }
    const ciCommit = source.git.fetchInto(ci.branch, `refs/remotes/${REMOTE}/${ci.branch}`);
    const ciFiles = git.listFiles(ciCommit, [machineDir]);
    const held = git.blobVersions(ciCommit, machineDir);

    for (let attempt = 1; attempt <= SYNC_ATTEMPTS; attempt++) {
      const head = git.resolveCommit('HEAD');
      if (!head) return fail(2, `the branch ${branch} has no commit yet. Nothing was committed.`);

      const modified = [...new Set([...git.stagedPaths(head, [machineDir]), ...git.unstagedPaths([machineDir]), ...git.untrackedPaths([machineDir])])].sort();
      if (modified.length) {
        for (const p of modified) errlog(`sync: ${p} differs from HEAD in the index or the working tree: the machine layer is written by CI alone, so it is never overwritten.`);
        return fail(1, 'restore the machine layer to HEAD\'s (or remove the files HEAD lacks), then sync again. Nothing was committed.');
      }
      const foreign = git.listFiles(head, [machineDir]).filter((f) => !held.has(`${f.path}\0${f.sha}`));
      if (foreign.length) {
        for (const f of foreign) errlog(`sync: ${f.path} at HEAD is a version ${ci.branch} never held: the machine layer is written by CI alone.`);
        return fail(1, `restore it from ${ci.branch} or from an earlier commit, then sync again. Nothing was committed.`);
      }
      if (git.objectAt(head, machineDir) === git.objectAt(ciCommit, machineDir)) {
        log(`sync: the machine layer at HEAD equals ${ci.branch}'s at ${ciCommit}: no commit.`);
        return result;
      }

      const commit = buildCommit({ git, root, head, ciCommit, ciFiles, machineDir, derived, projRel, projectRoot, settings, commandEnv });
      if (!git.updateRef('HEAD', commit, head, `commit: ${SYNC_COMMIT_MESSAGE}`)) {
        log(`sync: ${branch} moved from ${head} while the sync ran; building again on its new head.`);
        continue;
      }
      const { changed, written, left } = refreshCheckout({ git, root, head, commit, owned });
      log(`sync: committed ${commit} on ${branch}: the machine layer of ${ci.branch} at ${ciCommit}, ${changed.length} path(s) changed.`);
      for (const l of left) {
        log(
          l.staged
            ? `sync: left ${l.path}: it has staged changes, so its index entry and working-tree copy stay as they are; the commit holds the version regenerated from HEAD.`
            : `sync: left ${l.path}: its working-tree copy differs from HEAD's, so it stays as it is; the commit holds the version regenerated from HEAD.`
        );
      }
      return { code: 0, commit, written, left: left.map((l) => l.path) };
    }
    return fail(1, `${branch} moved during each of ${SYNC_ATTEMPTS} attempts. Nothing was committed.`);
  } catch (err) {
    if (err instanceof SyncError || err instanceof GitError) return fail(err instanceof SyncError ? err.code : 1, err.message);
    throw err;
  }
}

/** Waits `ms` milliseconds, or less when `signal` aborts. */
function defaultSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal && signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', done);
      resolve();
    }
    if (signal) signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * Runs the watcher. See the module comment.
 *
 * @param {Object} args
 * @param {import('./config.mjs').Project} args.project
 * @param {NodeJS.ProcessEnv} [args.env]
 * @param {string} [args.envFile]      a dotenv file the token is read from when the environment lacks it.
 * @param {typeof fs} [args.fsImpl]
 * @param {(...a:any[])=>void} [args.log]
 * @param {(...a:any[])=>void} [args.errlog]
 * @param {(ms:number, signal?:AbortSignal)=>Promise<void>} [args.sleep]  the wait between polls.
 * @param {number} [args.cycles]        how many polls before it returns (default: no limit).
 * @param {AbortSignal} [args.signal]   stops the watcher after the poll in progress.
 * @returns {Promise<{code:number, syncs:number}>}
 */
export async function runWatch({
  project,
  env = process.env,
  envFile,
  fsImpl = fs,
  log = console.log,
  errlog = console.error,
  sleep = defaultSleep,
  cycles = Infinity,
  signal,
}) {
  const ci = project.config.ci;
  if (!ci) {
    errlog('watch: the configuration has no "ci" key; name the CI branch in ci.branch.');
    return { code: 2, syncs: 0 };
  }
  const settings = syncSettings(project.config.sync);
  const where = envFile ? `the environment or ${envFile}` : 'the environment';
  let idle = false;
  let polling = null;
  let synced;
  let lastProblem = null;
  let syncs = 0;

  for (let cycle = 0; cycle < cycles && !(signal && signal.aborted); cycle++) {
    if (cycle > 0) await sleep(settings.intervalSeconds * 1000, signal);
    if (signal && signal.aborted) break;
    const token = readToken({ env, tokenEnv: settings.tokenEnv, envFile, fsImpl });
    if (!token) {
      if (!idle) {
        log(`watch: ${settings.tokenEnv} is not set in ${where}: idle. The CI branch is fetched with that read-only token alone; checking for it every ${settings.intervalSeconds} s.`);
        idle = true;
        polling = null;
      }
      continue;
    }
    idle = false;
    try {
      const source = fetchSource({ cwd: project.root, env: syncEnvironment(env), token });
      if (polling !== source.label) {
        log(`watch: polling ${source.label} for ${ci.branch} every ${settings.intervalSeconds} s.`);
        polling = source.label;
      }
      const head = source.git.remoteHead(ci.branch);
      lastProblem = null;
      if (!head) {
        if (synced !== null) log(`watch: ${source.label} has no branch ${ci.branch} yet.`);
        synced = null;
        continue;
      }
      if (head === synced) continue;
      log(`watch: ${ci.branch} is at ${head}: running sync.`);
      syncs += 1;
      if (runSync({ project, env, token, log, errlog }).code === 0) synced = head;
    } catch (err) {
      if (!(err instanceof SyncError || err instanceof GitError)) throw err;
      if (err.message !== lastProblem) errlog(`watch: ${err.message}`);
      lastProblem = err.message;
    }
  }
  return { code: 0, syncs };
}

export default {
  runSync,
  runWatch,
  fetchUrlFor,
  fetchSource,
  readEnvFileValue,
  readToken,
  SyncError,
  SYNC_COMMIT_MESSAGE,
  SYNC_ATTEMPTS,
  DERIVED_COMMAND_TIMEOUT_MS,
};
