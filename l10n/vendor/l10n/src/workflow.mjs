/**
 * workflow.mjs — The rules a CI-mode project's two workflows hold — the
 * translation workflow and its collector — and the rules a local-mode
 * project's check workflow holds, as predicates over a workflow read as a
 * plain object, and the reader `doctor` reads a workflow file with.
 *
 * READS nothing and WRITES nothing: `readWorkflow` takes the file's text, and
 * each rule takes the object it returned, or the one any YAML parser returns
 * for the same file.
 *
 * THE RULES are the ones the package README's "The workflows" section states,
 * each a function returning the problems it found — an empty list when the
 * workflow holds the rule:
 *   - `triggerProblems`: the translation workflow's triggers, a push to the
 *     working branch touching exactly the given paths and manual dispatch, and
 *     no schedule — or manual dispatch alone (`manualOnly`);
 *   - `collectorTriggerProblems`: the collector's triggers, a schedule every
 *     10 minutes and manual dispatch — or manual dispatch alone;
 *   - `pullRequestProblems`: no `pull_request` and no `pull_request_target`
 *     trigger, because the job holds the API key;
 *   - `permissionProblems`: `contents: write` and `actions: write` and nothing
 *     else, and one job, `translate`, with no permissions of its own;
 *   - `concurrencyProblems`: one named group that never cancels a run in progress;
 *   - `checkoutProblems`: the first step checks out the working branch without
 *     persisting a credential, and every action is pinned by a full commit;
 *   - `secretProblems`: the API key's secret and the job's token reach the step
 *     that runs `l10n ci` alone, and the secret is named once in the file.
 * Every other rule holds for both workflows. `workflowProblems` applies every
 * rule to the translation workflow, `collectorProblems` to the collector, and
 * `sharedGroupProblems` checks that the two share their concurrency group, so a
 * collection and a translation run never race for the CI branch. This
 * package's `doctor` and the tests of a consuming project's workflows apply the
 * same functions, so the rules have one statement.
 *
 * A LOCAL-MODE project's one workflow is the CHECK WORKFLOW, which runs
 * `l10n prepush` on the pushed commit, so a push the local hook never saw turns
 * red. Its rules, applied together by `checkWorkflowProblems`:
 *   - `checkTriggerProblems`: a push touching exactly the given paths, on any
 *     branch, and manual dispatch; nothing else;
 *   - `checkPullRequestProblems`: no `pull_request_target` trigger, which runs
 *     with the base repository's secrets;
 *   - `checkPermissionProblems`: `contents: read` and nothing else, and one job,
 *     `check`, with no permissions of its own;
 *   - `checkStepProblems`: the first step checks out the commit persisting no
 *     credential, every action is pinned by a full commit, and exactly one step
 *     runs `l10n prepush` on the pushed commit, after the install step;
 *   - `checkSecretProblems`: no secret — no `secrets.` expression and no
 *     `github.token` — anywhere but in the one step named `Install`, so the
 *     check itself, which runs the pushed commit's files, reads none.
 *
 * THE READER reads the YAML subset GitHub workflows are written in: block
 * mappings and sequences, a flow sequence of scalars on one line, `{}`, single-
 * and double-quoted scalars on one line, plain scalars resolved as YAML 1.2's
 * core schema resolves them (null, booleans, decimal integers and floats),
 * literal block scalars (`|`, `|-`), and comments. Anything else — an anchor,
 * an alias, a tag, a folded block scalar, a multi-line plain or quoted scalar,
 * a flow mapping that is not empty, a duplicated key, a second document, a tab
 * in an indentation — throws a `WorkflowReadError` naming the line, rather than
 * being read as something it may not be. A caller that cannot read a file
 * therefore reports it unchecked, never as holding the rules.
 */

import { isDeepStrictEqual } from 'node:util';

/** A file `readWorkflow` does not read: outside the subset, or not a mapping. */
export class WorkflowReadError extends Error {
  constructor(message, line) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = 'WorkflowReadError';
    this.line = line || null;
  }
}

// -- The reader ----------------------------------------------------------------

