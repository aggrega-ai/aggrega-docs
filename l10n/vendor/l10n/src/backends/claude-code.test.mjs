import '../../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  CLAUDE_CODE_LOGIN_ENV,
  MAX_ARGUMENT_BYTES,
  MissingClaudeCodeTokenError,
  childEnvironment,
  createClaudeCodeBackend,
  narrowRequest,
  readClaudeCodeResult,
  systemText,
  userText,
} from './claude-code.mjs';
import { OUTPUT_SCHEMA, buildSystem } from '../requests.mjs';
import { isTransient } from '../translator-prompt.mjs';
import { parseConfig } from '../config.mjs';
import { runCli } from '../cli.mjs';
import { createStore } from '../store.mjs';
import { keyOf } from '../normalize.mjs';
import { LAYER } from '../types.mjs';
import { capture, copyFixtureProject, fixtureConfig, writeJson } from '../../test/helpers.mjs';

/** The CLI's JSON result for a successful structured reply. */
const envelope = (translations, extra = {}) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify({ translations }),
    stop_reason: 'tool_use',
    modelUsage: { 'claude-opus-5-5': { inputTokens: 10, outputTokens: 5 } },
    structured_output: { translations },
    ...extra,
  });

/**
 * A fake process runner that answers like the CLI: it reads the request from
 * standard input and returns each requested segment's source, prefixed. It
 * records every call; it starts no process.
 */
function fakeRun({ answer, prefix = 'T:' } = {}) {
  const calls = [];
  const run = async (call) => {
    calls.push({ ...call, cwdExisted: fs.existsSync(call.cwd) });
    if (answer) return answer(call, calls.length);
    const [context, request] = call.input.split('\n\n').map((part) => JSON.parse(part));
    const byId = new Map(context.segments.map((s) => [s.id, s.source]));
    const translations = request.translate.map((id) => ({ id, text: `${prefix}${byId.get(id)}` }));
    return { code: 0, signal: null, stdout: envelope(translations), stderr: '' };
  };
  return { run, calls };
}

/** A planned request for `sources`, one page, one section. */
function requestFor(sources, extra = {}) {
  const segments = sources.map((source) => ({ id: keyOf(source), format: 'text', source }));
  return {
    page: 'content/it/home.json',
    section: null,
    lang: 'en',
    segments,
    requested: segments.map((s) => s.id),
    keep: {},
    items: sources.map((source) => ({ srcHash: keyOf(source), source, format: 'text' })),
    attempt: 1,
    fallback: false,
    corrections: {},
    ...extra,
  };
}

const PROMPTS = { en: 'Write in British English.\n' };
const translateWith = (backend, request = requestFor(['Ciao'])) => backend.translate({ request, lang: 'en', sourceLang: 'it', glossary: {} });

describe('the claude-code backend — one headless process per request', () => {
  it('runs claude -p with the output schema, the system prompt as an argument and the request on standard input', async () => {
    const { run, calls } = fakeRun();
    const backend = createClaudeCodeBackend({ backendConfig: { kind: 'claude-code' }, prompts: PROMPTS, env: { CLAUDE_CODE_OAUTH_TOKEN: 'tok' }, run });
    const request = requestFor(['Ciao']);
    const reply = await translateWith(backend, request);
    expect(reply).toEqual({ entries: [{ id: keyOf('Ciao'), text: 'T:Ciao' }], model: 'claude-opus-5-5' });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.command).toBe('claude');
    const system = systemText(buildSystem({ lang: 'en', sourceLang: 'it', glossary: {}, generalPrompt: null, languagePrompt: PROMPTS.en }));
    expect(call.args).toEqual([
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
      '--safe-mode',
      '--model',
      'claude-opus-5-5',
    ]);
    expect(call.input).toBe(userText(request));
    expect(call.timeoutMs).toBe(600_000);
    // An empty temporary directory, removed afterwards.
    expect(call.cwdExisted).toBe(true);
    expect(fs.existsSync(call.cwd)).toBe(false);
  });

  it('passes the model id or alias, its effort and the fallback model of a refused request, and a configured command', async () => {
    const { run, calls } = fakeRun();
    const backend = createClaudeCodeBackend({
      backendConfig: { kind: 'claude-code', command: '/opt/claude/bin/claude', model: { id: 'opus', effort: 'low', fallbackId: 'sonnet' }, safeMode: false, timeoutSeconds: 30 },
      prompts: PROMPTS,
      env: { CLAUDE_CODE_OAUTH_TOKEN: 'tok' },
      run,
    });
    await translateWith(backend);
    await translateWith(backend, requestFor(['Ciao'], { fallback: true, attempt: 2 }));
    expect(calls[0].command).toBe('/opt/claude/bin/claude');
    expect(calls[0].args.slice(-4)).toEqual(['--model', 'opus', '--effort', 'low']);
    expect(calls[0].args).not.toContain('--safe-mode');
    expect(calls[1].args.slice(-4)).toEqual(['--model', 'sonnet', '--effort', 'low']);
    expect(calls[0].timeoutMs).toBe(30_000);
  });

  it('the glossary’s model replaces the id', async () => {
    const { run, calls } = fakeRun();
    const backend = createClaudeCodeBackend({ backendConfig: { kind: 'claude-code', model: 'opus' }, prompts: PROMPTS, env: { CLAUDE_CODE_OAUTH_TOKEN: 'tok' }, run });
    await backend.translate({ request: requestFor(['Ciao']), lang: 'en', sourceLang: 'it', glossary: { model: 'haiku' } });
    expect(calls[0].args.slice(-2)).toEqual(['--model', 'haiku']);
  });
});

