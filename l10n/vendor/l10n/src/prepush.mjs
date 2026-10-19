/**
 * prepush.mjs — The local mode's push check, `l10n prepush`: a push is refused
 * unless every commit it pushes is fully translated.
 *
 *   l10n prepush <remote> <url>   as a pre-push hook: the pushed refs are read
 *                                 from standard input, one line per ref,
 *                                 `<local ref> <local sha> <remote ref> <remote sha>`
 *   l10n prepush <commit>         one commit, named on the command line (the
 *                                 check workflow passes the pushed commit)
 *   l10n prepush                  the pushed refs read from standard input
 *
 * IT JUDGES EACH PUSHED COMMIT — the local commit of every line that does not
 * delete its ref, each commit once — IN A TEMPORARY WORKTREE of that commit,
 * outside the checkout and removed when the judgement ends, never in the
 * working tree: an uncommitted edit, translated or not, changes nothing. In
 * the worktree it loads the configuration at the path the checkout's has,
 * extracts the catalogue, runs the gate against both memory layers as the
 * commit holds them, and runs the drift guard over the committed targets. A
 * commit is refused when:
 *   - a unit of its catalogue has no translation in either layer, for some
 *     target locale; or
 *   - its committed targets differ from their regeneration from that commit's
 *     source and memory: the drift guard's report, with every stale leaf, every
 *     target file not generated and every file generated from no source
 *     counted as a refusal beside the hand-edited leaves. `l10n verify-drift`
 *     itself is unchanged: it still fails on a hand edit alone.
 * And the whole push is refused while the checkout's pending file records a
 * batch: a translation is in flight, and the local command finishes it.
 *
 * A REFUSAL names, per commit and per locale, how many units are missing and on
 * which pages, with the offline estimate of translating them through the
 * Message Batches API (`cost.mjs`, over the requests `submit` would build for
 * them, `planBatch`); then the drift report; then the next three steps: the
 * local command (the project's npm script that runs `l10n local`, else
 * `npx l10n local`), the `git add` of `local.paths`, and `git commit`.
 *
 * It exits 0 when every pushed commit passes and no batch is recorded, and on a
 * push that only deletes refs; 1 on a refusal; 2 when it cannot judge (not a
 * git repository, a commit git does not know). It READS the checkout's
 * configuration and pending file, the repository's objects, and in each
 * worktree the files the commands it composes read; it WRITES only the
 * temporary worktrees, git's administrative entries for them, and the
 * catalogue and source map inside each worktree. It runs no derived command,
 * creates no client, makes no network call and spends nothing.
 */

import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGit, GitError } from './git.mjs';
import { lockReason, removeAbandonedWorktrees, syncEnvironment } from './sync.mjs';
import { ConfigError, loadConfig, localSettings, translationSettings } from './config.mjs';
import { createAdapter } from './adapters/index.mjs';
import { createEngine } from './engine.mjs';
import { createStore } from './store.mjs';
import { planBatch } from './batch.mjs';
import { loadGeneralPrompt, loadGlossary, loadLanguagePrompts, pagesFromCatalog } from './requests.mjs';
import { BATCH_RATES_READ, batchCostUpperBound, formatUsd } from './cost.mjs';
import { gitAddCommand } from './local.mjs';

/** The name every temporary worktree of the push check begins with. */
const WORKTREE_PREFIX = 'l10n-prepush-';

/** An object id git writes for "no object": the local side of a line that deletes its ref. */
const ZERO_SHA = /^0+$/;

/** The drift entries named in a refusal, per kind, before the rest is counted. */
const DRIFT_SHOWN = 10;

/** A step of an npm script that runs the local command. */
const LOCAL_SCRIPT = /(?:^|[\s;&|])l10n local(?:\s|$)/;

