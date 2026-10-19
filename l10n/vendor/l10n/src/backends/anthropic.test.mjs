import '../../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APIConnectionError } from '@anthropic-ai/sdk';

import { createBackend, DEFAULT_MODEL } from './anthropic.mjs';
import { createEngine } from '../engine.mjs';
import { createStore } from '../store.mjs';
import { keyOf } from '../normalize.mjs';
import { LAYER } from '../types.mjs';
import { planRequests } from '../requests.mjs';
import { computeWorklist } from '../gate.mjs';
import { isTransient } from '../translator-prompt.mjs';
import { fakeAnthropic, refusalMessage, replyMessage, requestBody } from '../../test/helpers.mjs';

const noSleep = () => Promise.resolve();
const PROMPTS = { en: '# English\n\nUse a neutral register.\n' };
const GLOSSARY = {
  target_lang_names: { en: 'English' },
  do_not_translate: ['Cognitio', 'Kubernetes'],
  glossary: { en: { 'Servizi Cloud': 'Cloud services' } },
};

/** A planned request for one page holding `sources`, none translated. */
function requestFor(sources) {
  const units = Object.fromEntries(sources.map((s) => [keyOf(s), { source: s, format: s.startsWith('<') ? 'html' : 'text', usages: [] }]));
  const catalog = { source_lang: 'it', units };
  const worklist = computeWorklist(catalog, { targets: ['en'], tmByLang: { en: {} } });
  const pages = [{ id: 'content/it/a.json', segments: sources.map((s) => ({ key: keyOf(s), source: s, format: units[keyOf(s)].format, section: 'x' })) }];
  return planRequests({ pages, worklist, tmByLang: { en: {} }, targets: ['en'], sectionTokens: 8000, attemptLimit: 3 }).specs[0];
}

describe('translate — one Messages API call per request, through the SDK client', () => {
  it('sends the one builder’s parameters and returns the reply’s entries with the model', async () => {
    const fake = fakeAnthropic();
    const backend = createBackend({
      backendConfig: { kind: 'anthropic', model: { id: 'claude-opus-5-5', effort: 'low' } },
      prompts: PROMPTS,
      env: { ANTHROPIC_API_KEY: 'k' },
      ClientClass: fake.FakeAnthropic,
    });
    const request = requestFor(['Servizi Cloud firmati Cognitio']);
    const res = await backend.translate({ request, lang: 'en', sourceLang: 'it', glossary: GLOSSARY });
    expect(res).toEqual({
      entries: [{ id: keyOf('Servizi Cloud firmati Cognitio'), text: '[claude-opus-5-5] Servizi Cloud firmati Cognitio' }],
      model: 'claude-opus-5-5',
    });
    const [params] = fake.calls.create;
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    expect(params).not.toHaveProperty('thinking');
    expect(params.system[1].text).toContain('"Servizi Cloud" -> "Cloud services"');
    expect(params.system[2]).toEqual({ type: 'text', text: PROMPTS.en, cache_control: { type: 'ephemeral', ttl: '1h' } });
    expect(requestBody(params).translate).toEqual(request.requested);
  });

  it('defaults to the package’s model, and lets the glossary’s model replace the id only', async () => {
    const fake = fakeAnthropic();
    const backend = createBackend({ prompts: PROMPTS, env: { ANTHROPIC_API_KEY: 'k' }, ClientClass: fake.FakeAnthropic });
    const request = requestFor(['Uno']);
    await backend.translate({ request, lang: 'en', sourceLang: 'it', glossary: {} });
    await backend.translate({ request, lang: 'en', sourceLang: 'it', glossary: { model: 'claude-sonnet-5-5' } });
    expect(fake.calls.create.map((p) => p.model)).toEqual([DEFAULT_MODEL, 'claude-sonnet-5-5']);
  });

  it('returns a refusal and a defect as they are, for the engine to queue', async () => {
    const replies = [refusalMessage('cyber'), { stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }];
    const fake = fakeAnthropic({ reply: () => replies.shift() });
    const backend = createBackend({ prompts: PROMPTS, env: { ANTHROPIC_API_KEY: 'k' }, ClientClass: fake.FakeAnthropic });
    const request = requestFor(['Uno']);
    expect(await backend.translate({ request, lang: 'en', sourceLang: 'it' })).toEqual({ refusal: { category: 'cyber' }, model: DEFAULT_MODEL });
    expect((await backend.translate({ request, lang: 'en', sourceLang: 'it' })).defect).toMatch(/^the reply is not valid JSON/);
  });

  it('creates the client once, on the first call, with the SDK’s own retries off', async () => {
    const fake = fakeAnthropic();
    const backend = createBackend({ prompts: PROMPTS, env: { ANTHROPIC_API_KEY: 'k' }, ClientClass: fake.FakeAnthropic });
    expect(fake.constructed).toHaveLength(0);
    const request = requestFor(['Uno']);
    await backend.translate({ request, lang: 'en', sourceLang: 'it' });
    await backend.translate({ request, lang: 'en', sourceLang: 'it' });
    expect(fake.constructed).toHaveLength(1);
    expect(fake.constructed[0].maxRetries).toBe(0);
  });

  it('marks an SDK connection failure transient, so the engine retries it', async () => {
    let calls = 0;
    const client = {
      messages: {
        create: async (params) => {
          calls += 1;
          if (calls === 1) throw new APIConnectionError({ message: 'Connection error.' });
          const body = requestBody(params);
          return replyMessage(body.translate.map((id) => ({ id, text: 'One' })));
        },
      },
    };
    const backend = createBackend({ prompts: PROMPTS, client });
    let thrown;
    try {
      await backend.translate({ request: requestFor(['Uno']), lang: 'en', sourceLang: 'it' });
    } catch (err) {
      thrown = err;
    }
    expect(isTransient(thrown)).toBe(true);
    expect((await backend.translate({ request: requestFor(['Uno']), lang: 'en', sourceLang: 'it' })).entries).toEqual([{ id: keyOf('Uno'), text: 'One' }]);
  });
});

