/**
 * cli.mjs — The `l10n` command line: one entry point for every stage of the
 * translation pipeline.
 *
 *   l10n <command> [--config <path>] [--targets a,b] [flag...]
 *
 * EVERY COMMAND LOADS THE CONFIGURATION FIRST (`config.mjs`): the file is found
 * (`--config`, else `L10N_CONFIG`, else the nearest `l10n.config.json` above the
 * working directory), validated by its schema, and its locale declaration read.
 * A defect stops the command with exit 2 and the offending key named, before any
 * content, memory or glossary is read and before a backend exists. `doctor`
 * finds and loads the file the same way, and reports a defect as its first
 * failed check rather than stopping (`doctor.mjs`). THE MODE is read next
 * (`modeOf`): under a local-mode configuration `ci`, `overlay`, `sync` and
 * `watch` stop with exit 2, naming the mode, and under a CI-mode one `local` and
 * `prepush` do, before any git command, any other file and any network call. A
 * command that translates — `translate`, `pipeline`, `submit`, `ci`, `local` —
 * then reads the
 * per-language prompt file of every target locale, and a missing or empty one
 * stops it with exit 2, naming the file; then the optional project general
 * prompt file, which stops it the same way when it is present and empty. Both
 * transports receive the prompts read here. A command that translates or
 * collects reads the glossary next, and a `do_not_translate_case` that is not a
 * matching mode stops it the same way, naming the file and the key, before any
 * content is read. The adapter and the backend are
 * built from the configuration — never resolved by path — and the memory
 * directory, the locale set and every content path come from it too.
 *
 * READS the configuration, the prompt files (for the commands that
 * translate), then — through the engine, the adapter, the backend and the batch
 * transport — the memory directory, the source-locale content, the glossary
 * (for the commands that translate or collect) and, for `verify-drift` and
 * `seed`, the target files; `ci`, `overlay`, `sync` and `watch` read the CI
 * branch through git (`ci.mjs`, `sync.mjs`), and `sync` and `watch` read the
 * token from the environment or the file `--env-file` names; `doctor` reads the
 * configuration, the prompt files, the glossary and the workflow files, and in
 * the local mode the pre-push hook and `package.json`, and nothing else;
 * `prepush` reads the pushed commits through git, each in a temporary worktree
 * (`prepush.mjs`), and the checkout's pending file, and standard input as a
 * pre-push hook receives it. WRITES only what
 * those write: the catalogue, the memory layers, the job log, the pending file
 * (`submit`, `collect`, `ci`, `local`), the staging targets, and — for `materialize`
 * alone — the real targets; `ci` also commits to and pushes the CI branch alone
 * switches the configured collector workflow on or off and dispatches the
 * configured workflow, `overlay` writes the machine layer
 * only, and `sync` — run by `watch` when the CI branch moves — commits the
 * machine layer and the derived paths on top of the checked-out branch and
 * refreshes those paths in the checkout; `local` also writes what
 * `local.commands` write, and `prepush` its temporary worktrees alone. `status`,
 * `submit --dry-run` and `doctor` write nothing.
 *
 * `ci` runs `extract`, `collect` and `submit` exactly as those commands run, the
 * three bound once below and handed to `ci.mjs`, so the CI command is the
 * composition of the commands rather than a copy of them. It is handed the batch
 * transport's `cancelBatch` the same way, bound to the same client factory, for
 * a batch it submitted when nothing then reached the CI branch. `local` is the
 * same composition for the developer's machine (`local.mjs`): `extract`, the
 * gate, `submit`, `collect` and the pending file's reader.
 *
 * `runCli` never exits the process: it returns the exit code, which is what makes
 * every command testable in-process with an injected adapter, backend, SDK
 * client class or filesystem. `bin/l10n.mjs` maps the code onto the process exit
 * status.
 *
 * Runs at build and CI time only, under Node. It is never imported into the
 * runtime that is served.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { createEngine } from './engine.mjs';
import { humanLine, hasWork } from './gate.mjs';
import { ConfigError, findConfigPath, loadConfig, modeOf, syncSettings, translationSettings } from './config.mjs';
import { createAdapter } from './adapters/index.mjs';
import { BATCH_BACKENDS, BackendSelectionError, configFor, createConfiguredBackend, credentialOf, selectBackendKind } from './backends/index.mjs';
import { claudeCodeSettings } from './backends/claude-code.mjs';
import { runPipeline } from './pipeline.mjs';
import { loadGeneralPrompt, loadGlossary, loadLanguagePrompts } from './requests.mjs';
import { createAnthropicClient } from './client.mjs';
import { cancelBatch, collect, status, submit } from './batch.mjs';
import { runCi, runOverlay } from './ci.mjs';
import { readToken, runSync, runWatch } from './sync.mjs';
import { runDoctor } from './doctor.mjs';
import { runLocal } from './local.mjs';
import { runPrepush } from './prepush.mjs';

/** The commands, in pipeline order. */
export const COMMANDS = Object.freeze([
  'extract',
  'gate',
  'translate',
  'generate',
  'materialize',
  'pipeline',
  'submit',
  'collect',
  'status',
  'ci',
  'overlay',
  'sync',
  'watch',
  'local',
  'prepush',
  'verify-drift',
  'seed',
  'gc',
  'doctor',
]);

