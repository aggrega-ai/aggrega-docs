/**
 * ci.mjs — The CI command, `l10n ci`, and the deploy-time overlay,
 * `l10n overlay`: the CI branch's one writer and its deploy-time reader. The
 * sync (`sync.mjs`), which brings the branch's machine layer into a checkout's
 * working branch, reads it through the helpers exported here.
 *
 * THE CI BRANCH is the branch the configuration names (`ci.branch`). It holds
 * the memory directory's machine layer and pending file, at their paths in the
 * repository, and nothing else, and `l10n ci` is the only thing that writes it.
 * The working branch — the one checked out, and the dispatch ref — is never
 * committed to, moved or pushed by either command.
 *
 * `runCi` READS the remote's CI branch, the checkout's source content, human
 * layer, prompts and glossary (through the steps its caller hands it: extract,
 * collect, submit, cancel, and the pending file's reader), and from the environment `GITHUB_TOKEN`,
 * `GITHUB_REPOSITORY`, `GITHUB_API_URL` and `GITHUB_SERVER_URL`. It WRITES, in
 * the checkout, the memory directory's machine layer, pending file, catalogue,
 * source map and job log; in the repository's object store, the CI branch's new
 * commit; on the remote, the CI branch alone; through GitHub's REST API, the
 * collector's switch and one workflow dispatch; and, through the Message
 * Batches API, the cancellation of a batch it submitted when nothing then
 * reached the CI branch. In order:
 *
 *   1. it refuses when the checked-out branch is the CI branch;
 *   2. it fetches the CI branch and copies its machine layer and pending file
 *      over the checkout's — or, when the remote has no such branch, it will
 *      create it as an orphan branch;
 *   3. `extract`, so the catalogue is the checked-out content's rather than
 *      whatever was committed;
 *   4. `collect`;
 *   5. `submit`, unless `collect` left a batch recorded that has not ended —
 *      one batch at a time is in flight, and a submission then would be refused;
 *   6. it commits the machine layer and the pending file as they now stand, on
 *      top of the fetched commit, with `CI_COMMIT_MESSAGE` — unless their tree
 *      equals the fetched commit's, when it commits and pushes nothing;
 *   7. it pushes that commit to the CI branch, and to nothing else;
 *   8. when the configuration names a collector (`ci.collector`), it switches
 *      that workflow on when the pending file it left records a batch, and off
 *      when it records none (`PUT …/actions/workflows/{collector}/enable` or
 *      `…/disable`), whatever state the collector is in;
 *   9. when the collection applied at least one translation and the push
 *      succeeded, it dispatches the workflow `ci.dispatch` names, on its ref.
 * The commit and the push run even when a step failed, so what a collection
 * applied is never lost to a later failure; the command then exits with the
 * failing step's code. The switch runs only once the CI branch holds the
 * pending file it reads, so a batch is never recorded with the collector
 * switched off by this run. A refused switch-on exits 1, after the push and
 * the dispatch, and the batch stays recorded for the next push or manual run;
 * a refused switch-off is printed and changes no exit code, since a collector
 * left on finds nothing to collect.
 *
 * WHEN NOTHING REACHES THE CI BRANCH — the commit or the push fails — after
 * `submit` created a batch in the same run, that batch is recorded only in this
 * checkout's pending file, which CI discards, and the next run would submit the
 * same units again. So the command cancels that batch through the Message
 * Batches API (the `cancel` step), prints its id and whether the cancellation
 * was accepted, and exits 1. Requests the API had already processed, or that
 * were in progress and could not be interrupted, may still be billed. With no
 * batch created in the run, it cancels nothing and exits 1. When `submit`
 * created a batch and could not record it in the pending file, `submit` has
 * already asked for its cancellation (`batch.mjs`): the command exits 1, never
 * cancels that batch again, and, when nothing reaches the CI branch either,
 * prints that the batch is recorded in no pending file.
 *
 * `runOverlay` READS the CI branch — fetched from the remote with whatever
 * credentials git has, else the copy a checkout of every branch left at
 * `refs/remotes/origin/<branch>` — and WRITES the checkout's machine-layer
 * files, each replaced by the CI branch's copy; a file the branch lacks is left
 * as it is. It prints the commit it read. When neither source has the branch —
 * a first deploy before any CI run, or no credential for a private repository —
 * it prints that the build uses the committed memory and exits 0.
 *
 * THE TOKEN (`GITHUB_TOKEN`) is read by `runCi` alone, handed to its git
 * processes as an extra header (`git.mjs`) and to the dispatch request as a
 * bearer token, as it is to the collector's switch, and never printed.
 * `runOverlay` reads no token.
 *
 * Runs at CI and build time only, under Node.
 */

