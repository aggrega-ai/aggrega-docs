import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runCli } from './cli.mjs';
import { createAnthropicClient, readApiKey, MissingApiKeyError } from './client.mjs';
import { capture, copyFixtureProject, fakeAnthropic, requestBody } from '../test/helpers.mjs';

const SENTINEL = 'sk-ant-SENTINEL-0123456789abcdef';

let project;
beforeEach(() => {
  project = copyFixtureProject();
});
afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

async function run(argv, deps) {
  const io = capture();
  const code = await runCli(argv, { cwd: project, log: io.log, errlog: io.errlog, ...deps });
  return { code, out: io.text(), err: io.errors() };
}

/** Every file under `dir`, as text. */
function filesUnder(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .map((rel) => path.join(dir, rel))
    .filter((abs) => fs.statSync(abs).isFile())
    .map((abs) => ({ file: abs, text: fs.readFileSync(abs, 'utf8') }));
}

/** The places among `outputs` that hold the sentinel key. */
const holding = (outputs) => outputs.filter((o) => o.text.includes(SENTINEL)).map((o) => o.file);

describe('the key never appears in a log line, an error message or the pending file', () => {
  it('scans every output of extract, submit, collect, status and translate for a sentinel key', async () => {
    const env = { ANTHROPIC_API_KEY: SENTINEL };
    const outputs = [];
    const record = (name, r) => outputs.push({ file: `${name}: stdout`, text: r.out }, { file: `${name}: stderr`, text: r.err });

    // One request errors and one is refused, so error and refusal paths are scanned too.
    const result = (params) =>
      requestBody(params).page === 'ui/it.json'
        ? { type: 'errored', error: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }
        : { type: 'succeeded', message: { stop_reason: 'refusal', stop_details: { category: null }, content: [] } };
    const fake = fakeAnthropic({ result });
    record('extract', await run(['extract'], { env }));
    record('submit', await run(['submit'], { env, ClientClass: fake.FakeAnthropic }));
    record('status', await run(['status'], { env }));
    record('collect', await run(['collect'], { env, ClientClass: fake.FakeAnthropic }));
    record('submit --dry-run', await run(['submit', '--dry-run'], { env, ClientClass: fake.FakeAnthropic }));
    const failing = fakeAnthropic({ reply: () => { throw Object.assign(new Error('Request failed with status 401'), { status: 401 }); } });
    record('translate', await run(['translate'], { env, ClientClass: failing.FakeAnthropic }));

    outputs.push(...filesUnder(path.join(project, 'memory')));
    expect(outputs.some((o) => o.file.endsWith('pending.json'))).toBe(true);
    expect(outputs.some((o) => o.file.includes(`${path.sep}jobs${path.sep}`))).toBe(true);
    expect(holding(outputs)).toEqual([]);

    // The needle: the scan finds the key where it legitimately is, in what the client was handed.
    expect(holding([{ file: 'constructor options', text: JSON.stringify(fake.constructed) }])).toEqual(['constructor options']);
  });
});

describe('only the configured variable’s value is ever a credential (ruling 4)', () => {
  const saved = {};
  const POISON = {
    ANTHROPIC_AUTH_TOKEN: 'auth-token-from-the-environment',
    ANTHROPIC_CUSTOM_HEADERS: 'Authorization: Bearer from-custom-headers\nX-Api-Key: from-custom-headers',
    ANTHROPIC_BASE_URL: 'https://elsewhere.example',
    ANTHROPIC_API_KEY: 'api-key-from-the-process-environment',
  };
  beforeEach(() => {
    for (const [k, v] of Object.entries(POISON)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });
  afterEach(() => {
    for (const k of Object.keys(POISON)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('with ANTHROPIC_AUTH_TOKEN set and the configured variable unset, submit refuses before any client exists', async () => {
    expect((await run(['extract'], { env: {} })).code).toBe(0);
    const fake = fakeAnthropic();
    const r = await run(['submit'], { env: { ANTHROPIC_AUTH_TOKEN: 'other-credential' }, ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(1);
    expect(r.err).toContain('submit: ANTHROPIC_API_KEY is not set: the translation API cannot be called.');
    expect(fake.constructed).toHaveLength(0);
    expect(fs.existsSync(path.join(project, 'memory', 'pending.json'))).toBe(false);
  });

  it('with ANTHROPIC_AUTH_TOKEN set and the configured variable unset, translate and collect refuse before any client exists', async () => {
    expect((await run(['extract'], { env: {} })).code).toBe(0);
    const fake = fakeAnthropic();
    const env = { ANTHROPIC_AUTH_TOKEN: 'other-credential' };
    const t = await run(['translate'], { env, ClientClass: fake.FakeAnthropic });
    expect(t.code).toBe(1);
    expect(t.out).toContain('result=failed');
    fs.writeFileSync(path.join(project, 'memory', 'pending.json'), JSON.stringify({ batches: [{ id: 'msgbatch_x', createdAt: 't', requests: {} }], queue: {} }));
    const c = await run(['collect'], { env, ClientClass: fake.FakeAnthropic });
    expect(c.code).toBe(1);
    expect(c.err).toContain('collect: ANTHROPIC_API_KEY is not set');
    expect(fake.constructed).toHaveLength(0);
  });

  it('the real SDK client the factory builds sends only the configured value, to the Anthropic API, whatever the environment says', async () => {
    const sent = [];
    const fetch = async (url, init) => {
      sent.push({ url: String(url), headers: new Headers(init.headers) });
      return new Response(JSON.stringify({ type: 'message', role: 'assistant', content: [], stop_reason: 'end_turn', model: 'm', usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = createAnthropicClient({ apiKeyEnv: 'SITE_KEY', env: { SITE_KEY: SENTINEL }, fetch, maxRetries: 0 });
    expect(client.apiKey).toBe(SENTINEL);
    expect(client.authToken).toBeNull();
    await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 16, messages: [{ role: 'user', content: 'x' }] });
    expect(sent).toHaveLength(1);
    expect(new URL(sent[0].url).origin).toBe('https://api.anthropic.com');
    expect(sent[0].headers.get('x-api-key')).toBe(SENTINEL);
    expect(sent[0].headers.has('authorization')).toBe(false);
  });

  it('refuses a VITE_ name, and names a missing variable, before any client exists', () => {
    const fake = fakeAnthropic();
    expect(() => createAnthropicClient({ apiKeyEnv: 'VITE_KEY', env: { VITE_KEY: 'x' }, ClientClass: fake.FakeAnthropic })).toThrow(/begins with VITE_/);
    expect(() => createAnthropicClient({ apiKeyEnv: 'SITE_KEY', env: {}, ClientClass: fake.FakeAnthropic })).toThrow(MissingApiKeyError);
    expect(() => readApiKey({ apiKeyEnv: 'SITE_KEY', env: { SITE_KEY: '   ' } })).toThrow('SITE_KEY is not set');
    expect(fake.constructed).toHaveLength(0);
  });
});
