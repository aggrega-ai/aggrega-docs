/**
 * doctor.mjs — `l10n doctor`: checks a consuming project's wiring and prints one
 * line per check.
 *
 * READS the configuration file and the locale declaration it names, the prompt
 * files, the glossary, the translation workflow file and the collector workflow
 * file — and in the local mode, instead of the two workflows, the pre-push hook,
 * `package.json` and the check workflow file. WRITES nothing, runs
 * no git command, makes no network call and creates no client: every check is a
 * read of a file in the project.
 *
 * THE CHECKS, in order:
 *   1. configuration — the file is found as every command finds it, and
 *      validates through `loadConfig`;
 *   2. prompt files — every target locale has a non-empty
 *      `<promptsDir>/<locale>.md`, and a general prompt file, when present, is
 *      not empty (`requests.mjs`'s loaders, one locale at a time, so every
 *      missing file is named);
 *   3. glossary — the configuration names one, it is a JSON object, its
 *      `do_not_translate_case`, when present, is a matching mode, and every
 *      `do_not_translate` entry object is `{ "term", "case"? }`
 *      (`doNotTranslateOf`, the reading every command that translates makes);
 *   4. API key variable — `backend.apiKeyEnv`, or its default, is a variable
 *      name and does not begin `VITE_` (for the `claude-code` backend,
 *      `backend.tokenEnv`, the OAuth token's variable); read from the file as
 *      written, so it is checked even when the configuration does not validate;
 *   5. workflow — `.github/workflows/<ci.workflow>` at the repository root
 *      exists, `workflow.mjs` reads it, and it holds every rule `workflow.mjs`
 *      states, for the working branch, the trigger paths this configuration
 *      implies and its API key variable, and — when the configuration is not at
 *      the repository root — its CI step passes `--config <path>`. A file the
 *      reader cannot read fails this check, naming the line, to be checked by
 *      hand;
 *   6. collector — the configuration names `ci.collector`, and
 *      `.github/workflows/<ci.collector>` exists, is read, holds every rule
 *      `workflow.mjs` states for the collector, passes `--config <path>` as the
 *      workflow check requires, and shares the translation workflow's
 *      concurrency group;
 *   7. CI branch — the configuration has a `ci` key naming `ci.branch`;
 *   8. derived commands and paths — `sync.commands` and `sync.paths` each name
 *      at least one entry.
 * A check that needs the validated configuration is reported as not checked
 * when the configuration does not validate.
 *
 * IN THE LOCAL MODE (`mode: "local"`; read from the file as written when it does
 * not validate) the checks are the first four above, then, in place of the
 * CI-mode ones:
 *   5. local commands and paths — `local.commands` and `local.paths` each name
 *      at least one entry;
 *   6. pre-push hook — `<repository root>/.githooks/pre-push` exists, is
 *      executable, runs `l10n prepush` passing git's arguments (`"$@"`), and
 *      passes `--config <path>` when the configuration is not
 *      `<repository root>/l10n.config.json`;
 *   7. prepare script — the repository root's `package.json` has a `prepare`
 *      script that sets `core.hooksPath` to `.githooks`;
 *   8. check workflow — `.github/workflows/l10n-check.yml` exists, is read, and
 *      holds every rule of the check workflow (`checkWorkflowProblems`), for the
 *      paths this configuration implies (`checkTriggerPaths`) and the same
 *      `--config` rule.
 *
 * THE REPOSITORY ROOT is the nearest directory at or above the project root
 * holding `.github` or `.git`, else the project root. The trigger paths are
 * relative to it: the source files (with the JSON-content adapter, the source
 * locale's content directory and UI dictionary file; with the Markdown adapter,
 * each `include` glob under `sourceDir`), the human layer `<memory.dir>/messages/`
 * and the prompts directory. The working branch is `ci.dispatch.ref`, or else
 * the translation workflow's one push branch, which may not be the CI branch;
 * the collector checks out the same branch.
 *
 * The exit code is 0 when every check passes and 1 otherwise.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import {
  CONFIG_FILE_NAME,
  ConfigError,
  DEFAULT_API_KEY_ENV,
  DEFAULT_CLAUDE_CODE_TOKEN_ENV,
  DEFAULT_WORKFLOW_FILE,
  ENV_NAME_PATTERN,
  clientExposedNameProblem,
  expandLang,
  findConfigPath,
  loadConfig,
  modeOf,
} from './config.mjs';
import { loadGeneralPrompt, loadLanguagePrompts } from './requests.mjs';
import { doNotTranslateOf } from './translator-prompt.mjs';
import {
  PREPUSH_COMMAND,
  WorkflowReadError,
  checkWorkflowProblems,
  ciStepOf,
  collectorProblems,
  readWorkflow,
  sharedGroupProblems,
  workflowProblems,
} from './workflow.mjs';

/** The checks, in the order they are printed. */
export const DOCTOR_CHECKS = Object.freeze([
  'configuration',
  'prompt files',
  'glossary',
  'API key variable',
  'workflow',
  'collector',
  'CI branch',
  'derived commands and paths',
]);

