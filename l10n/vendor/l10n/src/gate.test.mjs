import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import { keyOf } from './normalize.mjs';
import { computeWorklist, orphanKeys, humanLine, hasWork } from './gate.mjs';

/** Builds a catalog from a list of source strings. */
function catalogOf(sources, format = 'text') {
  const units = {};
  for (const s of sources) {
    units[keyOf(s)] = { source: s, format, usages: [{ file: 'content/it/x.json', path: 'blocks[0]' }] };
  }
  return { generated_at: '2026-09-03T00:00:00.000Z', source_lang: 'it', units };
}

/** Builds a TM (a key→entry map) from a list of already-translated strings. */
function tmOf(sources, lang) {
  const tm = {};
  for (const s of sources) {
    const k = keyOf(s);
    tm[k] = { text: `[${lang}] ${s}`, status: 'machine', srcHash: k, at: '2026-09-03T00:00:00.000Z' };
  }
  return tm;
}

describe('computeWorklist', () => {
  it('reports up-to-date when every string exists in every target language', () => {
    const catalog = catalogOf(['Uno', 'Due']);
    const tmByLang = { en: tmOf(['Uno', 'Due'], 'en') };
    const wl = computeWorklist(catalog, { targets: ['en'], tmByLang });
    expect(wl).toEqual({ status: 'up-to-date' });
    expect(hasWork(wl)).toBe(false);
  });

  it('reports the missing slots', () => {
    const catalog = catalogOf(['Uno', 'Due', 'Tre']);
    const tmByLang = { en: tmOf(['Uno'], 'en') };
    const wl = computeWorklist(catalog, { targets: ['en'], tmByLang });
    expect(wl.status).toBe('work');
    expect(wl.targets).toEqual(['en']);
    expect(wl.items).toHaveLength(2); // "Due" and "Tre" are missing
    for (const it of wl.items) {
      expect(it.missing).toEqual(['en']);
      expect(it.srcHash).toMatch(/^[0-9a-f]{16}$/);
      expect(typeof it.source).toBe('string');
      expect(it.format).toBe('text');
    }
    expect(wl.orphans).toEqual([]);
  });

  it('turns a changed source into a missing new key plus an orphaned old key', () => {
    // The TM holds the old string; the catalog now carries the edited version.
    const oldKey = keyOf('Testo originale');
    const catalog = catalogOf(['Testo modificato']);
    const tmByLang = { en: { [oldKey]: { text: 'Original text', status: 'machine', srcHash: oldKey } } };
    const wl = computeWorklist(catalog, { targets: ['en'], tmByLang });
    expect(wl.status).toBe('work');
    // The new key is missing.
    expect(wl.items).toHaveLength(1);
    expect(wl.items[0].srcHash).toBe(keyOf('Testo modificato'));
    expect(wl.items[0].missing).toEqual(['en']);
    // The old key is orphaned.
    expect(wl.orphans).toEqual([oldKey]);
  });

  it('treats an added language as every string missing in it', () => {
    const catalog = catalogOf(['Uno', 'Due']);
    const tmByLang = { en: tmOf(['Uno', 'Due'], 'en'), de: {} };
    const wl = computeWorklist(catalog, { targets: ['en', 'de'], tmByLang });
    expect(wl.status).toBe('work');
    expect(wl.items).toHaveLength(2);
    for (const it of wl.items) {
      expect(it.missing).toEqual(['de']); // en is already covered, de entirely missing
    }
  });

  it('orders the items deterministically, by key', () => {
    const catalog = catalogOf(['zeta', 'alfa', 'mu']);
    const wl = computeWorklist(catalog, { targets: ['en'], tmByLang: { en: {} } });
    const keys = wl.items.map((it) => it.srcHash);
    expect(keys).toEqual([...keys].sort());
  });

  it('carries the context field through when present', () => {
    const units = {
      [keyOf('Bottone')]: { source: 'Bottone', context: 'CTA label', format: 'text', usages: [] },
    };
    const catalog = { generated_at: 'x', source_lang: 'it', units };
    const wl = computeWorklist(catalog, { targets: ['en'], tmByLang: { en: {} } });
    expect(wl.items[0].context).toBe('CTA label');
  });

  it('carries the protected spans through when present, and adds no field when absent', () => {
    const units = {
      [keyOf('Run `x`')]: { source: 'Run `x`', format: 'markdown', usages: [], protected: [[4, 7]] },
      [keyOf('Plain')]: { source: 'Plain', format: 'text', usages: [] },
    };
    const wl = computeWorklist({ generated_at: 'x', source_lang: 'en', units }, { targets: ['it'], tmByLang: { it: {} } });
    const bySource = Object.fromEntries(wl.items.map((it) => [it.source, it]));
    expect(bySource['Run `x`'].protected).toEqual([[4, 7]]);
    expect(Object.keys(bySource.Plain).sort()).toEqual(['format', 'missing', 'source', 'srcHash']);
  });
});

describe('orphanKeys', () => {
  it('finds the TM keys with no unit in the catalog, deduplicated and sorted', () => {
    const catalog = catalogOf(['vivo']);
    const oa = keyOf('morto-a');
    const ob = keyOf('morto-b');
    const tmByLang = {
      en: { [keyOf('vivo')]: {}, [oa]: {}, [ob]: {} },
      de: { [oa]: {} }, // duplicated across languages → reported once
    };
    expect(orphanKeys(catalog, tmByLang)).toEqual([oa, ob].sort());
  });
});

describe('humanLine', () => {
  it('summarizes the up-to-date case', () => {
    expect(humanLine({ status: 'up-to-date' })).toBe('no translation needed');
    expect(humanLine(null)).toBe('no translation needed');
  });

  it('counts strings and language slots in the work case', () => {
    const wl = {
      status: 'work',
      items: [{ missing: ['en', 'de'] }, { missing: ['de'] }],
    };
    expect(humanLine(wl)).toBe('2 strings, 3 language slots to translate');
  });
});
