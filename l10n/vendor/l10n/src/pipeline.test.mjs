import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { decidePipeline, runPipeline, ACTION } from './pipeline.mjs';
import { createStore } from './store.mjs';
import { keyOf } from './normalize.mjs';
import { LAYER } from './types.mjs';

let baseDir;

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-pipeline-'));
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

const SILENT = { log: () => {}, errlog: () => {} };

/**
 * A fake adapter: one source unit, `Ciao`, on one page; it records every
 * generate call. It has no `pages()` view, so the engine takes its pages from
 * the catalogue's usage files.
 */
function makeAdapter(generateCalls) {
  return {
    targets: ['en'],
    glossary: {},
    extract() {
      return {
        generated_at: 'x',
        source_lang: 'it',
        units: { [keyOf('Ciao')]: { source: 'Ciao', format: 'text', usages: [{ file: 'content/it/home.json', path: 'title' }] } },
      };
    },
    generate(args) {
      generateCalls.push(args);
      return { files: {}, written: [], skipped: 0, warnings: [] };
    },
  };
}

/** A fake backend: it records the calls, and its behaviour is configurable. */
function makeBackend(calls, behavior = 'ok') {
  return {
    async translate({ items, lang }) {
      calls.push({ lang, count: items.length });
      if (behavior === 'throw') {
        const e = new Error('simulated application error');
        e.transient = false;
        throw e;
      }
      const translations = {};
      if (behavior === 'ok') {
        for (const it of items) translations[it.srcHash] = 'Hello';
      }
      // behavior === 'empty' → no translation, so the missing item is a failure.
      return { translations, model: 'fake-model' };
    },
  };
}

describe('decidePipeline (the pure decision)', () => {
  it('maps up-to-date to a no-op: exit 0, no network', () => {
    const d = decidePipeline({ worklist: { status: 'up-to-date' }, hasKey: false });
    expect(d.action).toBe(ACTION.NOOP);
    expect(d.code).toBe(0);
    expect(d.network).toBe(false);
  });

  it('maps work remaining with NO key to missing-key: exit non-zero, no network', () => {
    const d = decidePipeline({
      worklist: { status: 'work', targets: ['en'], items: [{ srcHash: 'a', missing: ['en'] }], orphans: [] },
      hasKey: false,
    });
    expect(d.action).toBe(ACTION.MISSING_KEY);
    expect(d.code).toBe(1);
    expect(d.network).toBe(false);
  });

  it('maps work remaining with a key to translate, expecting network', () => {
    const d = decidePipeline({
      worklist: { status: 'work', targets: ['en'], items: [{ srcHash: 'a', missing: ['en'] }], orphans: [] },
      hasKey: true,
    });
    expect(d.action).toBe(ACTION.TRANSLATE);
    expect(d.network).toBe(true);
  });
});

describe('runPipeline (the orchestration)', () => {
  it('no-ops when up to date: no translation and no generate', async () => {
    // Pre-seed the TM so the gate comes out up-to-date after the extract.
    const store = createStore({ baseDir });
    store.writeLayer(LAYER.HUMAN, 'en', { [keyOf('Ciao')]: { text: 'Hello', status: 'seed', srcHash: keyOf('Ciao') } });

    const generateCalls = [];
    const backendCalls = [];
    const res = await runPipeline({
      baseDir,
      targets: ['en'],
      adapter: makeAdapter(generateCalls),
      backend: makeBackend(backendCalls, 'ok'),
      hasKey: true, // even with a key, up-to-date must NOT translate
      ...SILENT,
    });

    expect(res.action).toBe(ACTION.NOOP);
    expect(res.code).toBe(0);
    expect(backendCalls).toHaveLength(0); // no network call
    expect(generateCalls).toHaveLength(0);
  });

  it('fails with exit 1 and never calls the backend when work remains with NO key', async () => {
    const generateCalls = [];
    const backendCalls = [];
    const res = await runPipeline({
      baseDir,
      targets: ['en'],
      adapter: makeAdapter(generateCalls),
      backend: makeBackend(backendCalls, 'ok'),
      hasKey: false,
      ...SILENT,
    });

    expect(res.action).toBe(ACTION.MISSING_KEY);
    expect(res.code).toBe(1);
    expect(backendCalls).toHaveLength(0); // no network attempt
    expect(generateCalls).toHaveLength(0);
  });

  it('names the configured key variable, not a hard-coded one, when the key is missing', async () => {
    const errors = [];
    const res = await runPipeline({
      baseDir,
      targets: ['en'],
      adapter: makeAdapter([]),
      backend: makeBackend([], 'ok'),
      hasKey: false,
      apiKeyEnv: 'SITE_TRANSLATION_KEY',
      log: () => {},
      errlog: (...a) => errors.push(a.join(' ')),
    });
    expect(res.code).toBe(1);
    expect(errors.join('\n')).toContain('SITE_TRANSLATION_KEY is not set');
    expect(errors.join('\n')).not.toContain('ANTHROPIC_API_KEY');
  });

  it('translates through the mocked backend and then generates, exit 0', async () => {
    const generateCalls = [];
    const backendCalls = [];
    const res = await runPipeline({
      baseDir,
      targets: ['en'],
      adapter: makeAdapter(generateCalls),
      backend: makeBackend(backendCalls, 'ok'),
      hasKey: true,
      ...SILENT,
    });

    expect(res.action).toBe(ACTION.TRANSLATED);
    expect(res.code).toBe(0);
    expect(backendCalls).toHaveLength(1); // it translated
    expect(generateCalls).toHaveLength(1); // it regenerated the targets
    // The machine layer was persisted, ready to be committed; the human layer was not written.
    const store = createStore({ baseDir });
    expect(store.readLayer(LAYER.MACHINE, 'en')[keyOf('Ciao')].text).toBe('Hello');
    expect(fs.existsSync(store.paths.layer(LAYER.HUMAN, 'en'))).toBe(false);
  });

  it('exits 1 and skips generate when translate fails', async () => {
    const generateCalls = [];
    const backendCalls = [];
    const res = await runPipeline({
      baseDir,
      targets: ['en'],
      adapter: makeAdapter(generateCalls),
      backend: makeBackend(backendCalls, 'throw'),
      hasKey: true,
      ...SILENT,
    });

    expect(res.action).toBe(ACTION.TRANSLATE_FAILED);
    expect(res.code).toBe(1);
    expect(backendCalls).toHaveLength(1); // it tried
    expect(generateCalls).toHaveLength(0); // but did NOT generate the targets
  });
});
