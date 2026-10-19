/**
 * local.mjs — The local mode's translation command, `l10n local`: the source
 * locale translated on the developer's machine through the Message Batches
 * API, waited on in the same command, and left in the working tree to commit.
 *
 * `runLocal` is the composition of the existing commands, the way `runCi` is:
 * its caller (`cli.mjs`) hands it `extract`, the gate, `submit`, `collect` and
 * the pending file's reader, each bound to the project exactly as the command
 * of the same name runs, so nothing here re-implements a request, a budget, a
 * validation or a resubmission. With the `anthropic` backend it never uses
 * the synchronous Messages API; with `claude-code` it translates synchronously
 * (see below).
 *
 * It READS, through those steps, the source content, both memory layers, the
 * prompt files, the glossary and the pending file, and the Message Batches API
 * through the client `submit` and `collect` create. It WRITES, through them,
 * the catalogue, the source map, the machine layer, the job log and the pending
 * file; then whatever `local.commands` write, run each through the shell at the
 * project root. It never stages, commits or pushes: it prints the `git add` of
 * `local.paths` for the developer to run.
 *
 * IN ORDER:
 *   1. `extract`, then the gate. With no unit missing and no batch recorded, it
 *      says so, creates no client and makes no request, and goes to step 4.
 *   2. While a batch is recorded — one it submitted, or one an interrupted run
 *      left in the pending file, which is therefore resumed rather than
 *      submitted again — it runs `collect` every `local.pollSeconds`; `collect`
 *      prints one progress line per poll while the batch has not ended, and
 *      applies it once it has.
 *   3. With no batch recorded it runs `submit`, which takes what the
 *      per-submission budgets admit and resubmits what the validation or the
 *      model refused, up to the attempt limit; then step 2. It repeats until
 *      `submit` finds nothing to request, or refuses — a refused submission
 *      (over budget, no API key) stops the command with its code.
 *   4. It runs `local.commands`, in order, and prints the `git add` of
 *      `local.paths`. A command that fails stops it with exit 1.
 * It exits 1 when units are still missing at the end — every one of them at
 * the attempt limit — after running the commands, so what was translated is
 * still regenerated.
 *
 * WITH A BACKEND THAT HAS NO BATCH TRANSPORT — the `claude-code` backend, on a
 * Claude subscription — the caller hands it `translate`, the engine's
 * synchronous stage, in place of `submit` and `collect`: steps 2 and 3 become
 * one synchronous translation, which resubmits what the validation or the model
 * refused up to the attempt limit, and nothing is polled. A batch the pending
 * file records stops it with exit 1 before any request, since that backend
 * cannot collect it.
 */

import { spawnSync } from 'node:child_process';

import { localSettings } from './config.mjs';
import { hasWork } from './gate.mjs';

/** The longest a derived command may run before the command stops it. */
export const LOCAL_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

/** The largest output read from one derived command. */
const MAX_COMMAND_OUTPUT = 64 * 1024 * 1024;

/** Waits `ms` milliseconds. */
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs one derived command through the shell at `cwd`, its output shown as it runs. */
function defaultRunCommand(command, { cwd, env }) {
  const res = spawnSync(command, { cwd, env, shell: true, stdio: 'inherit', maxBuffer: MAX_COMMAND_OUTPUT, timeout: LOCAL_COMMAND_TIMEOUT_MS });
  return { status: res.status, signal: res.signal, error: res.error };
}

