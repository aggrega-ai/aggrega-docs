import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEngine } from './engine.mjs';
import { createStore } from './store.mjs';
import { keyOf } from './normalize.mjs';
import { LAYER } from './types.mjs';

let baseDir;

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-engine-'));
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

/**
 * Writes a catalog to disk from a list of source strings. With no adapter, a
 * page is a usage file: every unit sits on one page unless `pagePerUnit` puts
 * each on its own.
 */
function seedCatalog(sources, { pagePerUnit = false } = {}) {
  const store = createStore({ baseDir });
  const units = {};
  sources.forEach((s, i) => {
    const file = pagePerUnit ? `content/it/page-${i}.json` : 'content/it/x.json';
    units[keyOf(s)] = { source: s, format: 'text', usages: [{ file, path: 'b' }] };
  });
  store.writeSourceCatalog({ generated_at: 'x', source_lang: 'it', units });
  return store;
}

/** A fake backend: it "translates" by prefixing the language. No network. */
function fakeBackend(overrides = {}) {
  return {
    async translate({ items, lang }) {
      const out = {};
      for (const it of items) out[it.srcHash] = `[${lang}] ${it.source}`;
      return { translations: out, model: 'fake-model', ...overrides };
    },
  };
}

const noSleep = () => Promise.resolve();
const human = (text, key) => ({ text, status: 'seed', srcHash: key });

describe('construction', () => {
  it('needs the memory directory: no location is derived from where the package is installed', () => {
    expect(() => createEngine({})).toThrow(/baseDir/);
  });
});

describe('translate — the happy path', () => {
  it('writes the MACHINE layer and a job log, and returns result ok', async () => {
    const store = seedCatalog(['Uno', 'Due']);
    const engine = createEngine({
      backend: fakeBackend(),
      paths: { baseDir },
      options: { sleep: noSleep, idGen: () => 'job1', now: () => '2026-09-03T10:00:00.000Z' },
    });
    const res = await engine.translate({ targets: ['en'] });
    expect(res.result).toBe('ok');
    const machine = store.readLayer(LAYER.MACHINE, 'en');
    expect(machine[keyOf('Uno')].text).toBe('[en] Uno');
    expect(machine[keyOf('Uno')].status).toBe('machine');
    expect(machine[keyOf('Uno')].job).toBe('job1');
    // The job log is on disk.
    expect(res.jobFile && fs.existsSync(res.jobFile)).toBe(true);
    expect(res.job.items).toHaveLength(2);
    expect(res.job.failures).toHaveLength(0);
    // The source map is populated.
    expect(store.readSourceMap()[keyOf('Uno')]).toBe('Uno');
  });

  it('(b) leaves the HUMAN file byte-identical while the machine file gains the entries', async () => {
    const store = seedCatalog(['Uno', 'Due', 'Tre']);
    store.writeLayer(LAYER.HUMAN, 'en', { [keyOf('Uno')]: human('One', keyOf('Uno')) });
    const humanFile = store.paths.layer(LAYER.HUMAN, 'en');
    const humanBefore = fs.readFileSync(humanFile);
    expect(fs.existsSync(store.paths.layer(LAYER.MACHINE, 'en'))).toBe(false);

    const engine = createEngine({ backend: fakeBackend(), paths: { baseDir }, options: { sleep: noSleep } });
    const res = await engine.translate({ targets: ['en'] });

    expect(res.result).toBe('ok');
    expect(fs.readFileSync(humanFile).equals(humanBefore)).toBe(true);
    const machine = store.readLayer(LAYER.MACHINE, 'en');
    expect(Object.keys(machine).sort()).toEqual([keyOf('Due'), keyOf('Tre')].sort());
    // The key the human layer already held was not sent for translation.
    expect(machine[keyOf('Uno')]).toBeUndefined();
  });

  it('returns result ok and no job when already up to date', async () => {
    const store = seedCatalog(['Uno']);
    store.writeLayerEntries(LAYER.HUMAN, 'en', { [keyOf('Uno')]: human('One', keyOf('Uno')) });
    const engine = createEngine({ backend: fakeBackend(), paths: { baseDir }, options: { sleep: noSleep } });
    const res = await engine.translate({ targets: ['en'] });
    expect(res.result).toBe('ok');
    expect(res.job).toBeNull();
  });
});