import fs from 'node:fs';
import path from 'node:path';

import { createGit, DEFAULT_SERVER_URL, GitError, REMOTE } from './git.mjs';

/** The one-line message of every commit on the CI branch. */
export const CI_COMMIT_MESSAGE = 'Update the machine translation layer and the pending batches';

/** The GitHub REST API's address when the environment names none. */
export const DEFAULT_API_URL = 'https://api.github.com';

/** A request about a workflow — its dispatch, or switching it on or off — failed or was refused. */
export class WorkflowRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkflowRequestError';
  }
}

/**
 * The requests `workflowRequest` sends: the method and the last segment of
 * `/repos/{owner}/{repo}/actions/workflows/{workflow}/<segment>`.
 */
const WORKFLOW_REQUESTS = Object.freeze({
  dispatch: Object.freeze({ method: 'POST', segment: 'dispatches' }),
  enable: Object.freeze({ method: 'PUT', segment: 'enable' }),
  disable: Object.freeze({ method: 'PUT', segment: 'disable' }),
});

const toPosix = (p) => p.split(path.sep).join('/');

/**
 * The memory directory relative to the repository root, as git names paths, or
 * null when it lies outside the repository.
 */
export function memoryPathInRepo(root, memoryDir) {
  const rel = toPosix(path.relative(root, memoryDir));
  if (rel === '' || rel.startsWith('../') || rel === '..' || path.isAbsolute(rel)) return null;
  return rel;
}

/** The paths, relative to the repository, that the CI branch holds: the machine layer's directory and the pending file. */
export function branchPaths(memRel) {
  return { machineDir: `${memRel}/machine`, pending: `${memRel}/pending.json` };
}

/**
 * Copies the files a commit holds under `paths` into the directory tree at
 * `root`, each replacing the file at the same path.
 *
 * @returns {string[]} the repository-relative paths written.
 */
export function copyFromCommit(git, root, commit, paths) {
  const written = [];
  for (const { path: rel, sha } of git.listFiles(commit, paths)) {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, git.readBlob(sha));
    written.push(rel);
  }
  return written;
}

/** The machine-layer files and the pending file present in the working tree, repository-relative and sorted. */
function workingFiles(root, memRel) {
  const { machineDir, pending } = branchPaths(memRel);
  const files = [];
  const machineAbs = path.join(root, ...machineDir.split('/'));
  if (fs.existsSync(machineAbs)) {
    for (const rel of fs.readdirSync(machineAbs, { recursive: true })) {
      const name = toPosix(String(rel));
      // A layer file is JSON; an interrupted atomic write can leave a `.tmp-` file beside it.
      if (!name.endsWith('.json') || name.includes('.tmp-')) continue;
      if (fs.statSync(path.join(machineAbs, String(rel))).isFile()) files.push(`${machineDir}/${name}`);
    }
  }
  if (fs.existsSync(path.join(root, ...pending.split('/')))) files.push(pending);
  return files.sort();
}