/** The checks of a local-mode configuration, in the order they are printed. */
export const LOCAL_DOCTOR_CHECKS = Object.freeze([
  'configuration',
  'prompt files',
  'glossary',
  'API key variable',
  'local commands and paths',
  'pre-push hook',
  'prepare script',
  'check workflow',
]);

/** The directory of the hooks git runs, relative to the repository root, once `prepare` sets `core.hooksPath` to it. */
export const HOOKS_DIR = '.githooks';

/** The pre-push hook's file name, in `HOOKS_DIR`. */
export const PRE_PUSH_HOOK = 'pre-push';

/** The check workflow's file name, in `.github/workflows/`. */
export const CHECK_WORKFLOW_FILE = 'l10n-check.yml';

/** A `prepare` script that points `core.hooksPath` at `HOOKS_DIR`. */
const PREPARE_HOOKS_PATH = /core\.hooksPath\s+(?:\.\/)?\.githooks\/?(?:\s|$|;|&|\||'|")/;

const toPosix = (p) => p.split(path.sep).join('/');

/** The repository root: the nearest directory at or above `start` holding `.github` or `.git`, else `start`. */
export function repositoryRoot(start, fsImpl = nodeFs) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (fsImpl.existsSync(path.join(dir, '.github')) || fsImpl.existsSync(path.join(dir, '.git'))) return dir;
    if (path.dirname(dir) === dir) return path.resolve(start);
  }
}

/**
 * The paths a push must touch to start the translation workflow, relative to
 * the repository root, in the order the package's workflow template lists them:
 * the source files, the human layer, the prompt files.
 *
 * @param {import('./config.mjs').Project} project
 * @param {string} root  the repository root.
 * @returns {string[]}
 */
export function triggerPaths(project, root) {
  const rel = (abs) => toPosix(path.relative(root, abs));
  const under = (abs, glob) => {
    const base = rel(abs);
    return base ? path.posix.join(base, glob) : glob;
  };
  const { adapter } = project.config;
  const source = project.locales.source;
  const paths = [];
  if (adapter.kind === 'json-content') {
    paths.push(under(expandLang(project.resolve(adapter.content.source), source), '**'));
    if (adapter.ui) paths.push(rel(expandLang(project.resolve(adapter.ui.source), source)));
  } else {
    for (const glob of adapter.include) paths.push(under(project.resolve(adapter.sourceDir), glob));
  }
  paths.push(under(path.join(project.memoryDir, 'messages'), '**'));
  paths.push(under(project.promptsDir, '**'));
  return paths;
}

/**
 * The paths a push must touch to start the check workflow, relative to the
 * repository root: the source files, as `triggerPaths` gives them; the whole
 * memory directory, both layers and the prompt files under it included; the
 * prompts directory, when it lies outside the memory directory; and every
 * target locale's committed targets — with the JSON-content adapter its content
 * directory and its UI dictionary file, with the Markdown adapter its directory
 * under `outDir`.
 *
 * @param {import('./config.mjs').Project} project
 * @param {string} root  the repository root.
 * @returns {string[]}
 */
