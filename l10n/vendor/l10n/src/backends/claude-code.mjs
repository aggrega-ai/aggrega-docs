/**
 * claude-code.mjs — The Claude Code backend: each request translated by Claude
 * Code in headless mode (`claude -p`), on a Claude subscription, with no API key.
 *
 * This is the object INJECTED into the engine (`createEngine({backend})`), with
 * the contract the Anthropic backend has: `translate({ request, lang,
 * sourceLang, glossary })` returns `{ entries, model }`, `{ refusal, model }` or
 * `{ defect, model }`, and validating the entries and writing the memory stay
 * the engine's. The request is the ONE builder's (`requests.mjs`): the same
 * system prompt — the general rules, the glossary, the general prompt and the
 * language's prompt file — and the same user message, the page's context and
 * what the request asks for, that the Messages API receives; the reply is
 * requested in the same output format, through the CLI's `--json-schema`.
 *
 * ONE PROCESS PER REQUEST. The command is run as
 *
 *   claude -p --output-format json --json-schema <schema> --system-prompt <system>
 *          --tools "" --no-session-persistence --safe-mode --model <id> [--effort <level>]
 *
 * with the user message on standard input, in an empty temporary working
 * directory, so no project instruction file, setting or tool reaches the
 * translator and no session is kept. A request whose system prompt and user
 * message together exceed `backend.maxPromptBytes` (default 100 KiB) is split
 * in two by its requested identifiers, each half sent with the same context,
 * and the halves' replies are joined; a request for one identifier is sent as
 * it is. `--safe-mode` can be turned off (`backend.safeMode: false`) for a CLI
 * that predates it.
 *
 * THE CREDENTIAL. The OAuth token `claude setup-token` prints is read from the
 * variable `backend.tokenEnv` names (default `CLAUDE_CODE_OAUTH_TOKEN`), in the
 * environment only, and handed to the child process as `CLAUDE_CODE_OAUTH_TOKEN`
 * in its environment — never in an argument, never in a message. Without it the
 * CLI's own login is used only when the run allows it explicitly: the
 * configuration's `backend.login: "allowed"`, or `L10N_CLAUDE_CODE_LOGIN=1` in
 * the environment of that run; otherwise the first request throws a
 * non-transient error naming the variable, before any process is started. The
 * child's environment carries no `ANTHROPIC_*` variable and no third-party
 * provider switch, so the subscription is the only account a request can use,
 * and an API key in the environment is never spent by the CLI.
 *
 * READS the token variable and the login switch from the environment it is
 * handed, and the prompts it is handed. WRITES nothing but the temporary
 * directory each process runs in, removed when it ends. The process runner is
 * injectable (`run`), so the tests start no process.
 *
 * The Message Batches API has no counterpart here: `submit`, `collect` and `ci`
 * refuse this backend, and the local mode translates through it synchronously
 * (`local.mjs`).
 */

import { spawn as nodeSpawn } from 'node:child_process';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CLAUDE_CODE_DEFAULTS, DEFAULT_CLAUDE_CODE_TOKEN_ENV, DEFAULT_MODEL, translationSettings } from '../config.mjs';
import { OUTPUT_SCHEMA, buildSystem, buildUserMessage, modelIdFor } from '../requests.mjs';

export { DEFAULT_CLAUDE_CODE_TOKEN_ENV, CLAUDE_CODE_DEFAULTS };

/** The variable that allows the CLI's own login for one run, when set to `1`. */
export const CLAUDE_CODE_LOGIN_ENV = 'L10N_CLAUDE_CODE_LOGIN';

/** The largest output read from one process. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** The longest single argument Linux passes to a process (`MAX_ARG_STRLEN`); the system prompt travels as one. */
export const MAX_ARGUMENT_BYTES = 128 * 1024 - 1;

/** The variables the child process never receives: every Anthropic credential, endpoint and header, and the provider switches. */
const WITHHELD = [/^ANTHROPIC_/, /^CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY)$/, /^CLAUDE_CODE_OAUTH_TOKEN$/];