/**
 * Sends one request about a workflow to GitHub's REST API, with the job's token
 * as a bearer token: `dispatch` (`POST …/actions/workflows/{workflow}/dispatches`,
 * with the ref as its body), `enable` or `disable` (`PUT …/enable`,
 * `PUT …/disable`, with no body). GitHub accepts the workflow's file name in
 * place of its id. Any 2xx answer is success; anything else, or a request that
 * cannot be sent, throws a WorkflowRequestError naming the method and the URL.
 * The token never appears in the message of an error.
 *
 * @param {Object} args
 * @param {'dispatch'|'enable'|'disable'} args.request
 * @param {string} args.apiUrl       the REST API's address.
 * @param {string} args.repository   `owner/repo`.
 * @param {string} args.token
 * @param {string} args.workflow     the workflow's file name.
 * @param {string} [args.ref]        for `dispatch`: the branch it runs on.
 * @param {typeof fetch} args.fetchImpl
 * @returns {Promise<{method:string, url:string, status:number}>}
 */
export async function workflowRequest({ request, apiUrl, repository, token, workflow, ref, fetchImpl }) {
  const { method, segment } = WORKFLOW_REQUESTS[request];
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository || ''))) {
    throw new WorkflowRequestError(`GITHUB_REPOSITORY is not set to "owner/repo": no ${method} request for ${workflow} can be sent.`);
  }
  if (typeof token !== 'string' || token === '') {
    throw new WorkflowRequestError(`GITHUB_TOKEN is not set: no ${method} request for ${workflow} can be sent.`);
  }
  const url = `${String(apiUrl).replace(/\/+$/, '')}/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/${segment}`;
  const init = {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(request === 'dispatch' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(request === 'dispatch' ? { body: JSON.stringify({ ref }) } : {}),
  };
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    throw new WorkflowRequestError(`the request ${method} ${url} failed: ${(err && err.message) || err}`);
  }
  if (!res || typeof res.status !== 'number' || res.status < 200 || res.status > 299) {
    throw new WorkflowRequestError(`the request ${method} ${url} was answered ${res && res.status}.`);
  }
  return { method, url, status: res.status };
}

/**
 * Runs the CI command. See the module comment for the order of its steps.
 *
 * @param {Object} args
 * @param {import('./config.mjs').Project} args.project
 * @param {NodeJS.ProcessEnv} args.env
 * @param {{extract: () => Promise<{unitCount:number}>, collect: () => Promise<{code:number, applied?:number, waiting?:string[]}>, submit: () => Promise<{code:number, action:string, batchId?:string, canceled?:boolean}>, cancel: (batchId:string) => Promise<{code:number, status?:string, reason?:string}>, readPending: () => {batches:Array<Object>}}} args.steps
 *        the existing commands, the batch transport's cancellation and the store's reader of the pending file, bound to the project by the caller.
 * @param {typeof fetch} [args.fetchImpl]  what the requests to GitHub's REST API — the dispatch, the collector's switch — are sent with.
 * @param {(...a:any[])=>void} [args.log]
 * @param {(...a:any[])=>void} [args.errlog]
 * @returns {Promise<{code:number, commit:string|null, pushed:boolean, dispatched:boolean, applied:number, batchId:string|null, canceled:boolean, collector:'enabled'|'disabled'|null}>}
 *          `batchId` is the batch `submit` created in this run, or null; `canceled`, whether its cancellation was accepted,
 *          by this command or, for a batch the pending file could not record, by `submit`; `collector`, the state GitHub
 *          accepted for the collector workflow, or null when the configuration names none or the switch was refused.
 */