/** The commands that may call a translation model, so `I18N_BACKEND` is checked for them. */
const CALLS_A_MODEL = new Set(['translate', 'pipeline', 'submit', 'collect', 'ci', 'local']);

/** The commands that build translation requests, and so read the prompt files: every target locale's, and the optional general one. */
const NEEDS_PROMPTS = new Set(['translate', 'pipeline', 'submit', 'ci', 'local']);

/** The commands of the CI mode, which a local-mode configuration refuses: each reads or writes the CI branch. */
const CI_MODE_ONLY = new Set(['ci', 'overlay', 'sync', 'watch']);

/** The commands of the local mode, which a CI-mode configuration refuses. */
const LOCAL_MODE_ONLY = new Set(['local', 'prepush']);

/** The commands that run the synchronous backend; `local` too under a backend with no batch transport. */
const NEEDS_BACKEND = new Set(['translate', 'pipeline']);

/** The commands that use the Message Batches API, which only a backend in `BATCH_BACKENDS` has. */
const NEEDS_BATCHES = new Set(['submit', 'collect', 'ci']);

/** The help text `l10n --help` prints. */
export const USAGE = `Usage: l10n <command> [options]

Commands:
  extract        build the source catalogue from the source locale
  gate           compare the catalogue with the memory; --check exits 1 while work remains
  translate      translate the missing units into the machine layer, one synchronous request per page
  generate       regenerate the target locales into the staging area
  materialize    write the target locales to their real destinations [--content] [--ui]
  pipeline       extract, gate, and translate then generate when work remains
  submit         submit the missing units as one Message Batch within the token budgets [--dry-run]
  collect        apply every ended batch to the machine layer and queue its failures
  status         print the recorded batches and the resubmission queue (no network call)
  ci             fetch the CI branch, extract, collect and submit, then commit and push the
                 CI branch alone; dispatch the configured workflow when translations were applied
  overlay        copy the CI branch's machine layer over the checkout's and print the commit read
  sync           commit the CI branch's machine layer and the derived paths, regenerated from HEAD,
                 on top of HEAD, touching nothing else in the index or the working tree [--env-file <file>]
  watch          poll the CI branch and run sync when it moves; idle without the read-only token [--env-file <file>]
  local          (local mode) extract, submit, wait on the batch and collect it, until nothing is missing,
                 through the Message Batches API; then run local.commands and print the git add of local.paths
  prepush        (local mode) refuse a push unless every pushed commit is fully translated, each judged in a
                 temporary worktree [<commit> | <remote> <url> with git's pre-push lines on standard input]
  verify-drift   regenerate in memory and classify the targets on disk; exits 1 on a hand edit [--scope real|staging]
  seed           import hand-written target text into the human layer of the memory
  gc             report orphaned memory keys [--grace <days>]; --apply archives them
  doctor         check the project's wiring, one line per check; exits 1 when one does not pass
                 (reads files only: no git command, no network call)

Options:
  --config <path>   the configuration file (default: L10N_CONFIG, else the
                    nearest l10n.config.json above the working directory)
  --targets <a,b>   target locales (default: the configured locale set's targets)
  --conc <n>        (translate, pipeline) requests sent at once
  --dry-run         (submit) build the requests and print their estimate; create no batch, write no file
  --env-file <file> (sync, watch) a dotenv file the token variable (sync.tokenEnv) is read from
                    when the environment does not set it

The CI mode's ci, overlay, sync and watch exit 2 under a configuration whose mode is "local",
and local and prepush exit 2 under one whose mode is "ci".
  --help            print this text`;