const KEY_LINE = /^([A-Za-z0-9_][A-Za-z0-9_.\/-]*)[ ]*:(?:[ ]+(.*))?$/;
const NULL_PLAIN = /^(?:~|null|Null|NULL)?$/;
const TRUE_PLAIN = /^(?:true|True|TRUE)$/;
const FALSE_PLAIN = /^(?:false|False|FALSE)$/;
const INT_PLAIN = /^[-+]?[0-9]+$/;
const FLOAT_PLAIN = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/;
/** Plain scalars the core schema resolves to something this reader does not: other number bases, infinities, not-a-number. */
const UNREAD_PLAIN = /^(?:[-+]?0o[0-7]+|[-+]?0x[0-9a-fA-F]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
const DOUBLE_ESCAPES = { '\\': '\\', '"': '"', '/': '/', n: '\n', t: '\t' };

/** Resolves a plain scalar as the core schema does. */
function plainValue(text, line) {
  if (UNREAD_PLAIN.test(text)) throw new WorkflowReadError(`the plain value "${text}" is outside the subset this reader reads`, line);
  if (NULL_PLAIN.test(text)) return null;
  if (TRUE_PLAIN.test(text)) return true;
  if (FALSE_PLAIN.test(text)) return false;
  if (INT_PLAIN.test(text) || FLOAT_PLAIN.test(text)) return Number(text);
  return text;
}

/** Reads a quoted scalar starting at `text[0]`; returns its value and the rest of the line. */
function quoted(text, line) {
  const quote = text[0];
  let out = '';
  for (let i = 1; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i++;
          continue;
        }
        return { value: out, rest: text.slice(i + 1) };
      }
      out += ch;
    } else {
      if (ch === '\\') {
        const next = text[i + 1];
        if (!Object.prototype.hasOwnProperty.call(DOUBLE_ESCAPES, next)) {
          throw new WorkflowReadError(`the escape "\\${next || ''}" is outside the subset this reader reads`, line);
        }
        out += DOUBLE_ESCAPES[next];
        i++;
        continue;
      }
      if (ch === '"') return { value: out, rest: text.slice(i + 1) };
      out += ch;
    }
  }
  throw new WorkflowReadError('a quoted value that does not end on its line', line);
}