export function checkTriggerPaths(project, root) {
  const rel = (abs) => toPosix(path.relative(root, abs));
  const under = (abs, glob) => {
    const base = rel(abs);
    return base ? path.posix.join(base, glob) : glob;
  };
  const inside = (abs, dir) => abs === dir || abs.startsWith(`${dir}${path.sep}`);
  const { adapter } = project.config;
  // `triggerPaths` ends with the human layer and the prompts directory, which the whole memory directory replaces here.
  const paths = triggerPaths(project, root).slice(0, -2);
  paths.push(under(project.memoryDir, '**'));
  if (!inside(project.promptsDir, project.memoryDir)) paths.push(under(project.promptsDir, '**'));
  for (const lang of project.locales.targets) {
    if (adapter.kind === 'json-content') {
      paths.push(under(expandLang(project.resolve(adapter.content.target), lang), '**'));
    } else {
      paths.push(under(path.join(project.resolve(adapter.outDir), lang), '**'));
    }
  }
  if (adapter.kind === 'json-content' && adapter.ui) {
    for (const lang of project.locales.targets) paths.push(rel(expandLang(project.resolve(adapter.ui.target), lang)));
  }
  return paths;
}

/** The `--config` a command must be given at the repository root to find this configuration, or null when it finds it unaided. */
function configArgument(project, root) {
  const configRel = toPosix(path.relative(root, project.configPath));
  return configRel === CONFIG_FILE_NAME ? null : configRel;
}

/** The local commands and paths check. */
function checkLocalSettings(project) {
  const local = project.config.local;
  const commands = local && Array.isArray(local.commands) ? local.commands : [];
  const paths = local && Array.isArray(local.paths) ? local.paths : [];
  const missing = [];
  if (commands.length === 0) missing.push('local.commands');
  if (paths.length === 0) missing.push('local.paths');
  if (missing.length) return { ok: false, detail: `the configuration names no ${missing.join(' and no ')}` };
  return { ok: true, detail: `${commands.length} command(s) (${commands.join('; ')}), ${paths.length} path(s) (${paths.join(', ')})` };
}

/** The pre-push hook check. */
function checkPrePushHook(project, fsImpl) {
  const root = repositoryRoot(project.root, fsImpl);
  const file = path.join(root, HOOKS_DIR, PRE_PUSH_HOOK);
  const shown = toPosix(path.relative(project.root, file));
  if (!fsImpl.existsSync(file)) return { ok: false, detail: `${shown} does not exist` };
  const problems = [];
  if ((fsImpl.statSync(file).mode & 0o111) === 0) problems.push('it is not executable');
  const text = fsImpl.readFileSync(file, 'utf8');
  if (!PREPUSH_COMMAND.test(text)) problems.push('it does not run `l10n prepush`');
  if (!text.includes('"$@"')) problems.push('it does not pass git\'s arguments ("$@") to `l10n prepush`');
  const config = configArgument(project, root);
  if (config && !text.includes(`--config ${config}`)) problems.push(`it must pass --config ${config}, since the configuration is not ${CONFIG_FILE_NAME} at the repository root`);
  if (problems.length) return { ok: false, detail: `${shown}: ${problems.join('; ')}` };
  return { ok: true, detail: `${shown}: executable, runs \`l10n prepush\` with git's arguments and standard input` };
}

/** The prepare script check. */
function checkPrepare(project, fsImpl) {
  const root = repositoryRoot(project.root, fsImpl);
  const file = path.join(root, 'package.json');
  const shown = toPosix(path.relative(project.root, file)) || 'package.json';
  if (!fsImpl.existsSync(file)) return { ok: false, detail: `${shown} does not exist, so nothing sets core.hooksPath to ${HOOKS_DIR}` };
  let manifest;
  try {
    manifest = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ok: false, detail: `${shown} is not valid JSON (${(err && err.message) || err})` };
  }
  const prepare = manifest && manifest.scripts && typeof manifest.scripts.prepare === 'string' ? manifest.scripts.prepare : null;
  if (prepare === null) return { ok: false, detail: `${shown} has no "prepare" script, so \`npm install\` does not set core.hooksPath to ${HOOKS_DIR}` };
  if (!PREPARE_HOOKS_PATH.test(prepare)) return { ok: false, detail: `${shown}: the "prepare" script does not set core.hooksPath to ${HOOKS_DIR}; it is ${JSON.stringify(prepare)}` };
  return { ok: true, detail: `${shown}: "prepare" sets core.hooksPath to ${HOOKS_DIR}` };
}