describe('the claude-code backend — the credential', () => {
  it('hands the token to the child in its environment alone, and withholds every Anthropic variable', async () => {
    const { run, calls } = fakeRun();
    const env = { PATH: '/usr/bin', HOME: '/home/dev', CLAUDE_CODE_OAUTH_TOKEN: 'tok-123', ANTHROPIC_API_KEY: 'sk-ant', ANTHROPIC_BASE_URL: 'https://evil', CLAUDE_CODE_USE_BEDROCK: '1' };
    await translateWith(createClaudeCodeBackend({ backendConfig: { kind: 'claude-code' }, prompts: PROMPTS, env, run }));
    expect(calls[0].env).toEqual({ PATH: '/usr/bin', HOME: '/home/dev', CLAUDE_CODE_OAUTH_TOKEN: 'tok-123' });
    expect(calls[0].args.join(' ')).not.toContain('tok-123');
  });

  it('reads the token from the configured variable and passes it under the CLI’s own name', async () => {
    const { run, calls } = fakeRun();
    const env = { L10N_CLAUDE_TOKEN: 'tok-abc', CLAUDE_CODE_OAUTH_TOKEN: 'another' };
    await translateWith(createClaudeCodeBackend({ backendConfig: { kind: 'claude-code', tokenEnv: 'L10N_CLAUDE_TOKEN' }, prompts: PROMPTS, env, run }));
    expect(calls[0].env).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: 'tok-abc' });
  });

  it('without a token, refuses before any process starts, naming the variable, unless the login is allowed', async () => {
    const { run, calls } = fakeRun();
    const backend = createClaudeCodeBackend({ backendConfig: { kind: 'claude-code' }, prompts: PROMPTS, env: { ANTHROPIC_API_KEY: 'sk-ant' }, run });
    const err = await translateWith(backend).catch((e) => e);
    expect(err).toBeInstanceOf(MissingClaudeCodeTokenError);
    expect(err.message).toContain('CLAUDE_CODE_OAUTH_TOKEN is not set');
    expect(isTransient(err)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('uses the CLI’s login when the configuration or the run allows it, with no token in the child’s environment', async () => {
    for (const [backendConfig, env] of [
      [{ kind: 'claude-code', login: 'allowed' }, { HOME: '/h' }],
      [{ kind: 'claude-code' }, { HOME: '/h', [CLAUDE_CODE_LOGIN_ENV]: '1' }],
    ]) {
      const { run, calls } = fakeRun();
      await translateWith(createClaudeCodeBackend({ backendConfig, prompts: PROMPTS, env, run }));
      expect(calls[0].env).toEqual({ HOME: '/h' });
    }
  });

  it('childEnvironment drops the login switch and an unset token', () => {
    expect(childEnvironment({ A: '1', [CLAUDE_CODE_LOGIN_ENV]: '1', ANTHROPIC_AUTH_TOKEN: 'x' })).toEqual({ A: '1' });
  });
});

describe('the claude-code backend — reading the result', () => {
  const ok = (stdout, extra = {}) => ({ code: 0, signal: null, stdout, stderr: '', ...extra });

  it('reads the structured output, else the result text, a fenced one included', () => {
    expect(readClaudeCodeResult(ok(envelope([{ id: 'a', text: 'A' }])), 'm')).toEqual({ entries: [{ id: 'a', text: 'A' }], model: 'claude-opus-5-5' });
    const text = JSON.stringify({ type: 'result', is_error: false, result: '```json\n{"translations":[{"id":"a","text":"A"}]}\n```' });
    expect(readClaudeCodeResult(ok(text), 'opus')).toEqual({ entries: [{ id: 'a', text: 'A' }], model: 'opus' });
  });

  it('states a defect for a reply of another shape, or none, so the engine resubmits it', () => {
    const wrong = JSON.stringify({ is_error: false, structured_output: { translations: [{ id: 'a' }] } });
    expect(readClaudeCodeResult(ok(wrong), 'm').defect).toBe('the reply is not { "translations": [{ "id": string, "text": string }] }');
    expect(readClaudeCodeResult(ok(JSON.stringify({ is_error: false, result: 'not json' })), 'm').defect).toMatch(/^the reply is not valid JSON/);
    expect(readClaudeCodeResult(ok(JSON.stringify({ is_error: false, result: '' })), 'm').defect).toBe('the reply carried no text');
  });

  it('reads a refusal', () => {
    expect(readClaudeCodeResult(ok(JSON.stringify({ is_error: false, stop_reason: 'refusal', result: '' })), 'm')).toEqual({ refusal: { category: null }, model: 'm' });
  });

  it('throws on an error result, transient for a rate limit, an overload or a server error, permanent otherwise', () => {
    const failed = (extra) => () => readClaudeCodeResult(ok(JSON.stringify({ is_error: true, subtype: 'error_during_execution', ...extra })), 'm');
    for (const extra of [{ api_error_status: 429, result: 'rate limited' }, { api_error_status: 529, result: 'Overloaded' }, { result: 'API Error: overloaded_error' }]) {
      let err;
      try {
        failed(extra)();
      } catch (e) {
        err = e;
      }
      expect(isTransient(err)).toBe(true);
    }
    let err;
    try {
      failed({ api_error_status: 401, result: 'Invalid bearer token' })();
    } catch (e) {
      err = e;
    }
    expect(err.message).toBe('Claude Code reported Invalid bearer token (status 401).');
    expect(isTransient(err)).toBe(false);
  });

  it('throws a permanent error for a missing command, a transient one for a timeout, and names the exit of an output that is no result', () => {
    const notFound = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT', path: 'claude' });
    expect(() => readClaudeCodeResult({ code: null, stdout: '', stderr: '', error: notFound }, 'm')).toThrow(/command was not found \(claude\)/);
    let timeout;
    try {
      readClaudeCodeResult({ code: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true }, 'm');
    } catch (e) {
      timeout = e;
    }
    expect(isTransient(timeout)).toBe(true);
    expect(() => readClaudeCodeResult({ code: 1, signal: null, stdout: 'Error: not logged in', stderr: 'Please run /login\n' }, 'm')).toThrow(
      'Claude Code returned no result: it exited 1: Please run /login.'
    );
  });
});

describe('the claude-code backend — the prompt size', () => {
  it('splits a request above maxPromptBytes in halves by its identifiers, with the same context, and joins the replies', async () => {
    const sources = ['Uno', 'Due', 'Tre', 'Quattro'];
    const request = requestFor(sources, { corrections: { [keyOf('Tre')]: 'fix it' } });
    const { run, calls } = fakeRun();
    const bytes = Buffer.byteLength(systemText(buildSystem({ lang: 'en', sourceLang: 'it', glossary: {}, languagePrompt: PROMPTS.en })), 'utf8');
    const backend = createClaudeCodeBackend({
      // Room for either half, and not for the whole request.
      backendConfig: {
        kind: 'claude-code',
        maxPromptBytes:
          bytes +
          Math.max(
            Buffer.byteLength(userText(narrowRequest(request, [keyOf('Uno'), keyOf('Due')])), 'utf8'),
            Buffer.byteLength(userText(narrowRequest(request, [keyOf('Tre'), keyOf('Quattro')])), 'utf8')
          ),
      },
      prompts: PROMPTS,
      env: { CLAUDE_CODE_OAUTH_TOKEN: 't' },
      run,
    });
    const reply = await translateWith(backend, request);
    expect(calls).toHaveLength(2);
    const asked = calls.map((c) => JSON.parse(c.input.split('\n\n')[1]));
    expect(asked[0].translate).toEqual([keyOf('Uno'), keyOf('Due')]);
    expect(asked[1]).toEqual({ translate: [keyOf('Tre'), keyOf('Quattro')], corrections: { [keyOf('Tre')]: 'fix it' } });
    expect(calls[0].input.split('\n\n')[0]).toBe(calls[1].input.split('\n\n')[0]);
    expect(reply.entries.map((e) => e.text)).toEqual(['T:Uno', 'T:Due', 'T:Tre', 'T:Quattro']);
  });

  it('sends a request for one identifier as it is, whatever its size, and leaves a refused half’s identifiers out', async () => {
    const one = fakeRun();
    await translateWith(createClaudeCodeBackend({ backendConfig: { kind: 'claude-code', maxPromptBytes: 1 }, prompts: PROMPTS, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, run: one.run }));
    expect(one.calls).toHaveLength(1);
    const refusing = fakeRun({
      answer: (call, n) =>
        n === 1
          ? { code: 0, signal: null, stdout: JSON.stringify({ is_error: false, stop_reason: 'refusal' }), stderr: '' }
          : { code: 0, signal: null, stdout: envelope([{ id: keyOf('Due'), text: 'Two' }]), stderr: '' },
    });
    const backend = createClaudeCodeBackend({ backendConfig: { kind: 'claude-code', maxPromptBytes: 1 }, prompts: PROMPTS, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, run: refusing.run });
    expect(await translateWith(backend, requestFor(['Uno', 'Due']))).toEqual({ entries: [{ id: keyOf('Due'), text: 'Two' }], model: 'claude-opus-5-5' });
  });

  it('refuses a system prompt longer than one process argument holds', async () => {
    const { run, calls } = fakeRun();
    const backend = createClaudeCodeBackend({ backendConfig: { kind: 'claude-code' }, prompts: { en: 'x'.repeat(MAX_ARGUMENT_BYTES) }, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, run });
    await expect(translateWith(backend)).rejects.toThrow(/above the \d+ one process argument holds/);
    expect(calls).toHaveLength(0);
  });
});

describe('the claude-code backend — in the configuration', () => {
  const withBackend = (backend, extra = {}) => ({ ...fixtureConfig(), backend, ...extra });

  it('validates its keys and refuses a thinking setting, a VITE_ token variable and an unknown key', () => {
    expect(() => parseConfig(withBackend({ kind: 'claude-code', model: 'opus', login: 'allowed', concurrency: 2 }))).not.toThrow();
    expect(() => parseConfig(withBackend({ kind: 'claude-code', model: { id: 'opus', thinking: { type: 'disabled' } } }))).toThrow(/backend\.model/);
    expect(() => parseConfig(withBackend({ kind: 'claude-code', tokenEnv: 'VITE_CLAUDE_TOKEN' }))).toThrow(/begins with VITE_/);
    expect(() => parseConfig(withBackend({ kind: 'claude-code', apiKeyEnv: 'ANTHROPIC_API_KEY' }))).toThrow(/backend\.apiKeyEnv: unknown key/);
  });

  it('refuses it with a ci key: l10n ci has no transport for it', () => {
    expect(() => parseConfig(withBackend({ kind: 'claude-code' }, { ci: { branch: 'l10n' } }))).toThrow(/ci: `l10n ci` translates through the Message Batches API/);
  });
});

// -- Through the command line --------------------------------------------------

let dir;

beforeEach(() => {
  dir = copyFixtureProject('l10n-claude-code-');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function editConfig(mutate) {
  const file = path.join(dir, 'l10n.config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(config);
  writeJson(file, config);
}

async function run(argv, deps = {}) {
  const io = capture();
  const code = await runCli(argv, { cwd: dir, env: {}, log: io.log, errlog: io.errlog, ...deps });
  return { code, out: io.text(), err: io.errors() };
}

describe('the claude-code backend — the commands', () => {
  beforeEach(() => editConfig((c) => (c.backend = { kind: 'claude-code', model: 'opus' })));

  it('translate writes the machine layer through the CLI, one process at a time by default', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeRun();
    const res = await run(['translate'], { env: { CLAUDE_CODE_OAUTH_TOKEN: 't' }, runProcess: fake.run });
    expect(res.code).toBe(0);
    expect(fake.calls.length).toBe(2); // the content page and the UI dictionary
    const machine = createStore({ baseDir: path.join(dir, 'memory') }).readLayer(LAYER.MACHINE, 'en');
    expect(machine[keyOf('Scopri')].text).toBe('T:Scopri');
    expect(machine[keyOf('Scopri')].status).toBe('machine');
  });

  it('pipeline stops before any process when the token is missing, naming its variable', async () => {
    const fake = fakeRun();
    const res = await run(['pipeline'], { runProcess: fake.run });
    expect(res.code).toBe(1);
    expect(res.err).toContain('CLAUDE_CODE_OAUTH_TOKEN is not set');
    expect(fake.calls).toHaveLength(0);
  });

  it('pipeline translates and generates with the login allowed for the run', async () => {
    const fake = fakeRun();
    const res = await run(['pipeline'], { env: { [CLAUDE_CODE_LOGIN_ENV]: '1' }, runProcess: fake.run });
    expect(res.code).toBe(0);
    expect(fs.existsSync(path.join(dir, 'memory/generated/content/en/home.json'))).toBe(true);
  });

  for (const cmd of ['submit', 'collect', 'ci']) {
    it(`${cmd} refuses the backend, naming the batch transport it lacks, and reads nothing`, async () => {
      const res = await run([cmd], { env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
      expect(res.code).toBe(2);
      expect(res.err).toContain(`${cmd}: the claude-code backend has no batch transport`);
    });
  }

  it('I18N_BACKEND=claude-code selects it for one run under an anthropic configuration', async () => {
    editConfig((c) => (c.backend = { kind: 'anthropic', model: 'claude-sonnet-5-5', apiKeyEnv: 'ANTHROPIC_API_KEY' }));
    await run(['extract']);
    const fake = fakeRun();
    const res = await run(['translate'], { env: { I18N_BACKEND: 'claude-code', CLAUDE_CODE_OAUTH_TOKEN: 't', ANTHROPIC_API_KEY: 'sk' }, runProcess: fake.run });
    expect(res.code).toBe(0);
    expect(fake.calls[0].args.slice(-2)).toEqual(['--model', 'claude-sonnet-5-5']);
    expect(fake.calls[0].env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('doctor checks the token variable in place of the API key', async () => {
    const res = await run(['doctor']);
    expect(res.out).toContain('API key variable: CLAUDE_CODE_OAUTH_TOKEN (the default), read from the environment for the claude-code backend');
  });
});

describe('the claude-code backend — the local mode, on the developer’s subscription', () => {
  beforeEach(() =>
    editConfig((c) => {
      c.mode = 'local';
      c.backend = { kind: 'claude-code', login: 'allowed' };
      c.local = { commands: ['echo regenerated'], paths: ['memory/machine/'] };
    })
  );

  it('translates synchronously with no API key and no batch, runs the derived commands and prints what to commit', async () => {
    const fake = fakeRun();
    const ran = [];
    const res = await run(['local'], { env: { HOME: '/h' }, runProcess: fake.run, runCommand: (command) => (ran.push(command), { status: 0 }) });
    expect(res.code).toBe(0);
    expect(res.out).toContain('local: translating through the claude-code backend, one request per page.');
    expect(res.out).toContain('git add -- memory/machine/');
    expect(ran).toEqual(['echo regenerated']);
    expect(fake.calls.length).toBe(2);
    expect(fs.existsSync(path.join(dir, 'memory/pending.json'))).toBe(false);
    const again = await run(['local'], { env: { HOME: '/h' }, runProcess: fake.run, runCommand: () => ({ status: 0 }) });
    expect(again.out).toContain('local: no translation needed: no request made.');
    expect(fake.calls.length).toBe(2);
  });

  it('refuses while the pending file records a batch it cannot collect', async () => {
    writeJson(path.join(dir, 'memory/pending.json'), { batches: [{ id: 'msgbatch_1', requests: {} }], queue: {} });
    const fake = fakeRun();
    const res = await run(['local'], { env: { HOME: '/h' }, runProcess: fake.run, runCommand: () => ({ status: 0 }) });
    expect(res.code).toBe(1);
    expect(res.err).toContain('pending.json records a batch, which the claude-code backend cannot collect');
    expect(fake.calls).toHaveLength(0);
  });

  it('exits 1 naming the token when neither it nor the login is available', async () => {
    editConfig((c) => (c.backend = { kind: 'claude-code' }));
    const fake = fakeRun();
    const res = await run(['local'], { env: {}, runProcess: fake.run, runCommand: () => ({ status: 0 }) });
    expect(res.code).toBe(1);
    expect(fake.calls).toHaveLength(0);
  });
});