export async function runCi({ project, env, steps, fetchImpl = globalThis.fetch, log = console.log, errlog = console.error }) {
  const result = { code: 0, commit: null, pushed: false, dispatched: false, applied: 0, batchId: null, canceled: false, collector: null };
  const ci = project.config.ci;
  if (!ci) {
    errlog('ci: the configuration has no "ci" key; name the CI branch in ci.branch.');
    return { ...result, code: 2 };
  }
  const token = env.GITHUB_TOKEN;
  const git = createGit({ cwd: project.root, env, token, serverUrl: env.GITHUB_SERVER_URL || DEFAULT_SERVER_URL });

  let root;
  let memRel;
  let parent = null;
  try {
    root = git.toplevel();
    memRel = memoryPathInRepo(root, project.memoryDir);
    if (!memRel) {
      errlog(`ci: the memory directory ${project.memoryDir} is not inside the repository ${root}.`);
      return { ...result, code: 2 };
    }
    const current = git.currentBranch();
    if (current === ci.branch) {
      errlog(`ci: the checked-out branch is the CI branch "${ci.branch}"; check out the working branch. Nothing was written.`);
      return { ...result, code: 2 };
    }
    const { machineDir, pending } = branchPaths(memRel);
    if (git.remoteBranchExists(ci.branch)) {
      parent = git.fetchBranch(ci.branch);
      const copied = copyFromCommit(git, root, parent, [machineDir, pending]);
      log(`ci: read ${ci.branch} at ${parent}: ${copied.length} file(s) of the machine layer and the pending file.`);
    } else {
      log(`ci: ${REMOTE} has no branch ${ci.branch}; it is created as an orphan branch holding only ${machineDir}/ and ${pending}.`);
    }
  } catch (err) {
    if (err instanceof GitError) {
      errlog(`ci: ${err.message}`);
      return { ...result, code: 1 };
    }
    throw err;
  }

  let failure = null;
  // A batch `submit` created but could not record: `submit` has already canceled it, or said it could not.
  let unrecorded = false;
  try {
    const extracted = await steps.extract();
    log(`ci: extract: ${extracted.unitCount} source units.`);
    const collected = await steps.collect();
    result.applied = collected.applied || 0;
    if (collected.code !== 0) {
      result.code = collected.code;
      log('ci: the collection failed: no submission.');
    } else if (collected.waiting && collected.waiting.length > 0) {
      log(`ci: batch ${collected.waiting.join(', ')} has not ended: no submission until it is collected.`);
    } else {
      const submitted = await steps.submit();
      if (submitted.code !== 0) result.code = submitted.code;
      if (submitted.batchId) result.batchId = submitted.batchId;
      if (submitted.action === 'unrecorded') {
        unrecorded = true;
        result.canceled = submitted.canceled === true;
      }
    }
  } catch (err) {
    failure = err;
  }

  try {
    const files = workingFiles(root, memRel);
    const tree = git.writeTree(root, files);
    const unchanged = parent ? git.treeOf(parent) === tree : files.length === 0;
    if (unchanged) {
      log('ci: the machine layer and the pending file are unchanged: no commit, no push.');
    } else {
      result.commit = git.commitTree(tree, parent, CI_COMMIT_MESSAGE);
      git.push(result.commit, ci.branch);
      result.pushed = true;
      log(`ci: pushed ${result.commit} to ${ci.branch} (${files.length} file(s)).`);
    }
  } catch (err) {
    if (!(err instanceof GitError)) throw failure || err;
    errlog(`ci: ${err.message}`);
    if (result.batchId && unrecorded) {
      errlog(
        `ci: nothing reached ${ci.branch}; batch ${result.batchId}, submitted in this run, is recorded in no pending file, ` +
          'and submit printed above whether its cancellation was accepted.'
      );
    } else if (result.batchId) {
      const canceled = await steps.cancel(result.batchId);
      if (canceled.code === 0) {
        result.canceled = true;
        errlog(
          `ci: nothing reached ${ci.branch}, so batch ${result.batchId}, submitted in this run, was canceled: the API accepted the cancellation ` +
            `(processing status: ${canceled.status}); requests it had already processed may still be billed.`
        );
      } else {
        errlog(
          `ci: nothing reached ${ci.branch}, and batch ${result.batchId}, submitted in this run, could NOT be canceled (${canceled.reason}): ` +
            `it is recorded only in this checkout's ${branchPaths(memRel).pending}; cancel it by hand, or the next run submits its units again.`
        );
      }
    } else {
      errlog(`ci: nothing reached ${ci.branch}; no batch was submitted in this run.`);
    }
    if (failure) throw failure;
    return { ...result, code: 1 };
  }
  const github = (request, workflow, ref) =>
    workflowRequest({ request, apiUrl: env.GITHUB_API_URL || DEFAULT_API_URL, repository: env.GITHUB_REPOSITORY, token, workflow, ref, fetchImpl });

  // The collector: on while the CI branch records a batch, off otherwise. The
  // call is made whatever state the collector is in, since nothing here reads it.
  let switchOnRefused = false;
  if (ci.collector) {
    const recorded = steps.readPending().batches.length > 0;
    const request = recorded ? 'enable' : 'disable';
    try {
      const { method, url, status } = await github(request, ci.collector);
      result.collector = recorded ? 'enabled' : 'disabled';
      log(`ci: ${recorded ? 'a batch is recorded' : 'no batch is recorded'}: switched the collector ${ci.collector} ${recorded ? 'on' : 'off'} (${method} ${url}, ${status}).`);
    } catch (err) {
      if (!(err instanceof WorkflowRequestError)) throw failure || err;
      if (recorded) {
        switchOnRefused = true;
        errlog(
          `ci: the collector ${ci.collector} could not be switched on (${err.message}); the batch stays recorded on ${ci.branch}, ` +
            'and the next push or a manual run collects it.'
        );
      } else {
        log(`ci: the collector ${ci.collector} could not be switched off (${err.message}); it finds nothing to collect while it runs.`);
      }
    }
  }
  if (failure) throw failure;

  if (result.applied > 0 && result.pushed && ci.dispatch) {
    try {
      const { url, status } = await github('dispatch', ci.dispatch.workflow, ci.dispatch.ref);
      result.dispatched = true;
      log(`ci: ${result.applied} translation(s) applied: dispatched ${ci.dispatch.workflow} on ${ci.dispatch.ref} (${url}, ${status}).`);
    } catch (err) {
      if (!(err instanceof WorkflowRequestError)) throw err;
      errlog(`ci: ${err.message}`);
      return { ...result, code: 1 };
    }
  }
  return switchOnRefused ? { ...result, code: 1 } : result;
}