/** The `git add` command for the configured paths, quoted for a POSIX shell where a path needs it. */
export function gitAddCommand(paths) {
  const quote = (p) => (/^[A-Za-z0-9._/@%+=:,-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`);
  return `git add -- ${paths.map(quote).join(' ')}`;
}

/**
 * Runs the local command. See the module comment.
 *
 * @param {Object} args
 * @param {import('./config.mjs').Project} args.project
 * @param {{extract: () => Promise<{unitCount:number}>, gate: () => Object, submit?: () => Promise<{code:number, action:string}>,
 *          collect?: () => Promise<{code:number, applied:number, waiting?:string[]}>, readPending: () => {batches:Array<Object>},
 *          translate?: () => Promise<{result:string, job:Object|null, jobFile:string|null}>, backend?: string}} args.steps
 *          `translate` (with the backend's name) in place of `submit` and `collect` for a backend with no batch transport.
 * @param {NodeJS.ProcessEnv} [args.env]   the environment the derived commands run with.
 * @param {(command:string, opts:{cwd:string, env:Object}) => {status:number|null, signal?:string|null, error?:Error}} [args.runCommand]
 * @param {(ms:number) => Promise<void>} [args.sleep]  the wait between polls.
 * @param {(...a:any[])=>void} [args.log]
 * @param {(...a:any[])=>void} [args.errlog]
 * @returns {Promise<{code:number, submitted:number, collected:number, polls:number, commands:string[]}>}
 */
export async function runLocal({
  project,
  steps,
  env = process.env,
  runCommand = defaultRunCommand,
  sleep = defaultSleep,
  log = console.log,
  errlog = console.error,
}) {
  const settings = localSettings(project.config.local);
  const result = { code: 0, submitted: 0, collected: 0, polls: 0, commands: [] };

  const extracted = await steps.extract();
  log(`local: extract: ${extracted.unitCount} source units.`);
  if (typeof steps.translate === 'function') {
    // A backend with no batch transport translates synchronously, one request at a time per page.
    if (steps.readPending().batches.length > 0) {
      errlog(
        `local: pending.json records a batch, which the ${steps.backend || 'configured'} backend cannot collect: collect it with ` +
          '`I18N_BACKEND=anthropic l10n collect` and the API key, or remove the file to drop it. Nothing was translated.'
      );
      return { ...result, code: 1 };
    }
    if (!hasWork(steps.gate())) {
      log('local: no translation needed: no request made.');
    } else {
      log(`local: translating through the ${steps.backend || 'configured'} backend, one request per page.`);
      const translated = await steps.translate();
      const job = translated && translated.job;
      log(`local: translate: result=${translated.result}, translated=${job ? job.items.length : 0}, failed=${job ? job.failures.length : 0}${translated.jobFile ? `, job=${translated.jobFile}` : ''}`);
      result.translated = job ? job.items.length : 0;
    }
  } else if (!hasWork(steps.gate()) && steps.readPending().batches.length === 0) {
    log('local: no translation needed: no batch submitted, no client created.');
  } else {
    for (;;) {
      if (steps.readPending().batches.length > 0) {
        for (;;) {
          const collected = await steps.collect();
          if (collected.code !== 0) return { ...result, code: collected.code };
          result.polls += 1;
          if (!collected.waiting || collected.waiting.length === 0) {
            result.collected += 1;
            break;
          }
          await sleep(settings.pollSeconds * 1000);
        }
        continue;
      }
      const submitted = await steps.submit();
      if (submitted.code !== 0) {
        errlog(`local: the submission was refused (${submitted.action}): nothing more is translated, and no derived command ran.`);
        return { ...result, code: submitted.code };
      }
      if (submitted.action !== 'submitted') break;
      result.submitted += 1;
      log(`local: waiting on the batch, polling every ${settings.pollSeconds} s.`);
    }
  }

  const worklist = steps.gate();
  for (const command of settings.commands) {
    log(`local: running ${command}`);
    const res = runCommand(command, { cwd: project.root, env });
    if (res.status !== 0) {
      const why = res.error ? res.error.code || res.error.message : res.signal ? `signal ${res.signal}` : `exit ${res.status}`;
      errlog(`local: the derived command "${command}" failed (${why}).`);
      return { ...result, code: 1 };
    }
    result.commands.push(command);
  }
  if (settings.paths.length) {
    log(`local: commit the translation; nothing was staged. From ${project.root}:`);
    log(`  ${gitAddCommand(settings.paths)}`);
    log('  git commit');
  } else {
    log('local: local.paths names nothing to commit; nothing was staged.');
  }
  if (hasWork(worklist)) {
    const slots = worklist.items.reduce((n, item) => n + item.missing.length, 0);
    errlog(`local: ${worklist.items.length} unit(s), ${slots} locale slot(s), are still untranslated after the attempt limit; \`l10n status\` names them.`);
    return { ...result, code: 1 };
  }
  return result;
}

export default { runLocal, gitAddCommand, LOCAL_COMMAND_TIMEOUT_MS };
