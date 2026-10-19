/**
 * git.mjs — The git operations the CI command, the deploy-time overlay and the
 * sync make, through the `git` program.
 *
 * READS a repository's refs, trees, blobs, index and working tree, and a remote's
 * branch through `ls-remote` and `fetch`. WRITES only through git, and only
 * these: objects (blobs, trees, commits) into the repository's object store; the
 * `FETCH_HEAD` and shallow records a fetch leaves, and the one ref a
 * `fetchInto` names; a temporary index file it creates and removes; a temporary
 * worktree it adds and removes, with git's administrative entry for it; through
 * `push`, the one remote branch a caller names; and, for the sync alone, the
 * checked-out branch (`updateRef` on `HEAD`, a compare-and-swap) and the entries
 * of the checkout's index and working tree that `updateIndex` and `checkoutPaths`
 * are given. A commit is always built from a temporary index with `commit-tree`;
 * the CI command pushes it by an explicit `<commit>:refs/heads/<branch>` refspec,
 * and only the sync moves a local branch.
 *
 * EVERY GIT PROCESS runs with `GIT_TERMINAL_PROMPT=0`, so a missing credential
 * fails at once rather than waiting for input that never comes.
 *
 * A TOKEN, when one is given, reaches git through the environment configuration
 * (`GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_VALUE_<n>`) as an HTTP
 * extra header scoped to the server's URL — the header `actions/checkout`
 * writes into a repository's configuration. It is therefore in no argument list
 * and in no file, it is sent to that server only, and no message here contains
 * it: every message carrying git's own output passes through `redactCredentials`
 * first, because git may print a remote URL that holds a credential.
 *
 * THE PROTOCOLS, when a caller names them, are the only transports git may use:
 * `GIT_ALLOW_PROTOCOL` holds them, so a URL that configuration rewrites to
 * another transport is refused by git before it connects; and, unless `ssh` is
 * among them, `SSH_AUTH_SOCK` is removed, so no SSH agent is reachable.
 *
 * Runs at CI and build time, and in a development container's watcher, under
 * Node.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The remote every operation here reads from and pushes to. */
export const REMOTE = 'origin';

/** The server a token is scoped to when the environment names none. */
export const DEFAULT_SERVER_URL = 'https://github.com';

/** The largest output read from one git process: a memory layer is a JSON file, far below this. */
const MAX_BUFFER = 256 * 1024 * 1024;

/** A git command failed. The message names the command and git's last line of output, credentials removed. */
export class GitError extends Error {
  constructor(message, { code = null } = {}) {
    super(message);
    this.name = 'GitError';
    this.code = code;
  }
}

/**
 * Removes the user-information part of every URL in `text`
 * (`https://user:secret@host/` → `https://***@host/`).
 *
 * @param {string} text
 * @returns {string}
 */
export function redactCredentials(text) {
  return String(text).replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1***@');
}