const toPosix = (p) => p.split(path.sep).join('/');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The refs a pre-push hook's standard input names: one per line,
 * `<local ref> <local sha> <remote ref> <remote sha>`; a line that does not
 * hold four fields is ignored. `deletes` is true when the local side is git's
 * object id of nothing.
 *
 * @param {string} text
 * @returns {Array<{localRef:string, localSha:string, remoteRef:string, remoteSha:string, deletes:boolean}>}
 */
export function parsePushLines(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4) continue;
    const [localRef, localSha, remoteRef, remoteSha] = fields;
    out.push({ localRef, localSha, remoteRef, remoteSha, deletes: ZERO_SHA.test(localSha) });
  }
  return out;
}

/**
 * How the developer runs the local command here: `npm run <name>` for the
 * first script of the project's `package.json` — at the project root, else at
 * the repository root — whose command runs `l10n local`; else `npx l10n local`.
 *
 * @param {string[]} dirs   the directories whose `package.json` is read, in order.
 * @param {typeof nodeFs} [fsImpl]
 * @returns {string}
 */
export function localCommandOf(dirs, fsImpl = nodeFs) {
  for (const dir of dirs) {
    let manifest;
    try {
      manifest = JSON.parse(fsImpl.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const scripts = manifest && typeof manifest.scripts === 'object' && manifest.scripts ? manifest.scripts : {};
    const name = Object.keys(scripts).find((key) => typeof scripts[key] === 'string' && LOCAL_SCRIPT.test(scripts[key]));
    if (name) return `npm run ${name}`;
  }
  return 'npx l10n local';
}

/** The drift guard's report as lines: each kind counted, the first entries of each named. */
function driftLines(report) {
  const kinds = [
    ['hand-edited', 'hand-edited leaf', 'hand-edited leaves', report.handEdited.map((e) => `${e.file} ${e.leaf}`)],
    ['stale', 'stale leaf', 'stale leaves', report.stale.map((e) => `${e.file} ${e.leaf}`)],
    ['not on disk', 'target file not generated', 'target files not generated', report.missing],
    ['generated from no source', 'file generated from no source', 'files generated from no source', report.extra],
  ];
  const counts = kinds.filter(([, , , list]) => list.length).map(([, one, many, list]) => plural(list.length, one, many));
  const lines = [`  the committed targets differ from their regeneration: ${counts.join(', ')}`];
  for (const [label, , , list] of kinds) {
    for (const entry of list.slice(0, DRIFT_SHOWN)) lines.push(`    ${label}: ${entry}`);
    if (list.length > DRIFT_SHOWN) lines.push(`    … and ${list.length - DRIFT_SHOWN} more ${label}`);
  }
  return lines;
}

/** The drift guard's report of a worktree's targets, its files named relative to the project root; null when the adapter has no drift guard. */
function driftReport(adapter, store, targets) {
  if (!adapter || typeof adapter.verifyDrift !== 'function') return null;
  const { contentResult, uiResult } = adapter.verifyDrift({
    tmByLang: store.readAllTM(targets),
    memoryTextsByLang: Object.fromEntries(targets.map((lang) => [lang, store.memoryTexts(lang)])),
    recordedSourceTexts: store.recordedSourceTexts(),
    targets,
    scope: 'real',
  });
  const report = { handEdited: [], stale: [], missing: [], extra: [] };
  for (const [where, result] of [['content', contentResult], ['UI dictionary', uiResult]]) {
    for (const kind of Object.keys(report)) {
      for (const entry of result[kind] || []) {
        report[kind].push(typeof entry === 'string' ? `${where} ${entry}` : { file: `${where} ${entry.file}`, leaf: entry.leaf });
      }
    }
  }
  return report;
}

const driftCount = (report) => (report ? report.handEdited.length + report.stale.length + report.missing.length + report.extra.length : 0);

/**
 * Judges one commit in a temporary worktree. See the module comment.
 *
 * @param {Object} args
 * @param {ReturnType<typeof createGit>} args.git  git at the repository root.
 * @param {string} args.commit     the commit's full id.
 * @param {string} args.configRel  the configuration's path, relative to the repository root.
 * @returns {Promise<{ok:boolean, lines:string[]}>}  the lines name what is missing when `ok` is false.
 */
export async function judgeCommit({ git, commit, configRel }) {
  const dir = nodeFs.mkdtempSync(path.join(nodeFs.realpathSync(os.tmpdir()), WORKTREE_PREFIX));
  let added = false;
  try {
    git.addWorktree(dir, commit, lockReason(process.pid, 'prepush'));
    added = true;
    const configPath = path.join(dir, ...configRel.split('/'));
    if (!nodeFs.existsSync(configPath)) return { ok: false, lines: [`  the commit holds no ${configRel}, so nothing in it can be judged`] };
    let project;
    try {
      project = loadConfig({ configPath });
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      return { ok: false, lines: [`  ${configRel} at this commit does not validate: ${err.message.split('\n').map((l) => l.trim()).join('; ')}`] };
    }
    const targets = project.locales.targets;
    const adapter = createAdapter({ project });
    const engine = createEngine({ adapter, paths: { baseDir: project.memoryDir } });
    const { catalog } = await engine.extract();
    const tmByLang = engine.store.readAllTM(targets);
    const worklist = engine.gate({ targets });
    const lines = [];

    if (worklist.status === 'work') {
      let pages;
      let built = null;
      let model = null;
      let noEstimate = null;
      let subscription = false;
      try {
        const prompts = loadLanguagePrompts({ promptsDir: project.promptsDir, targets });
        const generalPrompt = loadGeneralPrompt({ promptsDir: project.promptsDir });
        const glossary = loadGlossary(project.glossaryPath);
        const settings = translationSettings(project.config.backend, glossary);
        subscription = project.config.backend.kind === 'claude-code';
        ({ pages, built } = await planBatch({ adapter, catalog, worklist, tmByLang, targets, settings, glossary, prompts, generalPrompt }));
        model = settings.model.id;
      } catch (err) {
        if (!(err instanceof ConfigError)) throw err;
        noEstimate = err.message;
        pages = typeof adapter.pages === 'function' ? await adapter.pages() : pagesFromCatalog(catalog);
      }
      for (const lang of targets) {
        const missing = new Set(worklist.items.filter((item) => item.missing.includes(lang)).map((item) => item.srcHash));
        if (missing.size === 0) continue;
        const onPages = pages.filter((page) => page.segments.some((s) => missing.has(s.key))).map((page) => page.id);
        let estimate;
        if (built) {
          const mine = built.filter((r) => r.spec.lang === lang);
          const input = mine.reduce((n, r) => n + r.estimate.input, 0);
          const output = mine.reduce((n, r) => n + r.estimate.output, 0);
          const usd = batchCostUpperBound({ model, input, output });
          estimate = subscription
            ? `estimated ${input} input and ${output} output tokens, translated through Claude Code on the Claude subscription (no API rate applies)`
            : usd === null
              ? `no Message Batches rate is known for ${model}: estimated ${input} input and ${output} output tokens`
              : `at most ${formatUsd(usd)} at the Message Batches rates of ${model} read on ${BATCH_RATES_READ} (estimated ${input} input and ${output} output tokens)`;
        } else {
          estimate = `no estimate: ${noEstimate}`;
        }
        lines.push(`  ${lang}: ${plural(missing.size, 'unit')} missing on ${plural(onPages.length, 'page')} (${onPages.join(', ')}); ${estimate}`);
      }
    }

    const report = driftReport(adapter, engine.store, targets);
    if (driftCount(report) > 0) lines.push(...driftLines(report));
    if (!report) lines.push('  (the adapter has no drift guard: the committed targets are not compared)');
    return { ok: worklist.status !== 'work' && driftCount(report) === 0, lines };
  } finally {
    if (added) git.removeWorktree(dir);
    else nodeFs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Runs the push check. See the module comment.
 *
 * @param {Object} args
 * @param {import('./config.mjs').Project} args.project  the checkout's project.
 * @param {string|null} [args.commit]  a commit named on the command line; without it, `stdin` is read.
 * @param {string} [args.stdin]        the pre-push hook's standard input.
 * @param {NodeJS.ProcessEnv} [args.env]
 * @param {(...a:any[])=>void} [args.log]
 * @param {(...a:any[])=>void} [args.errlog]
 * @returns {Promise<{code:number, judged:string[], refused:string[], recorded:string[]}>}
 */
export async function runPrepush({ project, commit = null, stdin = '', env = process.env, log = console.log, errlog = console.error }) {
  const result = { code: 0, judged: [], refused: [], recorded: [] };
  const gitEnv = syncEnvironment(env);
  let git;
  let root;
  try {
    root = nodeFs.realpathSync(createGit({ cwd: project.root, env: gitEnv }).toplevel());
    git = createGit({ cwd: root, env: gitEnv });
  } catch (err) {
    if (!(err instanceof GitError)) throw err;
    errlog(`prepush: ${project.root} is not inside a git repository (${err.message}).`);
    return { ...result, code: 2 };
  }
  const configRel = toPosix(path.relative(root, nodeFs.realpathSync(project.configPath)));

  const pushed = [];
  if (commit) {
    const sha = git.resolveCommit(commit);
    if (!sha) {
      errlog(`prepush: ${commit} names no commit here.`);
      return { ...result, code: 2 };
    }
    pushed.push({ sha, ref: commit });
  } else {
    for (const line of parsePushLines(stdin)) {
      if (line.deletes) {
        log(`prepush: ${line.remoteRef} is deleted: nothing to judge.`);
        continue;
      }
      if (!pushed.some((p) => p.sha === line.localSha)) pushed.push({ sha: line.localSha, ref: line.localRef });
    }
    if (pushed.length === 0) {
      log('prepush: no commit is pushed: nothing to judge.');
      return result;
    }
  }

  const settings = localSettings(project.config.local);
  const localCommand = localCommandOf([project.root, root]);
  let refused = false;
  try {
    removeAbandonedWorktrees(git);
    for (const { sha, ref } of pushed) {
      const verdict = await judgeCommit({ git, commit: sha, configRel });
      result.judged.push(sha);
      if (verdict.ok) {
        log(`prepush: ${sha.slice(0, 12)} (${ref}) is fully translated.`);
        for (const line of verdict.lines) log(line);
        continue;
      }
      refused = true;
      result.refused.push(sha);
      errlog(`prepush: ${sha.slice(0, 12)} (${ref}) is not fully translated:`);
      for (const line of verdict.lines) errlog(line);
    }
  } catch (err) {
    if (!(err instanceof GitError)) throw err;
    errlog(`prepush: ${err.message}`);
    return { ...result, code: 2 };
  }

  const pendingFile = createStore({ baseDir: project.memoryDir });
  const recorded = pendingFile.readPending().batches.map((b) => b.id);
  if (recorded.length) {
    refused = true;
    result.recorded = recorded;
    errlog(
      `prepush: batch ${recorded.join(', ')} is recorded in ${toPosix(path.relative(project.root, pendingFile.paths.pending))} and not yet collected: ` +
        `finish it with \`${localCommand}\` before pushing.`
    );
  }

  if (!refused) {
    log(`prepush: ${pushed.length === 1 ? 'the pushed commit is' : `all ${pushed.length} pushed commits are`} fully translated.`);
    return result;
  }
  errlog('prepush: the push is refused. Next:');
  errlog(`  1. ${localCommand}`);
  errlog(`  2. ${settings.paths.length ? gitAddCommand(settings.paths) : 'git add -- <the paths local.paths should name>'}`);
  errlog('  3. git commit');
  return { ...result, code: 1 };
}

export default { runPrepush, judgeCommit, parsePushLines, localCommandOf };