describe('translate — retry and backoff on transient errors only', () => {
  it('retries a transient error and eventually succeeds', async () => {
    seedCatalog(['Uno']);
    let calls = 0;
    const flaky = {
      async translate({ items, lang }) {
        calls++;
        if (calls < 3) {
          const err = new Error('502');
          err.status = 502; // transient
          throw err;
        }
        const out = {};
        for (const it of items) out[it.srcHash] = `[${lang}] ${it.source}`;
        return out; // the accepted "bare map" shape
      },
    };
    const engine = createEngine({ backend: flaky, paths: { baseDir }, options: { sleep: noSleep, attempts: 3 } });
    const res = await engine.translate({ targets: ['en'] });
    expect(calls).toBe(3);
    expect(res.result).toBe('ok');
  });

  it('does NOT retry a non-transient error, and fails', async () => {
    seedCatalog(['Uno']);
    let calls = 0;
    const hard = {
      async translate() {
        calls++;
        const err = new Error('400 bad request');
        err.status = 400; // not transient
        throw err;
      },
    };
    const engine = createEngine({ backend: hard, paths: { baseDir }, options: { sleep: noSleep, attempts: 3 } });
    const res = await engine.translate({ targets: ['en'] });
    expect(calls).toBe(1); // no retry
    expect(res.result).toBe('failed');
    expect(res.job.failures).toHaveLength(1);
  });
});