describe('translate — the API key', () => {
  it('throws a NON-transient error naming the variable when it is unset, constructing no client', async () => {
    const fake = fakeAnthropic();
    const backend = createBackend({ backendConfig: { apiKeyEnv: 'SITE_TRANSLATION_KEY' }, prompts: PROMPTS, env: {}, ClientClass: fake.FakeAnthropic });
    let thrown;
    try {
      await backend.translate({ request: requestFor(['Uno']), lang: 'en', sourceLang: 'it' });
    } catch (err) {
      thrown = err;
    }
    expect(thrown.message).toMatch(/^SITE_TRANSLATION_KEY is not set/);
    expect(isTransient(thrown)).toBe(false);
    expect(fake.constructed).toHaveLength(0);
  });

  it('reads the key from the variable the configuration names, from the environment it is given', async () => {
    const fake = fakeAnthropic();
    const backend = createBackend({
      backendConfig: { apiKeyEnv: 'SITE_TRANSLATION_KEY' },
      prompts: PROMPTS,
      env: { SITE_TRANSLATION_KEY: 'from-named-variable', ANTHROPIC_API_KEY: 'wrong-variable' },
      ClientClass: fake.FakeAnthropic,
    });
    await backend.translate({ request: requestFor(['Uno']), lang: 'en', sourceLang: 'it' });
    expect(fake.constructed[0].apiKey).toBe('from-named-variable');
  });

  for (const name of ['VITE_ANTHROPIC_API_KEY', 'vite_anthropic_api_key', 'Vite_Key']) {
    it(`refuses ${name} when the backend is created, before any request can exist`, () => {
      const fake = fakeAnthropic();
      expect(() => createBackend({ backendConfig: { apiKeyEnv: name }, env: { [name]: 'secret' }, ClientClass: fake.FakeAnthropic })).toThrow(
        /begins with VITE_.*never carries the VITE_ prefix/
      );
      expect(fake.constructed).toHaveLength(0);
    });
  }
});

describe('engine integration — the SDK backend with a fake client', () => {
  let baseDir;
  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-backend-'));
  });
  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('writes the machine layer and a job log carrying the model, and never writes a reply that breaks the HTML', async () => {
    const store = createStore({ baseDir });
    const srcText = 'Servizi gestiti per infrastrutture Linux';
    const srcHtml = '<p>Servizi Cloud</p>';
    store.writeSourceCatalog({
      generated_at: 'x',
      source_lang: 'it',
      units: {
        [keyOf(srcText)]: { source: srcText, format: 'text', usages: [{ file: 'content/it/a.json', path: 'b' }] },
        [keyOf(srcHtml)]: { source: srcHtml, format: 'html', usages: [{ file: 'content/it/a.json', path: 'c' }] },
      },
    });
    const reply = (params) => {
      const body = requestBody(params);
      return replyMessage(
        body.translate.map((id) => ({ id, text: id === keyOf(srcText) ? 'Managed services for Linux infrastructure' : '<p>Cloud services</strong>' }))
      );
    };
    const fake = fakeAnthropic({ reply });
    const backend = createBackend({ prompts: PROMPTS, env: { ANTHROPIC_API_KEY: 'ci-key' }, ClientClass: fake.FakeAnthropic });
    const engine = createEngine({ backend, paths: { baseDir }, options: { sleep: noSleep, idGen: () => 'jobA', now: () => '2026-09-03T00:00:00.000Z' } });

    const res = await engine.translate({ targets: ['en'], glossary: GLOSSARY });

    expect(res.result).toBe('partial');
    const tm = store.readLayer(LAYER.MACHINE, 'en');
    expect(tm[keyOf(srcText)]).toMatchObject({ text: 'Managed services for Linux infrastructure', status: 'machine', job: 'jobA' });
    expect(tm[keyOf(srcHtml)]).toBeUndefined();
    expect(res.job.items).toEqual([expect.objectContaining({ srcHash: keyOf(srcText), model: DEFAULT_MODEL, attempt: 1 })]);
    expect(res.job.failures).toEqual([
      expect.objectContaining({ srcHash: keyOf(srcHtml), error: expect.stringContaining('HTML tags or comments differ from the source') }),
    ]);
    // The rejected segment was resubmitted alone, with its defect, up to the limit.
    expect(fake.calls.create.map((p) => requestBody(p).translate.length)).toEqual([2, 1, 1]);
  });
});