/**
 * Runs the deploy-time overlay. See the module comment.
 *
 * @param {Object} args
 * @param {import('./config.mjs').Project} args.project
 * @param {NodeJS.ProcessEnv} args.env
 * @param {(...a:any[])=>void} [args.log]
 * @param {(...a:any[])=>void} [args.errlog]
 * @returns {{code:number, commit:string|null, source:string|null, files:string[]}}
 */
export function runOverlay({ project, env, log = console.log, errlog = console.error }) {
  const ci = project.config.ci;
  if (!ci) {
    errlog('overlay: the configuration has no "ci" key; name the CI branch in ci.branch.');
    return { code: 2, commit: null, source: null, files: [] };
  }
  const fallback = (reason) => {
    log(`overlay: the CI branch ${ci.branch} could not be read (${reason}); the build uses the committed memory.`);
    return { code: 0, commit: null, source: null, files: [] };
  };
  const git = createGit({ cwd: project.root, env });

  let root;
  try {
    root = git.toplevel();
  } catch (err) {
    if (err instanceof GitError) return fallback('not a git repository');
    throw err;
  }
  const memRel = memoryPathInRepo(root, project.memoryDir);
  if (!memRel) {
    errlog(`overlay: the memory directory ${project.memoryDir} is not inside the repository ${root}.`);
    return { code: 2, commit: null, source: null, files: [] };
  }

  let commit = null;
  let source = null;
  let reason = '';
  try {
    commit = git.fetchBranch(ci.branch);
    source = `fetched from ${REMOTE}`;
  } catch (err) {
    if (!(err instanceof GitError)) throw err;
    reason = err.message;
    commit = git.resolveCommit(`refs/remotes/${REMOTE}/${ci.branch}`);
    if (commit) source = `refs/remotes/${REMOTE}/${ci.branch}, as the checkout fetched it`;
  }
  if (!commit) return fallback(reason || 'no such branch');

  const { machineDir } = branchPaths(memRel);
  const files = copyFromCommit(git, root, commit, [machineDir]);
  log(`overlay: read ${ci.branch} at ${commit} (${source}): ${files.length} machine-layer file(s) copied into ${machineDir}/.`);
  return { code: 0, commit, source, files };
}

export default { runCi, runOverlay, workflowRequest, CI_COMMIT_MESSAGE, DEFAULT_API_URL, WorkflowRequestError };