describe('translate — per-request crash safety', () => {
  it('preserves the already-written requests when a run fails halfway; result partial', async () => {
    const store = seedCatalog(['Uno', 'Due'], { pagePerUnit: true });
    let calls = 0;
    // One page per string, so one request per string. The second call fails hard.
    const backend = {
      async translate({ items, lang }) {
        calls++;
        if (calls === 2) {
          const err = new Error('backend crash');
          err.status = 400;
          throw err;
        }
        const out = {};
        for (const it of items) out[it.srcHash] = `[${lang}] ${it.source}`;
        return out;
      },
    };
    const engine = createEngine({
      backend,
      paths: { baseDir },
      options: { sleep: noSleep, concurrency: 1, attempts: 1, idGen: () => 'j', now: () => 't' },
    });
    const res = await engine.translate({ targets: ['en'] });
    expect(res.result).toBe('partial');
    // A request that throws is not resubmitted within the run.
    expect(calls).toBe(2);

    // The first request is persisted; the second is not.
    const machine = store.readLayer(LAYER.MACHINE, 'en');
    expect(Object.keys(machine)).toHaveLength(1);
    // The layer file on disk is valid JSON, with no corrupt temporary left behind.
    const raw = fs.readFileSync(store.paths.layer(LAYER.MACHINE, 'en'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
    const leftovers = fs.readdirSync(store.paths.machineDir).filter((n) => n.includes('.tmp-'));
    expect(leftovers).toEqual([]);

    // The job log records one success and one failure.
    expect(res.job.items).toHaveLength(1);
    expect(res.job.failures).toHaveLength(1);
  });
});

describe('translate — validation and resubmission in the synchronous transport', () => {
  it('resubmits an omitted identifier with its defect stated, and names it after the attempt limit', async () => {
    const store = seedCatalog(['Uno', 'Due']);
    const requests = [];
    const omitsDue = {
      async translate({ request, items, lang }) {
        requests.push(request);
        const out = {};
        for (const it of items) if (it.source !== 'Due') out[it.srcHash] = `[${lang}] ${it.source}`;
        return { translations: out };
      },
    };
    const engine = createEngine({ backend: omitsDue, paths: { baseDir }, options: { sleep: noSleep, attemptLimit: 3 } });
    const res = await engine.translate({ targets: ['en'] });
    expect(res.result).toBe('partial');
    expect(requests.map((r) => [r.attempt, r.requested])).toEqual([
      [1, [keyOf('Due'), keyOf('Uno')].sort()],
      [2, [keyOf('Due')]],
      [3, [keyOf('Due')]],
    ]);
    expect(requests[1].corrections).toEqual({ [keyOf('Due')]: 'no translation was returned for this identifier' });
    expect(res.job.failures).toEqual([
      { srcHash: keyOf('Due'), lang: 'en', error: 'no translation was returned for this identifier (after 3 attempts)' },
    ]);
    expect(store.readLayer(LAYER.MACHINE, 'en')[keyOf('Due')]).toBeUndefined();
  });

  it('never writes a translation that fails validation, and accepts its corrected resubmission', async () => {
    const store = createStore({ baseDir });
    const source = 'Usa `npm ci` per installare.';
    store.writeSourceCatalog({
      generated_at: 'x',
      source_lang: 'it',
      units: { [keyOf(source)]: { source, format: 'markdown', protected: [[4, 12]], usages: [{ file: 'docs/a.md', path: 'p' }] } },
    });
    const replies = ['Use `npm install` to install.', 'Use `npm ci` to install.'];
    const seen = [];
    const backend = {
      async translate({ request }) {
        seen.push(request.corrections);
        return { entries: [{ id: request.requested[0], text: replies[seen.length - 1] }] };
      },
    };
    const engine = createEngine({ backend, paths: { baseDir }, options: { sleep: noSleep } });
    const res = await engine.translate({ targets: ['en'] });
    expect(res.result).toBe('ok');
    expect(seen[0]).toEqual({});
    expect(seen[1][keyOf(source)]).toContain('missing or altered "`npm ci`"');
    expect(store.readLayer(LAYER.MACHINE, 'en')[keyOf(source)].text).toBe('Use `npm ci` to install.');
  });

  it('keeps the requested segments of a reply that adds an identifier, resubmits nothing, and names the extra one in its job log', async () => {
    const store = seedCatalog(['Uno', 'Due']);
    const calls = [];
    const backend = {
      async translate({ items, lang }) {
        calls.push(items.map((it) => it.srcHash));
        const out = { 'not-asked': 'x' };
        for (const it of items) out[it.srcHash] = `[${lang}] ${it.source}`;
        return { translations: out };
      },
    };
    const engine = createEngine({ backend, paths: { baseDir }, options: { sleep: noSleep } });
    const res = await engine.translate({ targets: ['en'] });
    expect(res.result).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(Object.keys(store.readLayer(LAYER.MACHINE, 'en')).sort()).toEqual([keyOf('Due'), keyOf('Uno')].sort());
    expect(res.job.failures).toEqual([]);
    expect(res.job.dropped).toEqual([{ id: 'not-asked', lang: 'en', page: 'content/it/x.json', section: null }]);
    expect(JSON.parse(fs.readFileSync(res.jobFile, 'utf8')).dropped).toEqual(res.job.dropped);
  });

  it('names a missing unit that no page holds instead of requesting it', async () => {
    const store = createStore({ baseDir });
    store.writeSourceCatalog({ generated_at: 'x', source_lang: 'it', units: { [keyOf('Orfano')]: { source: 'Orfano', format: 'text', usages: [] } } });
    const engine = createEngine({ backend: fakeBackend(), paths: { baseDir }, options: { sleep: noSleep } });
    const res = await engine.translate({ targets: ['en'] });
    expect(res.result).toBe('failed');
    expect(res.job.failures[0].error).toBe('appears on no page: the catalogue is older than the content; run extract');
  });
});

describe('the gate handler', () => {
  it('reads the catalog and both layers from disk and computes the worklist', () => {
    const store = seedCatalog(['Uno', 'Due', 'Tre']);
    store.writeLayerEntries(LAYER.HUMAN, 'en', { [keyOf('Uno')]: human('One', keyOf('Uno')) });
    store.writeLayerEntries(LAYER.MACHINE, 'en', {
      [keyOf('Due')]: { text: 'Two', status: 'machine', srcHash: keyOf('Due') },
    });
    const engine = createEngine({ paths: { baseDir } });
    const wl = engine.gate({ targets: ['en'] });
    expect(wl.status).toBe('work');
    expect(wl.items.map((it) => it.srcHash)).toEqual([keyOf('Tre')]);
  });
});

describe('extract', () => {
  it('refuses a catalog that does not say which locale it is in', async () => {
    const adapter = { extract: () => ({ units: {} }) };
    const engine = createEngine({ adapter, paths: { baseDir } });
    await expect(engine.extract()).rejects.toThrow(/source_lang/);
  });
});

describe('seed', () => {
  it('imports entries with status seed into the HUMAN layer only, handing the adapter the store', async () => {
    seedCatalog(['Uno']);
    let received;
    const adapter = {
      async seedAlign(args) {
        received = args;
        return {
          entriesByLang: { en: { [keyOf('Uno')]: { text: 'One' } } },
          sourceEntries: { [keyOf('Uno')]: 'Uno' },
        };
      },
    };
    const engine = createEngine({ adapter, paths: { baseDir } });
    const res = await engine.seed({ targets: ['en'] });
    expect(res.seeded).toBe(1);
    expect(received.store).toBe(engine.store);
    expect(received.targets).toEqual(['en']);
    const store = createStore({ baseDir });
    const humanLayer = store.readLayer(LAYER.HUMAN, 'en');
    expect(humanLayer[keyOf('Uno')].status).toBe('seed');
    expect(humanLayer[keyOf('Uno')].text).toBe('One');
    expect(fs.existsSync(store.paths.layer(LAYER.MACHINE, 'en'))).toBe(false);
  });
});

describe('gc', () => {
  it('reports the orphans without archiving when apply=false', () => {
    const store = seedCatalog(['vivo']);
    store.writeLayer(LAYER.MACHINE, 'en', {
      [keyOf('vivo')]: { text: 'alive', status: 'machine', srcHash: keyOf('vivo'), at: '2000-01-01T00:00:00.000Z' },
      orphan: { text: 'x', status: 'machine', srcHash: 'orphan', at: '2000-01-01T00:00:00.000Z' },
    });
    const engine = createEngine({ paths: { baseDir } });
    const res = engine.gc({ graceDays: 0, apply: false });
    expect(res.orphans).toEqual(['orphan']);
    expect(res.byLang.en.eligible).toEqual(['orphan']);
    expect(res.byLang.en.archived).toBe(0);
    // Non-destructive: the memory is unchanged.
    expect(Object.keys(store.readTM('en')).sort()).toEqual([keyOf('vivo'), 'orphan'].sort());
  });

  it('archives the orphans past the grace period when apply=true, from both layers', () => {
    const store = seedCatalog(['vivo']);
    store.writeLayer(LAYER.MACHINE, 'en', {
      [keyOf('vivo')]: { text: 'alive', status: 'machine', srcHash: keyOf('vivo'), at: '2000-01-01T00:00:00.000Z' },
      orphan: { text: 'x', status: 'machine', srcHash: 'orphan', at: '2000-01-01T00:00:00.000Z' },
    });
    store.writeLayer(LAYER.HUMAN, 'en', {
      stale: { text: 'y', status: 'seed', srcHash: 'stale', at: '2000-01-01T00:00:00.000Z' },
    });
    const engine = createEngine({ paths: { baseDir } });
    const res = engine.gc({ graceDays: 30, apply: true });
    expect(res.byLang.en.archived).toBe(2);
    expect(Object.keys(store.readTM('en'))).toEqual([keyOf('vivo')]);
    expect(Object.keys(store.readArchive(LAYER.MACHINE, 'en'))).toEqual(['orphan']);
    expect(Object.keys(store.readArchive(LAYER.HUMAN, 'en'))).toEqual(['stale']);
  });

  it('honours the grace period: a recent orphan is not eligible', () => {
    const store = seedCatalog([]);
    store.writeLayer(LAYER.MACHINE, 'en', {
      orphan: { text: 'x', status: 'machine', srcHash: 'orphan', at: new Date().toISOString() },
    });
    const engine = createEngine({ paths: { baseDir } });
    const res = engine.gc({ graceDays: 30, apply: true });
    expect(res.byLang.en.eligible).toEqual([]); // too recent
    expect(res.byLang.en.archived).toBe(0);
  });
});

describe('missing handlers', () => {
  it('throws a clear error when extract has no adapter', async () => {
    const engine = createEngine({ paths: { baseDir } });
    await expect(engine.extract()).rejects.toThrow(/adapter\.extract is not configured/);
  });

  it('throws a clear error when translate has no backend', async () => {
    const engine = createEngine({ paths: { baseDir } });
    await expect(engine.translate({ targets: ['en'] })).rejects.toThrow(/backend\.translate is not configured/);
  });
});

describe('translate — a do-not-translate entry with its own case reaches the validation', () => {
  it('accepts the common word translated beside the protected name, and resubmits a reply that translated the name', async () => {
    const source = 'La LASTRA è una lastra.';
    const store = seedCatalog([source]);
    const replies = ['The SLAB is a slab.', 'LASTRA is a slab.'];
    const seen = [];
    const backend = {
      async translate({ items, request }) {
        seen.push(request.corrections || {});
        return { translations: { [items[0].srcHash]: replies.shift() }, model: 'fake-model' };
      },
    };
    const engine = createEngine({ backend, paths: { baseDir }, options: { sleep: noSleep } });
    const glossary = { do_not_translate: [{ term: 'LASTRA', case: 'sensitive' }] };
    const res = await engine.translate({ targets: ['en'], glossary });
    expect(res.result).toBe('ok');
    expect(store.readLayer(LAYER.MACHINE, 'en')[keyOf(source)].text).toBe('LASTRA is a slab.');
    expect(seen[1][keyOf(source)]).toBe('the do-not-translate term "LASTRA" is missing; keep it verbatim');
  });
});