/** Minimal argv parsing → { _: [positional], flag: value }. */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function csv(value, fallback) {
  if (!value || value === true) return fallback;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Runs one command and returns its exit code: 0 on success, 1 when the command
 * ran and reports failure (work remaining under `--check`, a hand-edited target,
 * a failed translation, a missing key, a refused or over-budget submission, a
 * batch the pending file could not record, a failed git operation or
 * dispatch, a sync refused on the machine layer or stopped by a failed derived
 * command, a `doctor` check that did not pass, a `local` run stopped by a failed derived
 * command or leaving units untranslated, a push `prepush` refuses), 2 when it could not run (a configuration
 * defect, a missing or empty prompt file, a glossary whose `do_not_translate_case` is
 * not a matching mode, an unsupported backend, an unknown command,
 * `ci`, `overlay`, `sync` or `watch` with no `ci` key or under the local mode,
 * `local` or `prepush` under the CI mode, `prepush` with more than two
 * arguments or naming no commit, `ci` or `sync` run on the
 * CI branch, `sync` with HEAD detached, `--env-file` with no path). `watch`
 * returns only when its `cycles` seam is exhausted; run from the command line,
 * it stops on SIGTERM or SIGINT after the poll in progress.
 *
 * @param {string[]} argv  the arguments after the program name.
 * @param {Object} [deps]  injectable dependencies (test seams):
 * @param {string} [deps.cwd]            where the configuration search starts.
 * @param {NodeJS.ProcessEnv} [deps.env] the environment (API key, I18N_BACKEND, L10N_CONFIG).
 * @param {typeof nodeFs} [deps.fsImpl]  the filesystem every read and write goes through.
 * @param {Object} [deps.adapter]        replaces the configured adapter.
 * @param {Object} [deps.backend]        replaces the configured synchronous backend.
 * @param {Function} [deps.ClientClass]  the SDK client class the one client factory constructs.
 * @param {Function} [deps.runProcess]   how the claude-code backend runs one CLI process (default: a child process).
 * @param {typeof fetch} [deps.fetchImpl]  what `ci` sends its requests to GitHub's REST API with — the collector's switch and the workflow dispatch (default: the global `fetch`).
 * @param {(ms:number, signal?:AbortSignal)=>Promise<void>} [deps.sleep]  `watch`'s wait between polls.
 * @param {number} [deps.cycles]         how many polls `watch` makes before it returns (default: no limit).
 * @param {Function} [deps.runCommand]   how `local` runs a derived command (default: through the shell, its output shown).
 * @param {string} [deps.stdin]          what `prepush` reads as git's pre-push lines (default: the process's standard input).
 * @param {Object} [deps.engineOptions]  passed through to the engine.
 * @param {(...a:any[])=>void} [deps.log]
 * @param {(...a:any[])=>void} [deps.errlog]
 * @returns {Promise<number>}
 */