/** No credential for the CLI: not transient, so a run fails at once and starts no process. */
export class MissingClaudeCodeTokenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MissingClaudeCodeTokenError';
    this.transient = false;
  }
}

/**
 * Resolves the backend's settings from a validated `backend` key — the
 * `claude-code` one, or the `anthropic` one when `I18N_BACKEND` selects this
 * backend for a run, whose own keys are then the defaults.
 *
 * @param {Object} [backend]
 * @returns {typeof CLAUDE_CODE_DEFAULTS}
 */
export function claudeCodeSettings(backend = {}) {
  const own = backend && backend.kind === 'claude-code' ? backend : {};
  const out = { ...CLAUDE_CODE_DEFAULTS };
  for (const key of Object.keys(CLAUDE_CODE_DEFAULTS)) if (own[key] !== undefined) out[key] = own[key];
  return out;
}

/**
 * The credential a run uses: `{ token }` from the token variable, `{ login: true }`
 * when the CLI's login is allowed and no token is set, or `{ missing }` naming
 * what is absent.
 *
 * @param {Object} args
 * @param {ReturnType<typeof claudeCodeSettings>} args.settings
 * @param {NodeJS.ProcessEnv} args.env
 */
export function claudeCodeCredential({ settings, env }) {
  const value = env[settings.tokenEnv];
  if (typeof value === 'string' && value.trim() !== '') return { token: value.trim() };
  if (settings.login === 'allowed' || env[CLAUDE_CODE_LOGIN_ENV] === '1') return { login: true };
  return {
    missing:
      `${settings.tokenEnv} is not set: Claude Code cannot be run headless. Create the token with \`claude setup-token\` and supply it ` +
      `in the environment (never committed, never with a VITE_ prefix); or, on a machine where the CLI is logged in, allow its login ` +
      `with ${CLAUDE_CODE_LOGIN_ENV}=1 or backend.login: "allowed".`,
  };
}

/** The environment the child process runs with: the caller's, less every withheld variable, plus the token when there is one. */
export function childEnvironment(env, { token = null, tokenEnv = DEFAULT_CLAUDE_CODE_TOKEN_ENV } = {}) {
  const out = {};
  for (const [name, value] of Object.entries(env || {})) {
    if (WITHHELD.some((re) => re.test(name)) || name === tokenEnv || name === CLAUDE_CODE_LOGIN_ENV) continue;
    out[name] = value;
  }
  if (token) out.CLAUDE_CODE_OAUTH_TOKEN = token;
  return out;
}

/**
 * Runs one process: the default runner, through `node:child_process.spawn`,
 * with the input written to its standard input. Never rejects for a process
 * that ran; resolves `{ code, signal, stdout, stderr, error?, timedOut? }`.
 */
export function runProcess({ command, args, input, env, cwd, timeoutMs }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = nodeSpawn(command, args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ code: null, signal: null, stdout: '', stderr: '', error });
      return;
    }
    const out = [];
    const err = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    const take = (into) => (chunk) => {
      size += chunk.length;
      if (size <= MAX_OUTPUT_BYTES) into.push(chunk);
    };
    child.stdout.on('data', take(out));
    child.stderr.on('data', take(err));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, stdout: '', stderr: Buffer.concat(err).toString('utf8'), error });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), timedOut });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/** An error of one process run, transient or not. */
function runError(message, transient) {
  const err = new Error(message);
  err.transient = transient;
  return err;
}

/** The last line of a process's error output, for a message; never the whole stream. */
const lastLine = (text) => (String(text || '').trim().split('\n').pop() || '').slice(0, 300);

/**
 * Reads the CLI's JSON result into the reply the engine accepts: `{ entries }`,
 * `{ refusal }` or `{ defect }`, with the model the result names. Throws for a
 * result that reports an error, transient when the API's status says so.
 *
 * @param {{code:number|null, signal?:string|null, stdout:string, stderr:string, error?:Error, timedOut?:boolean}} ran
 * @param {string} fallbackModel  the model named when the result names none.
 */