/** Strips a plain scalar's trailing comment: a `#` after whitespace. */
function stripComment(text) {
  const at = text.search(/\s#/);
  return (at === -1 ? text : text.slice(0, at)).trim();
}

/** Reads a flow sequence of scalars, `[a, 'b', "c"]`, on one line. */
function flowSequence(text, line) {
  const items = [];
  let i = 1;
  const skip = () => {
    while (text[i] === ' ') i++;
  };
  skip();
  if (text[i] === ']') {
    i++;
  } else {
    for (;;) {
      skip();
      const ch = text[i];
      if (ch === undefined) throw new WorkflowReadError('a flow sequence that does not end on its line', line);
      if (ch === "'" || ch === '"') {
        const { value, rest } = quoted(text.slice(i), line);
        items.push(value);
        i = text.length - rest.length;
      } else {
        const m = /^[^,[\]{}#]*/.exec(text.slice(i));
        const raw = m[0].trim();
        if (raw === '' || /^[&*!|>%@`?:-](?:\s|$)|^[&*!|>%@`'"]/.test(raw) || /:\s/.test(raw)) {
          throw new WorkflowReadError('a flow sequence entry outside the subset this reader reads', line);
        }
        items.push(plainValue(raw, line));
        i += m[0].length;
      }
      skip();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        break;
      }
      throw new WorkflowReadError('a flow sequence entry outside the subset this reader reads', line);
    }
  }
  const rest = text.slice(i);
  if (!/^\s*(?:#.*)?$/.test(rest) || (rest !== '' && !/^\s/.test(rest))) throw new WorkflowReadError('text after a flow sequence', line);
  return items;
}

/** Reads the value written after `key: ` or `- ` on one line. */
function inlineValue(text, line) {
  const first = text[0];
  if (first === '[') return flowSequence(text, line);
  if (first === '{') {
    if (/^\{\s*\}\s*(?:#.*)?$/.test(text)) return {};
    throw new WorkflowReadError('a flow mapping that is not empty', line);
  }
  if (first === "'" || first === '"') {
    const { value, rest } = quoted(text, line);
    if (!/^(?:\s+(?:#.*)?)?$/.test(rest)) throw new WorkflowReadError('text after a quoted value', line);
    return value;
  }
  if (/^[&*!%@`|>,\]}#]/.test(text) || /^[-?:](?:\s|$)/.test(text)) {
    throw new WorkflowReadError(`a value beginning "${first}" is outside the subset this reader reads`, line);
  }
  const plain = stripComment(text);
  if (/:(?:\s|$)/.test(plain)) throw new WorkflowReadError('a plain value holding ": "', line);
  return plainValue(plain, line);
}

/** Builds the reader over the file's lines. */
function createParser(text) {
  const lines = text
    .replace(/^﻿/, '')
    .split('\n')
    .map((raw, index) => ({ no: index + 1, text: raw.endsWith('\r') ? raw.slice(0, -1) : raw }));
  let at = 0;

  const significant = (entry) => !/^\s*(?:#.*)?$/.test(entry.text);
  const indentOf = (entry) => {
    const lead = /^[ \t]*/.exec(entry.text)[0];
    if (lead.includes('\t')) throw new WorkflowReadError('a tab in an indentation', entry.no);
    return lead.length;
  };
  /** The next significant line, at or after `at`, or null; skips blank and comment lines. */
  const peek = () => {
    while (at < lines.length && !significant(lines[at])) at++;
    if (at >= lines.length) return null;
    const entry = lines[at];
    const body = entry.text.trimStart();
    if (/^(?:---|\.\.\.)(?:\s|$)/.test(entry.text) || entry.text.startsWith('%')) {
      throw new WorkflowReadError('a document marker or a directive', entry.no);
    }
    return { entry, indent: indentOf(entry), body };
  };
  const isItem = (body) => body === '-' || body.startsWith('- ');

  function block(minIndent) {
    const next = peek();
    if (!next || next.indent < minIndent) return null;
    return isItem(next.body) ? sequence(next.indent) : mapping(next.indent);
  }

  /** A literal block scalar after `header` (`|` or `|-`), more indented than `parent`. */
  function literal(header, parent, no) {
    const m = /^\|(-?)(\s+#.*)?\s*$/.exec(header);
    if (!m) throw new WorkflowReadError(`the block scalar header "${header}" is outside the subset this reader reads`, no);
    const strip = m[1] === '-';
    const body = [];
    let indent = null;
    while (at < lines.length) {
      const entry = lines[at];
      if (/^ *$/.test(entry.text)) {
        body.push(indent === null ? '' : entry.text.slice(indent));
        at++;
        continue;
      }
      const lead = /^ */.exec(entry.text)[0].length;
      if (indent === null) {
        if (lead <= parent) break;
        indent = lead;
      }
      if (lead < indent) break;
      body.push(entry.text.slice(indent));
      at++;
    }
    const core = body.join('\n').replace(/\n+$/, '');
    if (core === '') return '';
    return strip ? core : `${core}\n`;
  }

  function mapping(indent) {
    const out = {};
    for (;;) {
      const next = peek();
      if (!next || next.indent < indent) return out;
      if (next.indent > indent) throw new WorkflowReadError('unexpected indentation', next.entry.no);
      if (isItem(next.body)) throw new WorkflowReadError('a sequence entry where a mapping key belongs', next.entry.no);
      const m = KEY_LINE.exec(next.body);
      if (!m) throw new WorkflowReadError('a line outside the subset this reader reads', next.entry.no);
      const [, key, rawRest] = m;
      if (key === '__proto__') throw new WorkflowReadError('the key "__proto__" is outside the subset this reader reads', next.entry.no);
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new WorkflowReadError(`the key "${key}" is repeated`, next.entry.no);
      at++;
      const rest = rawRest === undefined ? '' : rawRest;
      if (rest === '' || rest.startsWith('#')) {
        const after = peek();
        if (after && after.indent > indent) out[key] = block(after.indent);
        else if (after && after.indent === indent && isItem(after.body)) out[key] = sequence(indent);
        else out[key] = null;
      } else if (rest.startsWith('|')) {
        out[key] = literal(rest, indent, next.entry.no);
      } else {
        out[key] = inlineValue(rest, next.entry.no);
      }
    }
  }

  function sequence(indent) {
    const out = [];
    for (;;) {
      const next = peek();
      if (!next || next.indent < indent) return out;
      if (next.indent > indent) throw new WorkflowReadError('unexpected indentation', next.entry.no);
      if (!isItem(next.body)) return out;
      const after = next.body.slice(1);
      const content = after.trimStart();
      if (content === '' || content.startsWith('#')) {
        at++;
        const below = peek();
        out.push(below && below.indent > indent ? block(below.indent) : null);
        continue;
      }
      const column = indent + 1 + (after.length - content.length);
      if (KEY_LINE.test(content)) {
        // A mapping that starts on the entry's own line: read it as if its first key began the line.
        lines[at] = { no: next.entry.no, text: `${' '.repeat(column)}${content}` };
        out.push(mapping(column));
      } else if (isItem(content) || content.startsWith('|')) {
        throw new WorkflowReadError('a nested sequence or a block scalar on a sequence entry', next.entry.no);
      } else {
        at++;
        out.push(inlineValue(content, next.entry.no));
      }
    }
  }

  return {
    read() {
      const first = peek();
      if (!first) return null;
      if (first.indent !== 0) throw new WorkflowReadError('unexpected indentation', first.entry.no);
      if (isItem(first.body)) throw new WorkflowReadError('a workflow is a mapping, not a sequence', first.entry.no);
      const value = mapping(0);
      const left = peek();
      if (left) throw new WorkflowReadError('a line outside the subset this reader reads', left.entry.no);
      return value;
    },
  };
}

/**
 * Reads a workflow file's text into the plain object a YAML parser returns for
 * it, or throws a WorkflowReadError naming the first line outside the subset
 * the module comment states.
 *
 * @param {string} text
 * @returns {Object}
 */
export function readWorkflow(text) {
  if (typeof text !== 'string') throw new WorkflowReadError('the workflow is not text');
  const value = createParser(text).read();
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new WorkflowReadError('a workflow is a mapping');
  return value;
}

// -- The rules -------------------------------------------------------------------

/** An action reference pinned by a full commit. */
export const PINNED = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/;

/** A step's `run` that invokes the CI command. */
export const CI_COMMAND = /(?:^|[\s;&|])l10n ci(?:\s|$)/;

/** The collector's schedule, its one automatic trigger: every 10 minutes. */
export const COLLECTOR_SCHEDULE = Object.freeze([Object.freeze({ cron: '*/10 * * * *' })]);

/** The permissions each workflow holds, and no other: `contents` to push the CI branch, `actions` to switch the collector and dispatch. */
export const PERMISSIONS = Object.freeze({ contents: 'write', actions: 'write' });

/** The one job of each workflow. */
export const JOB = 'translate';

const show = (value) => (value === undefined ? 'absent' : JSON.stringify(value));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stepsOf = (wf) => (isObject(wf) && isObject(wf.jobs) && isObject(wf.jobs[JOB]) && Array.isArray(wf.jobs[JOB].steps) ? wf.jobs[JOB].steps : []);

/**
 * The step that runs the CI command: the one whose `run` is `command` when it is
 * given, else the one whose `run` invokes `l10n ci`. Returns `{ step, problems }`.
 */
export function ciStepOf(wf, { command } = {}) {
  const steps = stepsOf(wf);
  const matches = steps.filter((s) => isObject(s) && typeof s.run === 'string' && (command !== undefined ? s.run === command : CI_COMMAND.test(s.run)));
  if (matches.length === 1) return { step: matches[0], problems: [] };
  const what = command !== undefined ? `whose run is ${JSON.stringify(command)}` : 'that runs `l10n ci`';
  return { step: null, problems: [`jobs.${JOB} must hold exactly one step ${what}; it holds ${matches.length}`] };
}

/** The triggers `on` holds, against the ones it must hold and nothing else, and manual dispatch with no settings. */
function triggerSetProblems(on, want) {
  const problems = [];
  const keys = Object.keys(on).sort();
  if (!isDeepStrictEqual(keys, want)) problems.push(`on must hold ${want.join(' and ')} and nothing else; it holds ${keys.join(', ') || 'nothing'}`);
  if (on.workflow_dispatch !== null) problems.push(`on.workflow_dispatch must be present with no settings; it is ${show(on.workflow_dispatch)}`);
  return problems;
}

/**
 * Whether a workflow runs by hand alone: its `on` holds manual dispatch and no
 * other trigger. Either workflow may be written so, and then no push and no
 * schedule ever starts a paid run.
 */
export function manualOnly(wf) {
  const on = isObject(wf) ? wf.on : undefined;
  return isObject(on) && isDeepStrictEqual(Object.keys(on), ['workflow_dispatch']);
}

/**
 * The branch a workflow's first step checks out, as its `with.ref` names it, or
 * null when that is not one branch name written out.
 */
export function checkoutRef(wf) {
  const first = stepsOf(wf)[0];
  const ref = isObject(first) && isObject(first.with) ? first.with.ref : undefined;
  return typeof ref === 'string' && ref !== '' && !ref.includes('${{') ? ref : null;
}

/**
 * The translation workflow's triggers: the push to the working branch touching
 * exactly `paths`, and manual dispatch; no schedule, and no other trigger. Or,
 * run by hand alone, manual dispatch and nothing else.
 */
export function triggerProblems(wf, { working, paths }) {
  const on = isObject(wf) ? wf.on : undefined;
  if (!isObject(on)) return [`on must be a mapping of triggers; it is ${show(on)}`];
  if (manualOnly(wf)) return triggerSetProblems(on, ['workflow_dispatch']);
  const problems = triggerSetProblems(on, ['push', 'workflow_dispatch']);
  const push = { branches: [working], paths: [...paths] };
  if (!isDeepStrictEqual(on.push, push)) problems.push(`on.push must be ${JSON.stringify(push)}; it is ${show(on.push)}`);
  return problems;
}

/**
 * The collector's triggers: the schedule every 10 minutes, its one automatic
 * trigger, and manual dispatch; no other trigger. Or, run by hand alone, manual
 * dispatch and nothing else.
 */
export function collectorTriggerProblems(wf) {
  const on = isObject(wf) ? wf.on : undefined;
  if (!isObject(on)) return [`on must be a mapping of triggers; it is ${show(on)}`];
  if (manualOnly(wf)) return triggerSetProblems(on, ['workflow_dispatch']);
  const problems = triggerSetProblems(on, ['schedule', 'workflow_dispatch']);
  if (!isDeepStrictEqual(on.schedule, COLLECTOR_SCHEDULE)) problems.push(`on.schedule must be ${JSON.stringify(COLLECTOR_SCHEDULE)}; it is ${show(on.schedule)}`);
  return problems;
}

/** No pull-request trigger: the job holds the API key. */
export function pullRequestProblems(wf) {
  const on = isObject(wf) ? wf.on : undefined;
  if (!isObject(on)) return [];
  return ['pull_request', 'pull_request_target']
    .filter((name) => Object.prototype.hasOwnProperty.call(on, name))
    .map((name) => `on.${name} must be absent: the job holds the API key`);
}

/** `contents: write` and `actions: write`, nothing else, and one job with no permissions of its own. */
export function permissionProblems(wf) {
  if (!isObject(wf)) return ['the workflow is not a mapping'];
  const problems = [];
  if (!isDeepStrictEqual(wf.permissions, PERMISSIONS)) problems.push(`permissions must be ${JSON.stringify(PERMISSIONS)}; it is ${show(wf.permissions)}`);
  const jobs = isObject(wf.jobs) ? Object.keys(wf.jobs) : [];
  if (!isDeepStrictEqual(jobs, [JOB])) problems.push(`jobs must hold one job, ${JOB}; it holds ${jobs.join(', ') || 'none'}`);
  else if (isObject(wf.jobs[JOB]) && wf.jobs[JOB].permissions !== undefined) problems.push(`jobs.${JOB}.permissions must be absent; it is ${show(wf.jobs[JOB].permissions)}`);
  return problems;
}

/** One named concurrency group that never cancels a run in progress. */
export function concurrencyProblems(wf) {
  const c = isObject(wf) ? wf.concurrency : undefined;
  if (!isObject(c)) return [`concurrency must be { "group", "cancel-in-progress": false }; it is ${show(c)}`];
  const problems = [];
  if (typeof c.group !== 'string' || c.group === '') problems.push(`concurrency.group must be a name; it is ${show(c.group)}`);
  if (c['cancel-in-progress'] !== false) problems.push(`concurrency.cancel-in-progress must be false; it is ${show(c['cancel-in-progress'])}`);
  return problems;
}

/** The first step checks out the working branch, persisting no credential; every action is pinned by commit. */
export function checkoutProblems(wf, { working }) {
  const steps = stepsOf(wf);
  if (steps.length === 0) return [`jobs.${JOB}.steps must hold the job's steps`];
  const problems = [];
  const first = steps[0];
  if (!isObject(first) || typeof first.uses !== 'string' || !/^actions\/checkout@/.test(first.uses)) {
    problems.push(`the first step must be actions/checkout; it is ${show(isObject(first) ? first.uses : first)}`);
  }
  const want = { ref: working, 'persist-credentials': false };
  if (!isObject(first) || !isDeepStrictEqual(first.with, want)) problems.push(`the checkout's with must be ${JSON.stringify(want)}; it is ${show(isObject(first) ? first.with : undefined)}`);
  for (const step of steps) {
    if (isObject(step) && step.uses !== undefined && !(typeof step.uses === 'string' && PINNED.test(step.uses))) {
      problems.push(`${show(step.uses)} must be pinned by a full commit`);
    }
  }
  return problems;
}

/**
 * The API key's secret and the job's token reach the CI step alone: neither is
 * set at the workflow or the job level or on another step, and `text`, when
 * given, names the secret once.
 *
 * @param {Object} wf
 * @param {Object} args
 * @param {string} args.apiKeyEnv  the API key's variable, which the configuration names.
 * @param {string} [args.command]  the CI step's exact `run`; without it, the step that runs `l10n ci`.
 * @param {string} [args.text]     the workflow file's text.
 */
export function secretProblems(wf, { apiKeyEnv, command, text }) {
  const { step, problems } = ciStepOf(wf, { command });
  if (!step) return problems;
  const out = [];
  const env = isObject(step.env) ? step.env : {};
  const secret = `\${{ secrets.${apiKeyEnv} }}`;
  if (env[apiKeyEnv] !== secret) out.push(`the CI step's env.${apiKeyEnv} must be ${secret}; it is ${show(env[apiKeyEnv])}`);
  if (env.GITHUB_TOKEN !== '${{ github.token }}') out.push(`the CI step's env.GITHUB_TOKEN must be \${{ github.token }}; it is ${show(env.GITHUB_TOKEN)}`);
  if (isObject(wf) && wf.env !== undefined) out.push(`env must be absent at the workflow level; it is ${show(wf.env)}`);
  if (isObject(wf) && isObject(wf.jobs) && isObject(wf.jobs[JOB]) && wf.jobs[JOB].env !== undefined) out.push(`jobs.${JOB}.env must be absent; it is ${show(wf.jobs[JOB].env)}`);
  for (const other of stepsOf(wf)) {
    if (other === step || !isObject(other) || !isObject(other.env)) continue;
    for (const name of [apiKeyEnv, 'GITHUB_TOKEN']) {
      if (Object.prototype.hasOwnProperty.call(other.env, name)) out.push(`the step ${show(other.name || other.uses || other.run)} must not set ${name}`);
    }
  }
  if (typeof text === 'string') {
    const named = text.split(`secrets.${apiKeyEnv}`).length - 1;
    if (named !== 1) out.push(`the file must name secrets.${apiKeyEnv} once; it names it ${named} times`);
  }
  return out;
}

/** The rules both workflows hold, after their triggers. */
function sharedRules(wf, { working, apiKeyEnv, command, text }) {
  return [
    { rule: 'pull requests', problems: pullRequestProblems(wf) },
    { rule: 'permissions', problems: permissionProblems(wf) },
    { rule: 'concurrency', problems: concurrencyProblems(wf) },
    { rule: 'checkout', problems: checkoutProblems(wf, { working }) },
    { rule: 'secrets', problems: secretProblems(wf, { apiKeyEnv, command, text }) },
  ];
}

/**
 * Every rule of the translation workflow, applied: one `{ rule, problems }` per
 * rule, in the order the module comment lists them.
 *
 * @param {Object} wf
 * @param {Object} args  `working`, `paths`, `apiKeyEnv`, and optionally `command` and `text`.
 */
export function workflowProblems(wf, { working, paths, apiKeyEnv, command, text }) {
  return [{ rule: 'triggers', problems: triggerProblems(wf, { working, paths }) }, ...sharedRules(wf, { working, apiKeyEnv, command, text })];
}

/**
 * Every rule of the collector, applied: the same rules as the translation
 * workflow's, with the collector's triggers in place of the push.
 *
 * @param {Object} wf
 * @param {Object} args  `working`, `apiKeyEnv`, and optionally `command` and `text`.
 */
export function collectorProblems(wf, { working, apiKeyEnv, command, text }) {
  return [{ rule: 'triggers', problems: collectorTriggerProblems(wf) }, ...sharedRules(wf, { working, apiKeyEnv, command, text })];
}

/** The translation workflow and the collector run in one concurrency group, so they never race for the CI branch. */
export function sharedGroupProblems(translation, collector) {
  const group = (wf) => (isObject(wf) && isObject(wf.concurrency) ? wf.concurrency.group : undefined);
  if (group(translation) === group(collector)) return [];
  return [`the collector's concurrency.group must be the translation workflow's, ${show(group(translation))}; it is ${show(group(collector))}`];
}

// -- The check workflow (local mode) --------------------------------------------

/** The one job of the check workflow. */
export const CHECK_JOB = 'check';

/** The check workflow's permissions, and no other: it reads the repository. */
export const CHECK_PERMISSIONS = Object.freeze({ contents: 'read' });

/** The name of the one step that may read a secret: the install of the project's dependencies. */
export const INSTALL_STEP = 'Install';

/** A step's `run` that invokes the push check. */
export const PREPUSH_COMMAND = /(?:^|[\s;&|])l10n prepush(?:\s|$)/;

/** The pushed commit, as a workflow names it: the default variable or the expression. */
const PUSHED_COMMIT = /(?:"\$GITHUB_SHA"|\$GITHUB_SHA\b|\$\{\{\s*github\.sha\s*\}\})/;

/** A credential a workflow can hand a step: a secret, or the job's token. */
const CREDENTIAL = /\$\{\{[^}]*\b(?:secrets\.|github\.token\b)/;

const checkStepsOf = (wf) =>
  isObject(wf) && isObject(wf.jobs) && isObject(wf.jobs[CHECK_JOB]) && Array.isArray(wf.jobs[CHECK_JOB].steps) ? wf.jobs[CHECK_JOB].steps : [];

/** Whether a value, anywhere inside it, hands a step a credential. */
const holdsCredential = (value) => value !== undefined && CREDENTIAL.test(JSON.stringify(value));

const stepLabel = (step) => show(isObject(step) ? step.name || step.uses || step.run : step);

/**
 * The check workflow's triggers: a push touching exactly `paths`, on any
 * branch, and manual dispatch; no other trigger.
 *
 * @param {Object} wf
 * @param {{paths: string[]}} args
 */
export function checkTriggerProblems(wf, { paths }) {
  const on = isObject(wf) ? wf.on : undefined;
  if (!isObject(on)) return [`on must be a mapping of triggers; it is ${show(on)}`];
  const problems = triggerSetProblems(on, ['push', 'workflow_dispatch']);
  const push = { paths: [...paths] };
  if (!isDeepStrictEqual(on.push, push)) problems.push(`on.push must be ${JSON.stringify(push)}; it is ${show(on.push)}`);
  return problems;
}

/** No `pull_request_target` trigger: it runs a fork's change with the base repository's secrets. */
export function checkPullRequestProblems(wf) {
  const on = isObject(wf) ? wf.on : undefined;
  if (!isObject(on) || !Object.prototype.hasOwnProperty.call(on, 'pull_request_target')) return [];
  return ['on.pull_request_target must be absent: it runs with the base repository’s secrets'];
}

/** `contents: read`, nothing else, and one job, `check`, with no permissions of its own. */
export function checkPermissionProblems(wf) {
  if (!isObject(wf)) return ['the workflow is not a mapping'];
  const problems = [];
  if (!isDeepStrictEqual(wf.permissions, CHECK_PERMISSIONS)) problems.push(`permissions must be ${JSON.stringify(CHECK_PERMISSIONS)}; it is ${show(wf.permissions)}`);
  const jobs = isObject(wf.jobs) ? Object.keys(wf.jobs) : [];
  if (!isDeepStrictEqual(jobs, [CHECK_JOB])) problems.push(`jobs must hold one job, ${CHECK_JOB}; it holds ${jobs.join(', ') || 'none'}`);
  else if (isObject(wf.jobs[CHECK_JOB]) && wf.jobs[CHECK_JOB].permissions !== undefined) problems.push(`jobs.${CHECK_JOB}.permissions must be absent; it is ${show(wf.jobs[CHECK_JOB].permissions)}`);
  return problems;
}

/**
 * The check workflow's steps: the first checks out the pushed commit persisting
 * no credential; every action is pinned by a full commit; exactly one step runs
 * `l10n prepush` on the pushed commit (`$GITHUB_SHA` or `${{ github.sha }}`),
 * after the install step, passing `--config <config>` when `config` is given.
 *
 * @param {Object} wf
 * @param {{config?: string|null}} [args]  the configuration's path, when the push check must be told it.
 */
export function checkStepProblems(wf, { config = null } = {}) {
  const steps = checkStepsOf(wf);
  if (steps.length === 0) return [`jobs.${CHECK_JOB}.steps must hold the job's steps`];
  const problems = [];
  const first = steps[0];
  if (!isObject(first) || typeof first.uses !== 'string' || !/^actions\/checkout@/.test(first.uses)) {
    problems.push(`the first step must be actions/checkout; it is ${show(isObject(first) ? first.uses : first)}`);
  } else if (!isObject(first.with) || first.with['persist-credentials'] !== false || first.with.ref !== undefined) {
    problems.push(`the checkout's with must hold "persist-credentials": false and no ref, so the pushed commit is the one checked out; it is ${show(first.with)}`);
  }
  for (const step of steps) {
    if (isObject(step) && step.uses !== undefined && !(typeof step.uses === 'string' && PINNED.test(step.uses))) problems.push(`${show(step.uses)} must be pinned by a full commit`);
  }
  const checks = steps.map((step, index) => ({ step, index })).filter(({ step }) => isObject(step) && typeof step.run === 'string' && PREPUSH_COMMAND.test(step.run));
  if (checks.length !== 1) return [...problems, `jobs.${CHECK_JOB} must hold exactly one step that runs \`l10n prepush\`; it holds ${checks.length}`];
  const [{ step, index }] = checks;
  if (!PUSHED_COMMIT.test(step.run)) problems.push(`the step that runs \`l10n prepush\` must pass the pushed commit, "$GITHUB_SHA"; its run is ${show(step.run)}`);
  if (config && !step.run.includes(`--config ${config}`)) problems.push(`the step that runs \`l10n prepush\` must pass --config ${config}`);
  const install = steps.findIndex((s) => isObject(s) && s.name === INSTALL_STEP);
  if (install === -1) problems.push(`jobs.${CHECK_JOB} must hold a step named ${INSTALL_STEP}, which installs the project's dependencies`);
  else if (install > index) problems.push(`the ${INSTALL_STEP} step must come before the step that runs \`l10n prepush\``);
  return problems;
}

/**
 * No secret and no job token anywhere in the check workflow but in its one step
 * named `Install`: not at the workflow or job level, not in another step's
 * `env`, `with` or `run`. The install step itself may not run the push check.
 *
 * @param {Object} wf
 */
export function checkSecretProblems(wf) {
  if (!isObject(wf)) return ['the workflow is not a mapping'];
  const problems = [];
  const { jobs, ...rest } = wf;
  if (holdsCredential(rest)) problems.push('no secret and no github.token may appear outside the job, at the workflow level');
  const job = isObject(jobs) && isObject(jobs[CHECK_JOB]) ? jobs[CHECK_JOB] : null;
  if (job) {
    const { steps, ...jobRest } = job;
    if (holdsCredential(jobRest)) problems.push(`no secret and no github.token may appear in jobs.${CHECK_JOB} outside its steps`);
  }
  const installs = checkStepsOf(wf).filter((step) => isObject(step) && step.name === INSTALL_STEP);
  if (installs.length > 1) problems.push(`one step may be named ${INSTALL_STEP}; ${installs.length} are`);
  for (const step of checkStepsOf(wf)) {
    const isInstall = isObject(step) && step.name === INSTALL_STEP;
    if (isInstall && typeof step.run === 'string' && PREPUSH_COMMAND.test(step.run)) problems.push(`the ${INSTALL_STEP} step must not run \`l10n prepush\``);
    if (!isInstall && holdsCredential(step)) problems.push(`the step ${stepLabel(step)} must not read a secret or github.token: only the ${INSTALL_STEP} step may`);
  }
  return problems;
}

/**
 * Every rule of the check workflow, applied: one `{ rule, problems }` per rule,
 * in the order the module comment lists them.
 *
 * @param {Object} wf
 * @param {{paths: string[], config?: string|null}} args
 */
export function checkWorkflowProblems(wf, { paths, config = null }) {
  return [
    { rule: 'triggers', problems: checkTriggerProblems(wf, { paths }) },
    { rule: 'pull requests', problems: checkPullRequestProblems(wf) },
    { rule: 'permissions', problems: checkPermissionProblems(wf) },
    { rule: 'steps', problems: checkStepProblems(wf, { config }) },
    { rule: 'secrets', problems: checkSecretProblems(wf) },
  ];
}

export default {
  WorkflowReadError,
  readWorkflow,
  PINNED,
  CI_COMMAND,
  COLLECTOR_SCHEDULE,
  PERMISSIONS,
  JOB,
  ciStepOf,
  manualOnly,
  checkoutRef,
  triggerProblems,
  collectorTriggerProblems,
  pullRequestProblems,
  permissionProblems,
  concurrencyProblems,
  checkoutProblems,
  secretProblems,
  workflowProblems,
  collectorProblems,
  sharedGroupProblems,
  CHECK_JOB,
  CHECK_PERMISSIONS,
  INSTALL_STEP,
  PREPUSH_COMMAND,
  checkTriggerProblems,
  checkPullRequestProblems,
  checkPermissionProblems,
  checkStepProblems,
  checkSecretProblems,
  checkWorkflowProblems,
};