export async function runCli(argv, deps = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    fsImpl = nodeFs,
    adapter: injectedAdapter,
    backend: injectedBackend,
    ClientClass,
    runProcess,
    fetchImpl,
    sleep,
    cycles,
    runCommand,
    stdin,
    engineOptions = {},
    log = (...a) => console.log(...a),
    errlog = (...a) => console.error(...a),
  } = deps;

  const args = parseArgs(argv);
  const cmd = args._[0];

  if (!cmd || cmd === 'help' || args.help === true) {
    log(USAGE);
    return cmd || args.help === true ? 0 : 2;
  }
  if (!COMMANDS.includes(cmd)) {
    errlog(`Unknown command: ${cmd}. Run \`l10n --help\` for the list.`);
    return 2;
  }
  if (args.config === true) {
    errlog('--config needs a path.');
    return 2;
  }
  if (args['env-file'] === true) {
    errlog('--env-file needs a path.');
    return 2;
  }

  // `doctor` reports a configuration it cannot load as a failed check, so it loads the configuration itself.
  if (cmd === 'doctor') {
    return runDoctor({ cwd, env, explicit: args.config, fsImpl, log }).code;
  }

  // 1. The configuration, before anything else is read.
  let project;
  try {
    const configPath = findConfigPath({ cwd, env, explicit: args.config, fsImpl });
    project = loadConfig({ configPath, fsImpl });
  } catch (err) {
    if (err instanceof ConfigError) {
      errlog(err.message);
      return 2;
    }
    throw err;
  }
  const mode = modeOf(project.config);
  if (mode === 'local' && CI_MODE_ONLY.has(cmd)) {
    errlog(`${cmd}: the configuration's mode is "local": this project translates with \`l10n local\` and keeps no CI branch, so \`l10n ${cmd}\` does not run. Nothing was read or written.`);
    return 2;
  }
  if (mode !== 'local' && LOCAL_MODE_ONLY.has(cmd)) {
    errlog(`${cmd}: the configuration's mode is "${mode}": \`l10n ${cmd}\` belongs to the local mode (\`"mode": "local"\`). Nothing was read or written.`);
    return 2;
  }
  const targets = csv(args.targets, project.locales.targets);

  // 2. For a command that may call a model: the backend selection, the prompt
  //    files and the synchronous backend, before any content is read, so a
  //    refused selection or a missing prompt costs nothing.
  let prompts = {};
  let generalPrompt = null;
  let backend = null;
  let backendKind = project.config.backend.kind;
  try {
    if (CALLS_A_MODEL.has(cmd)) backendKind = selectBackendKind({ configured: project.config.backend.kind, env });
    if (NEEDS_BATCHES.has(cmd) && !BATCH_BACKENDS.includes(backendKind)) {
      errlog(
        `${cmd}: the ${backendKind} backend has no batch transport; \`l10n ${cmd}\` runs on the Message Batches API ` +
          `(${BATCH_BACKENDS.join(', ')}). Translate with \`l10n translate\`, or \`l10n local\` in the local mode. Nothing was read or written.`
      );
      return 2;
    }
    if (NEEDS_PROMPTS.has(cmd)) {
      prompts = loadLanguagePrompts({ promptsDir: project.promptsDir, targets, fsImpl });
      generalPrompt = loadGeneralPrompt({ promptsDir: project.promptsDir, fsImpl });
    }
    if (NEEDS_BACKEND.has(cmd) || (cmd === 'local' && !BATCH_BACKENDS.includes(backendKind))) {
      backend =
        injectedBackend !== undefined
          ? injectedBackend
          : createConfiguredBackend({
              backendConfig: project.config.backend,
              prompts,
              generalPrompt,
              env,
              options: { ...(ClientClass ? { ClientClass } : {}), ...(runProcess ? { run: runProcess } : {}) },
            });
    }
  } catch (err) {
    if (err instanceof BackendSelectionError || err instanceof ConfigError) {
      errlog(err.message);
      return 2;
    }
    throw err;
  }

  // 3. The adapter and the engine. Building them reads nothing yet.
  const adapter = injectedAdapter !== undefined ? injectedAdapter : createAdapter({ project, options: { fsImpl } });
  const needsGlossary = NEEDS_PROMPTS.has(cmd) || cmd === 'collect';
  let glossary = {};
  try {
    if (needsGlossary) glossary = loadGlossary(project.glossaryPath, fsImpl);
  } catch (err) {
    if (err instanceof ConfigError) {
      errlog(err.message);
      return 2;
    }
    throw err;
  }
  const backendConfig = configFor(backendKind, project.config.backend);
  const settings = translationSettings(backendConfig, glossary);
  const engineOpts = {
    fsImpl,
    attemptLimit: settings.attempts,
    sectionTokens: settings.sectionTokens,
    ...(settings.model.fallbackId ? { fallbackId: settings.model.fallbackId } : {}),
    // One CLI process at a time on a subscription by default; the API's concurrency otherwise.
    ...(backendKind === 'claude-code' ? { concurrency: claudeCodeSettings(backendConfig).concurrency } : {}),
    ...(args.conc ? { concurrency: Number(args.conc) } : {}),
    ...engineOptions,
  };
  const engine = createEngine({ adapter, backend, paths: { baseDir: project.memoryDir }, options: engineOpts });
  const createClient = () =>
    createAnthropicClient({ apiKeyEnv: settings.apiKeyEnv, env, ...(ClientClass ? { ClientClass } : {}) });

  // The batch transport, bound once: `submit`, `collect` and `ci` all run the first two, and `ci` the cancellation.
  const runSubmit = ({ dryRun = false } = {}) =>
    submit({ store: engine.store, adapter, targets, settings, glossary, prompts, generalPrompt, dryRun, createClient, log, errlog });
  const runCollect = () => collect({ store: engine.store, settings, glossary, createClient, log, errlog });
  const runCancel = (batchId) => cancelBatch({ batchId, createClient });

  switch (cmd) {
    case 'extract': {
      if (!adapter || typeof adapter.extract !== 'function') {
        errlog('extract: the configured adapter cannot extract.');
        return 2;
      }
      const { unitCount, stats } = await engine.extract();
      log(`extract: catalog written, ${unitCount} source units.`);
      if (stats) log(`extract: ${stats.files} files, ${stats.segments} segments, ${stats.words} words.`);
      return 0;
    }

    case 'gate': {
      const worklist = engine.gate({ targets });
      log(humanLine(worklist));
      if (worklist.status === 'work') {
        log(`  targets: ${worklist.targets.join(', ')}`);
        log(`  orphans: ${worklist.orphans.length}`);
      }
      // --check: no translation, exit non-zero when work remains.
      return args.check && hasWork(worklist) ? 1 : 0;
    }

    case 'translate': {
      if (!backend || typeof backend.translate !== 'function') {
        errlog('translate: no backend configured.');
        return 2;
      }
      const { result, jobFile, job } = await engine.translate({ targets, glossary });
      const translated = job ? job.items.length : 0;
      const failed = job ? job.failures.length : 0;
      log(`translate: result=${result}, translated=${translated}, failed=${failed}` + (jobFile ? `, job=${jobFile}` : ''));
      // A hard failure exits non-zero, so the CI build fails.
      return result === 'ok' ? 0 : 1;
    }

    case 'generate': {
      if (!adapter || typeof adapter.generate !== 'function') {
        errlog('generate: the configured adapter cannot generate.');
        return 2;
      }
      await engine.generate({ targets });
      log(`generate: target artifacts rewritten (${targets.join(', ')}).`);
      return 0;
    }

    case 'materialize': {
      if (!adapter || typeof adapter.materialize !== 'function') {
        errlog('materialize: the configured adapter cannot materialize.');
        return 2;
      }
      // With neither flag, both surfaces are written: that is the whole job, and a
      // command that silently did nothing would be worse than one that did too much.
      const content = args.content === true || args.ui !== true;
      const ui = args.ui === true || args.content !== true;
      adapter.materialize({
        tmByLang: engine.store.readAllTM(targets),
        memoryTextsByLang: Object.fromEntries(targets.map((lang) => [lang, engine.store.memoryTexts(lang)])),
        recordedSourceTexts: engine.store.recordedSourceTexts(),
        targets,
        content,
        ui,
        log,
      });
      log('\nRegenerate whatever is built from these files next: for a site, its route list.');
      return 0;
    }

    case 'pipeline': {
      const credential = credentialOf({ kind: backendKind, backendConfig: project.config.backend, env });
      const res = await runPipeline({
        baseDir: project.memoryDir,
        targets,
        adapter,
        backend,
        hasKey: credential.present,
        apiKeyEnv: credential.name,
        glossary,
        engineOptions: engineOpts,
        log,
        errlog,
      });
      return res.code;
    }

    case 'submit': {
      return (await runSubmit({ dryRun: args['dry-run'] === true })).code;
    }

    case 'collect': {
      return (await runCollect()).code;
    }

    case 'status': {
      return status({ store: engine.store, settings, log }).code;
    }

    case 'ci': {
      if (!adapter || typeof adapter.extract !== 'function') {
        errlog('ci: the configured adapter cannot extract.');
        return 2;
      }
      const res = await runCi({
        project,
        env,
        steps: { extract: () => engine.extract(), collect: runCollect, submit: () => runSubmit(), cancel: runCancel, readPending: () => engine.store.readPending() },
        ...(fetchImpl ? { fetchImpl } : {}),
        log,
        errlog,
      });
      return res.code;
    }

    case 'overlay': {
      return runOverlay({ project, env, log, errlog }).code;
    }

    case 'sync': {
      const envFile = typeof args['env-file'] === 'string' ? path.resolve(cwd, args['env-file']) : undefined;
      const token = readToken({ env, tokenEnv: syncSettings(project.config.sync).tokenEnv, envFile, fsImpl });
      return runSync({ project, env, token, log, errlog }).code;
    }

    case 'watch': {
      const envFile = typeof args['env-file'] === 'string' ? path.resolve(cwd, args['env-file']) : undefined;
      // Run for real, the watcher stops between polls on a termination signal, never in the middle of a sync.
      const live = cycles === undefined;
      const controller = new AbortController();
      const stop = () => controller.abort();
      if (live) for (const s of ['SIGTERM', 'SIGINT']) process.on(s, stop);
      try {
        const res = await runWatch({
          project,
          env,
          envFile,
          fsImpl,
          log,
          errlog,
          signal: controller.signal,
          ...(sleep ? { sleep } : {}),
          ...(live ? {} : { cycles }),
        });
        return res.code;
      } finally {
        if (live) for (const s of ['SIGTERM', 'SIGINT']) process.off(s, stop);
      }
    }

    case 'local': {
      if (!adapter || typeof adapter.extract !== 'function') {
        errlog('local: the configured adapter cannot extract.');
        return 2;
      }
      const synchronous = !BATCH_BACKENDS.includes(backendKind);
      const res = await runLocal({
        project,
        env,
        steps: {
          extract: () => engine.extract(),
          gate: () => engine.gate({ targets }),
          ...(synchronous
            ? { translate: () => engine.translate({ targets, glossary, trigger: 'local' }), backend: backendKind }
            : { submit: () => runSubmit(), collect: runCollect }),
          readPending: () => engine.store.readPending(),
        },
        ...(runCommand ? { runCommand } : {}),
        ...(sleep ? { sleep } : {}),
        log,
        errlog,
      });
      return res.code;
    }

    case 'prepush': {
      const positional = args._.slice(1);
      if (positional.length > 2) {
        errlog('prepush: give one commit, or the remote and its URL as git gives a pre-push hook.');
        return 2;
      }
      const commit = positional.length === 1 ? positional[0] : null;
      let input = '';
      if (!commit) input = stdin !== undefined ? stdin : process.stdin.isTTY ? '' : nodeFs.readFileSync(0, 'utf8');
      return (await runPrepush({ project, commit, stdin: input, env, log, errlog })).code;
    }

    case 'verify-drift': {
      if (!adapter || typeof adapter.verifyDrift !== 'function') {
        errlog('verify-drift: the configured adapter has no drift guard.');
        return 2;
      }
      const scope = typeof args.scope === 'string' ? args.scope : 'real';
      log(`[anti-drift] scope=${scope}, targets=${targets.join(', ')}`);
      const { clean, message } = adapter.verifyDrift({
        tmByLang: engine.store.readAllTM(targets),
        memoryTextsByLang: Object.fromEntries(targets.map((lang) => [lang, engine.store.memoryTexts(lang)])),
        recordedSourceTexts: engine.store.recordedSourceTexts(),
        targets,
        scope,
      });
      log(message);
      return clean ? 0 : 1;
    }

    case 'seed': {
      if (!adapter || typeof adapter.seedAlign !== 'function') {
        errlog('seed: the configured adapter cannot seed.');
        return 2;
      }
      const { seeded, languages } = await engine.seed({ targets });
      log(`seed: ${seeded} entries imported (${languages.join(', ')}).`);
      return 0;
    }

    case 'gc': {
      const graceDays = args.grace && args.grace !== true ? Number(args.grace) : 0;
      const apply = !!args.apply;
      const { orphans, byLang, applied } = engine.gc({ graceDays, apply });
      log(`gc: ${orphans.length} orphaned keys in total (grace=${graceDays}d, apply=${applied}).`);
      for (const [lang, info] of Object.entries(byLang)) {
        log(`  ${lang}: eligible=${info.eligible.length}, archived=${info.archived}`);
      }
      return 0;
    }

    default:
      errlog(`Unknown command: ${cmd}`);
      return 2;
  }
}

export default { runCli, COMMANDS, USAGE };