export function readClaudeCodeResult(ran, fallbackModel) {
  if (ran.error) {
    if (ran.error.code === 'ENOENT') {
      throw runError(`the Claude Code command was not found (${ran.error.path || 'claude'}): install Claude Code, or name it in backend.command.`, false);
    }
    throw runError(`Claude Code could not be started (${ran.error.code || ran.error.message}).`, false);
  }
  if (ran.timedOut) throw runError('Claude Code did not answer within backend.timeoutSeconds; the request is retried.', true);
  const text = String(ran.stdout || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let envelope = null;
  if (start !== -1 && end > start) {
    try {
      envelope = JSON.parse(text.slice(start, end + 1));
    } catch {
      envelope = null;
    }
  }
  if (!envelope || typeof envelope !== 'object') {
    const why = ran.code !== 0 ? `it exited ${ran.signal ? `on ${ran.signal}` : ran.code}${lastLine(ran.stderr) ? `: ${lastLine(ran.stderr)}` : ''}` : 'its output is not the JSON result';
    throw runError(`Claude Code returned no result: ${why}.`, ran.signal !== null && ran.signal !== undefined);
  }
  const model = (envelope.modelUsage && typeof envelope.modelUsage === 'object' && Object.keys(envelope.modelUsage)[0]) || fallbackModel;
  if (envelope.is_error === true) {
    const status = Number(envelope.api_error_status);
    const detail = typeof envelope.result === 'string' && envelope.result ? envelope.result : envelope.subtype || 'an error';
    const transient = status === 429 || status >= 500 || /overloaded/i.test(detail);
    throw runError(`Claude Code reported ${String(detail).slice(0, 300)}${status ? ` (status ${status})` : ''}.`, transient);
  }
  if (envelope.stop_reason === 'refusal') return { refusal: { category: null }, model };
  const structured = envelope.structured_output;
  let parsed = structured && typeof structured === 'object' ? structured : null;
  if (!parsed && typeof envelope.result === 'string' && envelope.result.trim()) {
    const body = envelope.result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      return { defect: `the reply is not valid JSON (${(err && err.message) || err})`, model };
    }
  }
  if (!parsed) return { defect: 'the reply carried no text', model };
  const list = Array.isArray(parsed.translations) ? parsed.translations : null;
  if (!list || !list.every((e) => e && typeof e.id === 'string' && typeof e.text === 'string')) {
    return { defect: 'the reply is not { "translations": [{ "id": string, "text": string }] }', model };
  }
  return { entries: list.map((e) => ({ id: e.id, text: e.text })), model };
}

/** The system prompt as one text: the request builder's blocks, in order, without their cache markers. */
export function systemText(system) {
  return system.map((block) => block.text).join('\n\n');
}

/** The user message as one text: the request builder's two JSON parts, in order. */
export function userText(spec) {
  return buildUserMessage(spec)
    .map((block) => block.text)
    .join('\n\n');
}

/** A request narrowed to some of its requested identifiers, with the same context. */
export function narrowRequest(spec, ids) {
  const keep = new Set(ids);
  const pick = (map) => Object.fromEntries(Object.entries(map || {}).filter(([id]) => keep.has(id)));
  return {
    ...spec,
    requested: spec.requested.filter((id) => keep.has(id)),
    items: spec.items.filter((item) => keep.has(item.srcHash)),
    keep: pick(spec.keep),
    corrections: pick(spec.corrections),
  };
}

/**
 * Creates the backend.
 *
 * @param {Object} [opts]
 * @param {Object} [opts.backendConfig]  the validated `backend` key.
 * @param {Object.<string,string>} [opts.prompts]  locale → the per-language prompt text.
 * @param {string|null} [opts.generalPrompt]  the project general prompt's text, or null without one.
 * @param {NodeJS.ProcessEnv} [opts.env]  the environment the token and the login switch are read from (default `process.env`).
 * @param {typeof runProcess} [opts.run]  the process runner (a test seam).
 * @param {typeof nodeFs} [opts.fsImpl]   where the temporary working directories are made (a test seam).
 * @returns {{translate: Function, settings: ReturnType<typeof claudeCodeSettings>}}
 */