/** The check workflow check. */
function checkCheckWorkflow(project, fsImpl) {
  const root = repositoryRoot(project.root, fsImpl);
  const read = readWorkflowFile(project, root, CHECK_WORKFLOW_FILE, fsImpl);
  if (read.failure) return { ok: false, detail: read.failure };
  const problems = [];
  for (const { rule, problems: found } of checkWorkflowProblems(read.wf, { paths: checkTriggerPaths(project, root), config: configArgument(project, root) })) {
    for (const p of found) problems.push(`${rule}: ${p}`);
  }
  if (problems.length) return { ok: false, detail: `${read.shown}: ${problems.join('; ')}` };
  return { ok: true, detail: `${read.shown}: a push touching the sources, the memory, the prompts or the targets, and by hand; contents read alone; \`l10n prepush\` on the pushed commit; no secret outside the install step` };
}

/** Reads the configuration file as written, or null when it cannot be read as JSON. */
function rawConfig(configPath, fsImpl) {
  try {
    return JSON.parse(fsImpl.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

/** The prompt-files check. */
function checkPrompts(project, fsImpl) {
  const problems = [];
  for (const lang of project.locales.targets) {
    try {
      loadLanguagePrompts({ promptsDir: project.promptsDir, targets: [lang], fsImpl });
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      problems.push(err.message);
    }
  }
  let general = false;
  try {
    general = loadGeneralPrompt({ promptsDir: project.promptsDir, fsImpl }) !== null;
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    problems.push(err.message);
  }
  if (problems.length) return { ok: false, detail: problems.join('; ') };
  const where = toPosix(path.relative(project.root, project.promptsDir)) || '.';
  return {
    ok: true,
    detail: `${where}/: ${project.locales.targets.map((lang) => `${lang}.md`).join(', ')}${general ? ', and the general prompt _general.md' : ''}`,
  };
}

/** The glossary check. */
function checkGlossary(project, fsImpl) {
  if (!project.glossaryPath) return { ok: false, detail: 'the configuration names no glossary (the "glossary" key)' };
  const shown = toPosix(path.relative(project.root, project.glossaryPath));
  if (!fsImpl.existsSync(project.glossaryPath)) return { ok: false, detail: `${shown} does not exist` };
  let value;
  try {
    value = JSON.parse(fsImpl.readFileSync(project.glossaryPath, 'utf8'));
  } catch (err) {
    return { ok: false, detail: `${shown} is not valid JSON (${(err && err.message) || err})` };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, detail: `${shown} is not a JSON object` };
  try {
    doNotTranslateOf(value);
  } catch (err) {
    return { ok: false, detail: `${shown}: ${err.message}` };
  }
  return { ok: true, detail: shown };
}

/**
 * The API key variable check, on the configuration as written: the API key's
 * variable for the `anthropic` backend, the OAuth token's for `claude-code`.
 */
function checkApiKeyName(raw) {
  const backend = raw && typeof raw === 'object' ? raw.backend : undefined;
  const subscription = Boolean(backend && typeof backend === 'object' && backend.kind === 'claude-code');
  const key = subscription ? 'tokenEnv' : 'apiKeyEnv';
  const declared = backend && typeof backend === 'object' ? backend[key] : undefined;
  const name = declared === undefined ? (subscription ? DEFAULT_CLAUDE_CODE_TOKEN_ENV : DEFAULT_API_KEY_ENV) : declared;
  if (typeof name !== 'string' || !ENV_NAME_PATTERN.test(name)) {
    return { ok: false, detail: `backend.${key}, ${JSON.stringify(name)}, is not an environment-variable name` };
  }
  const problem = clientExposedNameProblem(name);
  if (problem) return { ok: false, detail: `backend.${key}: ${problem}` };
  const login = subscription && backend.login === 'allowed' ? ', or the Claude Code CLI login, which backend.login allows' : '';
  return {
    ok: true,
    detail: `${name}${declared === undefined ? ' (the default)' : ''}, read from the environment${subscription ? ` for the claude-code backend${login}` : ''}`,
  };
}

/**
 * Reads `.github/workflows/<name>` at the repository root: `{ shown, text, wf }`,
 * or `{ shown, failure }` when it does not exist or cannot be read here.
 */
function readWorkflowFile(project, root, name, fsImpl) {
  const file = path.join(root, '.github', 'workflows', name);
  const shown = toPosix(path.relative(project.root, file));
  if (!fsImpl.existsSync(file)) return { shown, failure: `${shown} does not exist` };
  const text = fsImpl.readFileSync(file, 'utf8');
  try {
    return { shown, text, wf: readWorkflow(text) };
  } catch (err) {
    if (!(err instanceof WorkflowReadError)) throw err;
    return { shown, failure: `${shown} cannot be read here (${err.message}); check it by hand against the rules in the package README` };
  }
}

/** The working branch: `ci.dispatch.ref`, else the translation workflow's one push branch, else null. */
function workingBranch(ci, translation) {
  if (ci.dispatch) return ci.dispatch.ref;
  const branches = translation && translation.on && translation.on.push && Array.isArray(translation.on.push.branches) ? translation.on.push.branches : [];
  return branches.length === 1 ? branches[0] : null;
}

/** The problems `rules` found in a workflow, the working branch's and the `--config` rule's, each prefixed with its rule. */
function ruleProblems(project, root, wf, rules, working, args) {
  const problems = [];
  for (const { rule, problems: found } of rules(wf, { working: working === null ? '(the working branch)' : working, apiKeyEnv: project.config.backend.apiKeyEnv, ...args })) {
    for (const p of found) problems.push(`${rule}: ${p}`);
  }
  const at = configArgument(project, root);
  const { step } = ciStepOf(wf);
  if (at !== null && step && !step.run.includes(`--config ${at}`)) {
    problems.push(`the CI step must pass --config ${at}, since the configuration is not ${CONFIG_FILE_NAME} at the repository root`);
  }
  return problems;
}

/** The workflow check. */
function checkWorkflow(project, fsImpl) {
  const ci = project.config.ci;
  if (!ci) return { ok: false, detail: 'the configuration has no "ci" key, so no workflow runs `l10n ci` for it' };
  const root = repositoryRoot(project.root, fsImpl);
  const read = readWorkflowFile(project, root, ci.workflow || DEFAULT_WORKFLOW_FILE, fsImpl);
  if (read.failure) return { ok: false, detail: read.failure };
  const { shown, text, wf } = read;
  const working = workingBranch(ci, wf);
  const problems = [];
  if (working === null) problems.push(`on.push.branches must name the working branch alone; it is ${JSON.stringify(wf && wf.on && wf.on.push ? wf.on.push.branches : undefined)}`);
  else if (working === ci.branch) problems.push(`the working branch ${working} must not be the CI branch`);
  problems.push(...ruleProblems(project, root, wf, workflowProblems, working, { paths: triggerPaths(project, root), text }));
  if (problems.length) return { ok: false, detail: `${shown}: ${problems.join('; ')}` };
  return { ok: true, detail: `${shown}: push to ${working} and by hand, no schedule; no pull-request trigger; contents and actions write; one concurrency group that cancels no run` };
}

/** The collector check. */
function checkCollector(project, fsImpl) {
  const ci = project.config.ci;
  if (!ci) return { ok: false, detail: 'the configuration has no "ci" key, so no collector runs `l10n ci` for it' };
  if (!ci.collector) return { ok: false, detail: 'the configuration names no ci.collector, so a batch is collected only by the next push or a manual run' };
  const root = repositoryRoot(project.root, fsImpl);
  const read = readWorkflowFile(project, root, ci.collector, fsImpl);
  if (read.failure) return { ok: false, detail: read.failure };
  const { shown, text, wf } = read;
  const translation = readWorkflowFile(project, root, ci.workflow || DEFAULT_WORKFLOW_FILE, fsImpl);
  const working = workingBranch(ci, translation.wf);
  const problems = ruleProblems(project, root, wf, collectorProblems, working, { text });
  if (translation.wf) problems.push(...sharedGroupProblems(translation.wf, wf).map((p) => `concurrency: ${p}`));
  else problems.push(`concurrency: the translation workflow cannot be compared (${translation.failure})`);
  if (problems.length) return { ok: false, detail: `${shown}: ${problems.join('; ')}` };
  return { ok: true, detail: `${shown}: every 10 minutes and by hand, switched on by \`l10n ci\` while a batch is recorded; the translation workflow's concurrency group` };
}

/** The CI branch check. */
function checkCiBranch(project) {
  const ci = project.config.ci;
  if (!ci) return { ok: false, detail: 'the configuration has no "ci" key naming ci.branch' };
  return { ok: true, detail: `${ci.branch}${ci.dispatch ? `, dispatching ${ci.dispatch.workflow} on ${ci.dispatch.ref}` : ''}` };
}

/** The derived commands and paths check. */
function checkDerived(project) {
  const sync = project.config.sync;
  const commands = sync && Array.isArray(sync.commands) ? sync.commands : [];
  const paths = sync && Array.isArray(sync.paths) ? sync.paths : [];
  const missing = [];
  if (commands.length === 0) missing.push('sync.commands');
  if (paths.length === 0) missing.push('sync.paths');
  if (missing.length) return { ok: false, detail: `the configuration names no ${missing.join(' and no ')}` };
  return { ok: true, detail: `${commands.length} command(s) (${commands.join('; ')}), ${paths.length} path(s) (${paths.join(', ')})` };
}

/**
 * Runs every check and prints one line per check, then a summary line.
 *
 * @param {Object} args
 * @param {string} [args.cwd]          where the configuration search starts.
 * @param {NodeJS.ProcessEnv} [args.env]  read for `L10N_CONFIG` alone.
 * @param {string} [args.explicit]     the `--config` path.
 * @param {typeof nodeFs} [args.fsImpl]
 * @param {(...a:any[])=>void} [args.log]
 * @returns {{code:number, results:Array<{check:string, status:'pass'|'FAIL'|'not checked', detail:string}>}}
 */
export function runDoctor({ cwd = process.cwd(), env = process.env, explicit, fsImpl = nodeFs, log = (...a) => console.log(...a) } = {}) {
  const results = [];
  const record = (check, outcome) => results.push({ check, status: outcome.ok ? 'pass' : 'FAIL', detail: outcome.detail });
  const skip = (check) => results.push({ check, status: 'not checked', detail: 'the configuration does not validate' });

  let configPath = null;
  let project = null;
  try {
    configPath = findConfigPath({ cwd, env, explicit, fsImpl });
    project = loadConfig({ configPath, fsImpl });
    record('configuration', {
      ok: true,
      detail: `${configPath} validates: source ${project.locales.source}, targets ${project.locales.targets.join(', ') || 'none'}`,
    });
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    record('configuration', { ok: false, detail: err.message.split('\n').map((l) => l.trim()).join('; ') });
  }

  const raw = configPath ? rawConfig(configPath, fsImpl) : null;
  const local = project ? modeOf(project.config) === 'local' : Boolean(raw && typeof raw === 'object' && raw.mode === 'local');
  if (project) record('prompt files', checkPrompts(project, fsImpl));
  else skip('prompt files');
  if (project) record('glossary', checkGlossary(project, fsImpl));
  else skip('glossary');
  record('API key variable', checkApiKeyName(raw));
  if (local) {
    const checks = [
      ['local commands and paths', () => checkLocalSettings(project)],
      ['pre-push hook', () => checkPrePushHook(project, fsImpl)],
      ['prepare script', () => checkPrepare(project, fsImpl)],
      ['check workflow', () => checkCheckWorkflow(project, fsImpl)],
    ];
    for (const [check, run] of checks) {
      if (project) record(check, run());
      else skip(check);
    }
    return report(results, log);
  }
  if (project) record('workflow', checkWorkflow(project, fsImpl));
  else skip('workflow');
  if (project) record('collector', checkCollector(project, fsImpl));
  else skip('collector');
  if (project) record('CI branch', checkCiBranch(project));
  else skip('CI branch');
  if (project) record('derived commands and paths', checkDerived(project));
  else skip('derived commands and paths');
  return report(results, log);
}

/** Prints one line per result, then the summary, and returns the exit code with the results. */
function report(results, log) {
  const width = Math.max(...results.map((r) => r.status.length));
  for (const r of results) log(`  ${r.status.padEnd(width)}  ${r.check}: ${r.detail}`);
  const failed = results.filter((r) => r.status !== 'pass');
  log(
    failed.length === 0
      ? `doctor: all ${results.length} checks passed.`
      : `doctor: ${failed.length} of ${results.length} checks did not pass: ${failed.map((r) => r.check).join(', ')}.`
  );
  return { code: failed.length === 0 ? 0 : 1, results };
}

export default { DOCTOR_CHECKS, LOCAL_DOCTOR_CHECKS, HOOKS_DIR, PRE_PUSH_HOOK, CHECK_WORKFLOW_FILE, repositoryRoot, triggerPaths, checkTriggerPaths, runDoctor };
