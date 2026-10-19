import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, stableStringify } from './store.mjs';
import { LAYER } from './types.mjs';

let baseDir;

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-store-'));
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

describe('construction', () => {
  it('refuses to guess a location: baseDir is required', () => {
    expect(() => createStore({})).toThrow(/baseDir/);
    expect(() => createStore()).toThrow(/baseDir/);
  });

  it('refuses an unknown layer name rather than writing somewhere unexpected', () => {
    const store = createStore({ baseDir });
    expect(() => store.writeLayer('both', 'en', {})).toThrow(/unknown memory layer "both"/);
  });

  it('lays the two layers out beside each other under the memory directory', () => {
    const store = createStore({ baseDir });
    expect(store.paths.layer(LAYER.HUMAN, 'en')).toBe(path.join(baseDir, 'messages', 'en.json'));
    expect(store.paths.layer(LAYER.MACHINE, 'en')).toBe(path.join(baseDir, 'machine', 'en.json'));
    expect(store.paths.archive(LAYER.HUMAN, 'en')).toBe(path.join(baseDir, 'messages', '_archive', 'en.json'));
    expect(store.paths.archive(LAYER.MACHINE, 'en')).toBe(path.join(baseDir, 'machine', '_archive', 'en.json'));
    expect(store.paths.sourceMap).toBe(path.join(baseDir, 'messages', '_source.json'));
    expect(store.paths.seedReport).toBe(path.join(baseDir, 'seed-report.json'));
  });
});

describe('missing reads', () => {
  it('returns an empty object rather than an error for an absent catalog, layer or source map', () => {
    const store = createStore({ baseDir });
    expect(store.readSourceCatalog()).toEqual({});
    expect(store.readLayer(LAYER.HUMAN, 'en')).toEqual({});
    expect(store.readLayer(LAYER.MACHINE, 'en')).toEqual({});
    expect(store.readTM('en')).toEqual({});
    expect(store.readSourceMap()).toEqual({});
    expect(store.listLangs()).toEqual([]);
  });
});

describe('the pending file', () => {
  it('reads as recording nothing when absent, and round-trips what is written beside the memory', () => {
    const store = createStore({ baseDir });
    expect(store.paths.pending).toBe(path.join(baseDir, 'pending.json'));
    expect(store.readPending()).toEqual({ batches: [], queue: {} });
    const value = {
      batches: [{ id: 'msgbatch_1', createdAt: 't', requests: { '000000-en-a': { page: 'a', section: null, lang: 'en', ids: ['k'], attempt: 1, model: 'm', fallback: false } } }],
      queue: { en: { k: { attempts: 1, defect: 'x' } } },
    };
    store.writePending(value);
    expect(store.readPending()).toEqual(value);
    expect(fs.readFileSync(store.paths.pending, 'utf8')).toBe(stableStringify(value));
  });
});

describe('the lookup view: human over machine', () => {
  const cases = [
    {
      scenario: 'a key in both layers with different text resolves to the HUMAN text',
      human: { k: { text: 'Hello (reviewed)', status: 'reviewed', srcHash: 'k' } },
      machine: { k: { text: 'Hello (machine)', status: 'machine', srcHash: 'k' } },
      expected: { k: 'Hello (reviewed)' },
    },
    {
      scenario: 'a key only in the machine layer resolves to the machine text',
      human: {},
      machine: { m: { text: 'Machine only', status: 'machine', srcHash: 'm' } },
      expected: { m: 'Machine only' },
    },
    {
      scenario: 'a key only in the human layer resolves to the human text',
      human: { h: { text: 'Human only', status: 'seed', srcHash: 'h' } },
      machine: {},
      expected: { h: 'Human only' },
    },
    {
      scenario: 'disjoint keys are all visible',
      human: { h: { text: 'H', status: 'seed', srcHash: 'h' } },
      machine: { m: { text: 'M', status: 'machine', srcHash: 'm' } },
      expected: { h: 'H', m: 'M' },
    },
  ];

  for (const c of cases) {
    it(c.scenario, () => {
      const store = createStore({ baseDir });
      store.writeLayer(LAYER.HUMAN, 'en', c.human);
      store.writeLayer(LAYER.MACHINE, 'en', c.machine);
      const looked = Object.fromEntries(Object.entries(store.readTM('en')).map(([k, e]) => [k, e.text]));
      expect(looked).toEqual(c.expected);
      expect(Object.fromEntries(Object.entries(store.readAllTM(['en']).en).map(([k, e]) => [k, e.text]))).toEqual(c.expected);
    });
  }

  it('lists a language held by either layer, once', () => {
    const store = createStore({ baseDir });
    store.writeLayer(LAYER.HUMAN, 'en', {});
    store.writeLayer(LAYER.MACHINE, 'en', {});
    store.writeLayer(LAYER.MACHINE, 'de', {});
    store.mergeSourceMap({ k: 'x' });
    expect(store.listLangs()).toEqual(['de', 'en']);
  });
});