/** The last non-empty line of a process's error output, credentials removed. */
function lastLine(buffer) {
  const lines = String(buffer || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return redactCredentials(lines.length ? lines[lines.length - 1] : '');
}

/**
 * The environment a git process runs with: the caller's, with prompts off; when
 * a token is given, the extra header scoped to `serverUrl`, appended after any
 * configuration the environment already declares; and when `protocols` is given,
 * `GIT_ALLOW_PROTOCOL` set to them and, unless `ssh` is one, no `SSH_AUTH_SOCK`.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {Object} [opts]
 * @param {string} [opts.token]
 * @param {string} [opts.serverUrl]
 * @param {string[]} [opts.protocols]  the only transports git may use (`https`, `file`, …).
 * @returns {NodeJS.ProcessEnv}
 */
export function gitEnvironment(env, { token, serverUrl = DEFAULT_SERVER_URL, protocols } = {}) {
  const out = { ...env, GIT_TERMINAL_PROMPT: '0' };
  if (Array.isArray(protocols)) {
    out.GIT_ALLOW_PROTOCOL = protocols.join(':');
    if (!protocols.includes('ssh')) delete out.SSH_AUTH_SOCK;
  }
  if (typeof token === 'string' && token !== '') {
    const count = Number.parseInt(env.GIT_CONFIG_COUNT || '0', 10) || 0;
    const base = String(serverUrl).replace(/\/+$/, '');
    out[`GIT_CONFIG_KEY_${count}`] = `http.${base}/.extraheader`;
    out[`GIT_CONFIG_VALUE_${count}`] = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
    out.GIT_CONFIG_COUNT = String(count + 1);
  }
  return out;
}

/** The object id git writes for "no object": a removal in `--index-info`, an absent side in a diff. */
const ZERO_OID = '0'.repeat(40);

/**
 * Creates the git operations bound to a working directory and an environment.
 *
 * @param {Object} args
 * @param {string} args.cwd                where git runs (inside the repository).
 * @param {NodeJS.ProcessEnv} [args.env]   the environment git runs with.
 * @param {string} [args.token]            a token for the server, sent as an extra header.
 * @param {string} [args.serverUrl]        the server the token is scoped to.
 * @param {string} [args.remote]           what `ls-remote`, `fetch` and `push` address: a remote's
 *                                         name or a URL (default `origin`).
 * @param {string[]} [args.protocols]      the only transports git may use (see `gitEnvironment`).
 */
export function createGit({ cwd, env = process.env, token, serverUrl, remote = REMOTE, protocols } = {}) {
  const baseEnv = gitEnvironment(env, { token, serverUrl, protocols });

  /** Runs git and returns its exit status and output, throwing only when git cannot start. */
  function run(args, { input, extraEnv = {}, at = cwd } = {}) {
    const res = spawnSync('git', args, {
      cwd: at,
      env: { ...baseEnv, ...extraEnv },
      input,
      maxBuffer: MAX_BUFFER,
    });
    if (res.error) throw new GitError(`git ${args[0]}: could not run git (${res.error.code || res.error.message})`);
    return { status: res.status, stdout: res.stdout, stderr: res.stderr };
  }

  /** Runs git and returns its standard output, throwing a GitError on a non-zero exit. */
  function must(args, opts) {
    const res = run(args, opts);
    if (res.status !== 0) {
      throw new GitError(`git ${args[0]} failed (exit ${res.status}): ${lastLine(res.stderr)}`, { code: res.status });
    }
    return res.stdout;
  }

  const text = (buffer) => String(buffer).trim();
  const records = (buffer) => String(buffer).split('\0').filter(Boolean);
  const pathspec = (paths) => ['--', ...paths];

  /** One `--index-info` record per entry: `{ path, mode, sha }` sets an entry, `{ path, remove: true }` removes it. */
  const indexInfo = (entries) =>
    entries.map((e) => (e.remove ? `0 ${ZERO_OID}\t${e.path}\0` : `${e.mode} ${e.sha}\t${e.path}\0`)).join('');

  /**
   * Builds a tree from a temporary index: seeded from `base`'s tree (or empty),
   * with every entry under `remove` taken out and every entry of `add` put in,
   * in that order. Nothing but the temporary index file, which is removed, and
   * the tree object is written.
   */
  function buildTree({ base = null, remove = [], add = [], at = cwd }) {
    const indexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-index-'));
    const extraEnv = { GIT_INDEX_FILE: path.join(indexDir, 'index') };
    try {
      must(base ? ['read-tree', base] : ['read-tree', '--empty'], { extraEnv, at });
      const removed = remove.length ? records(must(['ls-files', '-z', ...pathspec(remove)], { extraEnv, at })).map((p) => ({ path: p, remove: true })) : [];
      const input = indexInfo([...removed, ...add]);
      if (input) must(['update-index', '-z', '--index-info'], { input, extraEnv, at });
      return text(must(['write-tree'], { extraEnv, at }));
    } finally {
      fs.rmSync(indexDir, { recursive: true, force: true });
    }
  }

  /**
   * Writes the given files of a directory into the object store and returns
   * their blobs, in order. With `filters`, git's attributes for each path apply,
   * as `git add` applies them; without, the bytes are stored exactly.
   */
  function hashFiles(root, files, { filters = false } = {}) {
    if (!files.length) return [];
    const args = ['hash-object', '-w', ...(filters ? [] : ['--no-filters']), '--stdin-paths'];
    return text(must(args, { input: files.join('\n') + '\n', at: root })).split('\n');
  }

  /** The commit `refs/heads/<branch>` names on the remote, or null when it has no such branch. Throws when the remote cannot be read. */
  function remoteHead(branch) {
    const res = run(['ls-remote', '--exit-code', remote, `refs/heads/${branch}`]);
    if (res.status === 0) return text(res.stdout).split(/\s+/)[0] || null;
    if (res.status === 2) return null;
    throw new GitError(`git ls-remote failed (exit ${res.status}): ${lastLine(res.stderr)}`, { code: res.status });
  }

  return {
    run,
    buildTree,
    hashFiles,
    remoteHead,

    /** The repository's top-level directory. */
    toplevel() {
      return text(must(['rev-parse', '--show-toplevel']));
    },

    /** The absolute path of `name` inside the repository's git directory (`MERGE_HEAD`, `rebase-merge`, …). */
    gitPath(name) {
      return text(must(['rev-parse', '--path-format=absolute', '--git-path', name]));
    },

    /** A configuration value as git reads it, or null when it is not set. */
    configValue(key) {
      const res = run(['config', '--get', key]);
      return res.status === 0 ? text(res.stdout) : null;
    },

    /** The checked-out branch's short name, or null when HEAD is detached. */
    currentBranch() {
      const res = run(['symbolic-ref', '--quiet', '--short', 'HEAD']);
      return res.status === 0 ? text(res.stdout) : null;
    },

    /** Whether the remote holds `refs/heads/<branch>`. Throws when the remote cannot be read. */
    remoteBranchExists(branch) {
      return remoteHead(branch) !== null;
    },

    /**
     * Fetches the tip of the remote's `branch` into `FETCH_HEAD`, one commit
     * deep, and returns that commit. Throws a GitError on failure.
     */
    fetchBranch(branch) {
      must(['fetch', '--quiet', '--no-tags', '--depth=1', remote, `refs/heads/${branch}`]);
      return text(must(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']));
    },

    /**
     * Fetches the remote's `branch`, with its whole history, into `ref`, and
     * returns the commit `ref` then names. Throws a GitError on failure.
     */
    fetchInto(branch, ref) {
      must(['fetch', '--quiet', '--no-tags', remote, `+refs/heads/${branch}:${ref}`]);
      return text(must(['rev-parse', '--verify', `${ref}^{commit}`]));
    },

    /** The commit a ref names, or null when it names none. */
    resolveCommit(ref) {
      const res = run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      return res.status === 0 ? text(res.stdout) : null;
    },

    /** The tree of a commit. */
    treeOf(commit) {
      return text(must(['rev-parse', '--verify', `${commit}^{tree}`]));
    },

    /** The object a commit holds at a repository-relative path, or null when it holds none. */
    objectAt(commit, rel) {
      const res = run(['rev-parse', '--verify', '--quiet', `${commit}:${rel}`]);
      return res.status === 0 ? text(res.stdout) : null;
    },

    /**
     * The regular files of a commit under the given repository-relative paths,
     * as `{ path, sha, mode }`, in git's order.
     */
    listFiles(commit, paths) {
      const out = must(['ls-tree', '-r', '-z', '--full-tree', commit, ...pathspec(paths)]);
      const files = [];
      for (const record of records(out)) {
        const tab = record.indexOf('\t');
        const [mode, type, sha] = record.slice(0, tab).split(' ');
        if (type === 'blob' && (mode === '100644' || mode === '100755')) files.push({ path: record.slice(tab + 1), sha, mode });
      }
      return files;
    },

    /**
     * Every version a history held under `dir`, as `<path>\0<blob>` strings:
     * each one enters the history at the commit that introduces it, so the
     * destination side of every commit's raw diff, the root commit's included,
     * is the whole set.
     */
    blobVersions(commit, dir) {
      const out = must(['log', '--root', '-m', '--raw', '-z', '--no-abbrev', '--no-renames', '--format=', commit, ...pathspec([dir])]);
      const versions = new Set();
      const fields = String(out).split('\0');
      for (let i = 0; i < fields.length - 1; i++) {
        const meta = fields[i].replace(/^\n+/, '');
        if (!meta.startsWith(':')) continue;
        const [, , , dst] = meta.slice(1).split(' ');
        const file = fields[i + 1];
        i += 1;
        if (dst && dst !== ZERO_OID) versions.add(`${file}\0${dst}`);
      }
      return versions;
    },

    /** A blob's bytes. */
    readBlob(sha) {
      return must(['cat-file', 'blob', sha]);
    },

    /**
     * Writes the given files of the working tree as a tree object, from a
     * temporary index, and returns the tree. `files` are repository-relative
     * paths; their bytes are stored exactly, with no filter applied.
     */
    writeTree(root, files) {
      const shas = hashFiles(root, files);
      return buildTree({ add: files.map((file, i) => ({ path: file, mode: '100644', sha: shas[i] })), at: root });
    },

    /** Creates a commit of `tree` with `parent` (or none) and `message`, and returns it. */
    commitTree(tree, parent, message) {
      return text(must(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]));
    },

    /**
     * Moves `ref` (through a symbolic ref such as `HEAD`, the branch it names) to
     * `next`, only while it still names `prev`: a compare-and-swap. Returns
     * false when the ref has moved meanwhile, and throws a GitError on any
     * other failure.
     */
    updateRef(ref, next, prev, message) {
      const res = run(['update-ref', '-m', message, ref, next, prev]);
      if (res.status === 0) return true;
      const now = run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      if (now.status === 0 && text(now.stdout) !== prev) return false;
      throw new GitError(`git update-ref failed (exit ${res.status}): ${lastLine(res.stderr)}`, { code: res.status });
    },

    /** The paths whose entries differ between two commits. */
    changedPaths(from, to) {
      return records(must(['diff-tree', '-r', '-z', '--no-renames', '--name-only', from, to]));
    },

    /** The paths under `paths` whose index entries differ from `commit`'s. */
    stagedPaths(commit, paths) {
      return records(must(['diff', '--cached', '-z', '--no-renames', '--name-only', commit, ...pathspec(paths)]));
    },

    /** The paths under `paths` whose working-tree files differ from their index entries. */
    unstagedPaths(paths) {
      return records(must(['diff', '-z', '--no-renames', '--name-only', ...pathspec(paths)]));
    },

    /** The files under `paths` in the working tree that the index does not hold and no ignore rule covers. */
    untrackedPaths(paths, { at = cwd } = {}) {
      return records(must(['ls-files', '-z', '--others', '--exclude-standard', ...pathspec(paths)], { at }));
    },

    /** The files under `paths` the index holds, plus those it does not and no ignore rule covers. */
    candidatePaths(paths, { at = cwd } = {}) {
      return records(must(['ls-files', '-z', '--cached', '--others', '--exclude-standard', ...pathspec(paths)], { at }));
    },

    /** Sets or removes entries of the checkout's own index (`{ path, mode, sha }` or `{ path, remove: true }`). */
    updateIndex(entries) {
      if (entries.length) must(['update-index', '-z', '--index-info'], { input: indexInfo(entries) });
    },

    /** Writes the given paths' index entries into the working tree, recording their state in the index. */
    checkoutPaths(paths) {
      if (paths.length) must(['checkout-index', '-f', '-u', '-z', '--stdin'], { input: paths.map((p) => `${p}\0`).join('') });
    },

    /**
     * Adds a detached worktree of `commit` at `dir`, an empty directory, locked
     * with `reason` so that nothing prunes it while it is in use. No hook runs:
     * the worktree is read by the caller and removed.
     */
    addWorktree(dir, commit, reason) {
      must(['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--quiet', '--detach', '--lock', '--reason', reason, dir, commit]);
    },

    /** Removes a worktree, locked or not, and git's entry for it, whatever it holds; a missing directory leaves only the entry, which is pruned. */
    removeWorktree(dir) {
      if (run(['worktree', 'remove', '--force', '--force', dir]).status === 0) return;
      fs.rmSync(dir, { recursive: true, force: true });
      run(['worktree', 'unlock', dir]);
      must(['worktree', 'prune']);
    },

    /** The repository's worktrees, the main one first, as `{ path, locked }` — `locked` the lock's reason, `''` for a lock with none, or null. */
    listWorktrees() {
      const worktrees = [];
      for (const line of String(must(['worktree', 'list', '--porcelain', '-z'])).split('\0')) {
        if (line.startsWith('worktree ')) worktrees.push({ path: line.slice('worktree '.length), locked: null });
        else if (worktrees.length && (line === 'locked' || line.startsWith('locked '))) worktrees[worktrees.length - 1].locked = line.slice('locked '.length);
      }
      return worktrees;
    },

    /** Pushes `commit` to the remote's `refs/heads/<branch>`, and to nothing else. */
    push(commit, branch) {
      must(['push', '--quiet', remote, `${commit}:refs/heads/${branch}`]);
    },
  };
}

export default { createGit, gitEnvironment, redactCredentials, GitError, REMOTE, DEFAULT_SERVER_URL };