export function createClaudeCodeBackend({ backendConfig = {}, prompts = {}, generalPrompt = null, env, run = runProcess, fsImpl = nodeFs } = {}) {
  const settings = claudeCodeSettings(backendConfig);
  const environment = () => env || process.env;

  async function once({ spec, system, model }) {
    const credential = claudeCodeCredential({ settings, env: environment() });
    if (credential.missing) throw new MissingClaudeCodeTokenError(credential.missing);
    const args = [
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(OUTPUT_SCHEMA),
      '--system-prompt',
      system,
      '--tools',
      '',
      '--no-session-persistence',
      ...(settings.safeMode ? ['--safe-mode'] : []),
      '--model',
      modelIdFor(spec, model),
      ...(model.effort ? ['--effort', model.effort] : []),
    ];
    const cwd = fsImpl.mkdtempSync(path.join(os.tmpdir(), 'l10n-claude-code-'));
    try {
      const ran = await run({
        command: settings.command,
        args,
        input: userText(spec),
        env: childEnvironment(environment(), { token: credential.token || null, tokenEnv: settings.tokenEnv }),
        cwd,
        timeoutMs: settings.timeoutSeconds * 1000,
      });
      return readClaudeCodeResult(ran, modelIdFor(spec, model));
    } finally {
      fsImpl.rmSync(cwd, { recursive: true, force: true });
    }
  }

  /** Sends a request, split in halves while it is above the size and asks for more than one identifier. */
  async function send({ spec, system, model }) {
    const bytes = Buffer.byteLength(system, 'utf8') + Buffer.byteLength(userText(spec), 'utf8');
    if (bytes <= settings.maxPromptBytes || spec.requested.length < 2) return once({ spec, system, model });
    const mid = Math.ceil(spec.requested.length / 2);
    const halves = [spec.requested.slice(0, mid), spec.requested.slice(mid)];
    const replies = [];
    for (const ids of halves) replies.push(await send({ spec: narrowRequest(spec, ids), system, model }));
    const answered = replies.filter((r) => Array.isArray(r.entries));
    if (answered.length === 0) return replies.find((r) => r.refusal) || replies[0];
    // A half that was refused or defective returns none of its identifiers, so the engine resubmits them.
    return { entries: answered.flatMap((r) => r.entries), model: answered[0].model };
  }

  /**
   * translate — sends one request through the CLI and reads its reply.
   *
   * @param {Object} args
   * @param {import('../types.mjs').RequestSpec} args.request  the planned request.
   * @param {string} args.lang
   * @param {string} args.sourceLang
   * @param {Object} [args.glossary]
   */
  async function translate({ request, lang, sourceLang, glossary = {} }) {
    const { model } = translationSettings(backendConfig, glossary);
    const system = systemText(buildSystem({ lang, sourceLang, glossary, generalPrompt, languagePrompt: prompts[lang] }));
    if (Buffer.byteLength(system, 'utf8') > MAX_ARGUMENT_BYTES) {
      throw runError(`the system prompt for "${lang}" is ${Buffer.byteLength(system, 'utf8')} bytes, above the ${MAX_ARGUMENT_BYTES} one process argument holds: shorten the prompt files or the glossary.`, false);
    }
    return send({ spec: request, system, model });
  }

  return { translate, settings };
}

export { DEFAULT_MODEL };

export default {
  createClaudeCodeBackend,
  claudeCodeSettings,
  claudeCodeCredential,
  childEnvironment,
  readClaudeCodeResult,
  narrowRequest,
  systemText,
  userText,
  runProcess,
  CLAUDE_CODE_DEFAULTS,
  DEFAULT_CLAUDE_CODE_TOKEN_ENV,
  CLAUDE_CODE_LOGIN_ENV,
  MAX_ARGUMENT_BYTES,
  MissingClaudeCodeTokenError,
};