describe('atomic, diff-friendly writes', () => {
  it('creates the directories and writes 2-space JSON with sorted keys and a trailing newline', () => {
    const store = createStore({ baseDir });
    store.writeLayer(LAYER.HUMAN, 'en', { b: { text: 'B' }, a: { text: 'A' } });
    const raw = fs.readFileSync(store.paths.layer(LAYER.HUMAN, 'en'), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.indexOf('"a"')).toBeLessThan(raw.indexOf('"b"')); // keys sorted
    expect(raw).toContain('  "a"'); // 2-space indentation
  });

  it('leaves no temporary file behind after a successful write', () => {
    const store = createStore({ baseDir });
    store.writeLayer(LAYER.HUMAN, 'en', { a: { text: 'A' } });
    store.writeLayer(LAYER.MACHINE, 'en', { a: { text: 'A' } });
    store.writeSourceCatalog({ generated_at: 'x', source_lang: 'it', units: {} });
    for (const dir of [store.paths.messagesDir, store.paths.machineDir]) {
      expect(fs.readdirSync(dir).filter((n) => n.includes('.tmp-'))).toEqual([]);
    }
  });

  it('merges a batch into ONE layer and leaves the other untouched', () => {
    const store = createStore({ baseDir });
    store.writeLayer(LAYER.HUMAN, 'en', { h: { text: 'human', status: 'seed', srcHash: 'h' } });
    const humanBefore = fs.readFileSync(store.paths.layer(LAYER.HUMAN, 'en'), 'utf8');
    store.writeLayerEntries(LAYER.MACHINE, 'en', { k1: { text: 'uno', status: 'machine', srcHash: 'k1' } });
    store.writeLayerEntries(LAYER.MACHINE, 'en', { k2: { text: 'due', status: 'machine', srcHash: 'k2' } });
    expect(Object.keys(store.readLayer(LAYER.MACHINE, 'en')).sort()).toEqual(['k1', 'k2']);
    expect(fs.readFileSync(store.paths.layer(LAYER.HUMAN, 'en'), 'utf8')).toBe(humanBefore);
  });

  it('writes one file per job through appendJobLog, and listJobs enumerates them', () => {
    const store = createStore({ baseDir });
    const f = store.appendJobLog({ id: 'abc', at: '2026-09-03T10:00:00.000Z', items: [], failures: [], result: 'ok' });
    expect(fs.existsSync(f)).toBe(true);
    expect(store.listJobs()).toHaveLength(1);
  });
});

describe('crash safety: an interrupted write (a rename that throws)', () => {
  it('preserves the pre-existing file and leaves no corrupt temporary behind', () => {
    // A normal store writes batch 1.
    const good = createStore({ baseDir });
    good.writeLayerEntries(LAYER.MACHINE, 'en', { k1: { text: 'uno', status: 'machine', srcHash: 'k1' } });
    const before = fs.readFileSync(good.paths.layer(LAYER.MACHINE, 'en'), 'utf8');

    // A store with an injected fs whose renameSync throws: this simulates a
    // crash halfway through writing batch 2.
    let renameCalls = 0;
    const faultyFs = {
      ...fs,
      renameSync: () => {
        renameCalls++;
        throw new Error('simulated crash during rename');
      },
    };
    const faulty = createStore({ baseDir, fsImpl: faultyFs });

    expect(() =>
      faulty.writeLayerEntries(LAYER.MACHINE, 'en', { k2: { text: 'due', status: 'machine', srcHash: 'k2' } })
    ).toThrow(/simulated crash/);
    expect(renameCalls).toBe(1);

    // The pre-existing file (batch 1) is intact and valid.
    const after = fs.readFileSync(good.paths.layer(LAYER.MACHINE, 'en'), 'utf8');
    expect(after).toBe(before);
    expect(Object.keys(JSON.parse(after))).toEqual(['k1']);

    // No temporary file left behind.
    const leftovers = fs.readdirSync(good.paths.machineDir).filter((n) => n.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });
});

describe('archiveKeys (non-destructive collection)', () => {
  it('moves the named keys out of BOTH layers, each into the archive beside its own layer', () => {
    const store = createStore({ baseDir });
    store.writeLayer(LAYER.HUMAN, 'en', {
      keep: { text: 'tieni', status: 'seed', srcHash: 'keep' },
      drop: { text: 'butta (umano)', status: 'seed', srcHash: 'drop' },
    });
    store.writeLayer(LAYER.MACHINE, 'en', {
      drop: { text: 'butta (macchina)', status: 'machine', srcHash: 'drop' },
      gone: { text: 'via', status: 'machine', srcHash: 'gone' },
    });
    const moved = store.archiveKeys('en', ['drop', 'gone']);
    expect(moved).toBe(2); // distinct keys that left the live memory
    expect(Object.keys(store.readLayer(LAYER.HUMAN, 'en'))).toEqual(['keep']);
    expect(Object.keys(store.readLayer(LAYER.MACHINE, 'en'))).toEqual([]);
    expect(store.readArchive(LAYER.HUMAN, 'en').drop.text).toBe('butta (umano)');
    expect(Object.keys(store.readArchive(LAYER.MACHINE, 'en')).sort()).toEqual(['drop', 'gone']);
  });
});

describe('stableStringify', () => {
  it('sorts keys recursively and ends with a newline', () => {
    const out = stableStringify({ z: 1, a: { y: 2, x: 3 } });
    expect(out).toBe('{\n  "a": {\n    "x": 3,\n    "y": 2\n  },\n  "z": 1\n}\n');
  });

  it('throws on a circular reference, so the write would fail cleanly', () => {
    const o = {};
    o.self = o;
    expect(() => stableStringify(o)).toThrow(/circular/);
  });
});
